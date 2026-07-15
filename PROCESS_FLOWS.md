# Flujos de Negocio — Crunchies POS

> Generado 2026-07-14 a partir del código real en `web-next/` y `supabase/` (rama `chris_v1`), no de intención de producto. Cada paso cita el archivo/función que lo implementa. Si el código cambia, este documento puede quedar desactualizado — no es la fuente de verdad, el código lo es.

---

## A) Flujo interno / operativo

### A0. Acceso del personal

Dos sistemas de login distintos, según el rol:

- **Admin / mesero (login completo):** `/admin/login` (`web-next/app/admin/login/LoginClient.tsx`) — email + password vía Supabase Auth (`supabase.auth.signInWithPassword`). El guard `useRequireRole(roles[])` en `web-next/app/admin/AdminContext.tsx` protege cada página bajo `app/admin/(protected)/`.
- **Cocina / mesero / delivery (cuenta compartida, PIN):** `/portal/kitchen`, `/portal/waiter`, `/portal/delivery` (`web-next/app/portal/`). El personal ingresa un PIN de 4 dígitos en `PinPad.tsx`, que se verifica server-side vía `POST /api/portal/auth` (`web-next/app/api/portal/auth/route.ts`) contra la RPC `verify_staff_pin` (`supabase/staff_pins_schema.sql`). El servidor traduce el PIN a la cuenta compartida real (`PORTAL_KITCHEN_EMAIL`, etc. en `.env.local`) y hace `signInWithPassword` sin exponer esa contraseña al navegador. 5 intentos fallidos bloquean la cuenta 15 min (`staff_members.failed_attempts` / `locked_until`).

### A1. Toma de la orden

Tres puntos de entrada posibles, todos terminan en las mismas tablas (`orders` / `order_items`):

1. **POS de mostrador** — `/admin/orders` (`OrdersClient.tsx`): mesero/admin arma el ticket, agrega modificadores, confirma. `addItemToTicket()` inserta en `order_items` y actualiza `orders.subtotal/tax/total`.
2. **Mesa vía QR (cliente mismo)** — `/table-order?table=<id>` (`TableOrderClient.tsx`): el cliente ordena desde su celular, la orden se crea directo con `order_type: 'dine_in'` y `status: 'in_kitchen'` (sin pasar por `'open'`), para que cocina la vea de inmediato.
3. **Portal de mesero con PIN** — `/portal/waiter` (`WaiterPortalClient.tsx`): mismo patrón que el POS pero para personal sin cuenta de admin.

Si se agrega un ítem a una orden que ya está en `ready`/`delivered`, el código la reenvía automáticamente a `in_kitchen` (`OrdersClient.tsx` y `WaiterPortalClient.tsx`, variable `reopenKitchen`) — cocina no se la puede perder.

### A2. Cocina en tiempo real

- **Display completo (con sesión admin/waiter):** `/admin/kitchen` (`KitchenClient.tsx`).
- **Display solo-PIN:** `/portal/kitchen` (`KitchenPortalClient.tsx`).

Ambos se suscriben a Supabase Realtime: canal `kitchen-live`, `postgres_changes` sobre **todos los eventos** de la tabla `orders` (sin filtro), y en cualquier evento vuelven a pedir la lista completa (`loadOrders()` + `loadHistory()`) en vez de parchear estado incrementalmente.

Como respaldo — porque en móvil, con la pantalla apagada o la pestaña en segundo plano, el navegador puede matar el websocket sin avisar — **todas** las pantallas operativas (`KitchenClient`, `KitchenPortalClient`, `WaiterPortalClient`, `DeliveryClient`, `DeliveryPortalClient`, `OrdersClient`, `ReservationsClient` admin) usan el hook compartido `useLiveRefetch()` (`web-next/lib/useLiveRefetch.ts`): refresca al volver el foco/visibilidad de la pestaña, y además hace polling cada 15-20s pase lo que pase con el socket.

### A3. Entrega

- **Dine-in:** cocina marca "Listo" → mesero lo ve en el POS (banner en vivo: 🟡 en cocina → ✅ lista → 🍽️ entregada, `OrdersClient.tsx`) → entrega física en mesa.
- **Delivery / para llevar:** `/admin/delivery` (`DeliveryClient.tsx`) o `/portal/delivery` (`DeliveryPortalClient.tsx`). `delivery_status` avanza por separado de `orders.status`: `pending → preparing → ready → on_the_way → delivered`, sincronizado (`preparing` ⇒ `orders.status = 'in_kitchen'`). Asignación de repartidor: `assignDriver()` actualiza `orders.driver_id`.

### A4. Cierre de mesa y cobro

El pago se procesa desde el POS (`OrdersClient.tsx`, modal de pago): efectivo, tarjeta, transferencia, o **fiado** (crédito de cliente, ver A6). Al confirmar pago:
- `orders.status = 'paid'`.
- Si era dine-in, `restaurant_tables.status = 'available'` (libera la mesa).
- Se genera recibo PDF de 80mm (`receipt-pdf.ts`) y opción de enviarlo por WhatsApp.
- Si hay cliente vinculado, se acreditan puntos de lealtad (ver B4).

### A5. Inventario — consumo automático por receta

`supabase/migrations/inventory.sql`: cada `menu_item` puede tener una receta en `recipe_items` (cuánto de cada insumo consume una unidad vendida). Un trigger `trg_order_item_recipe_consumption` (función `apply_recipe_consumption()`, `SECURITY DEFINER`) corre **automáticamente** después de cada `INSERT` en `order_items` — descuenta `inventory_items.stock_on_hand` y registra el movimiento en `inventory_movements` (tipo `'out'`, motivo `'venta'`). No depende de que el mesero tenga rol de inventario ni de que nadie lo haga manualmente. Vista `low_stock_items` para alertas de reorden. UI: `/admin/inventory` (`InventoryClient.tsx`).

### A6. Fiado / crédito de cliente

`supabase/migrations/customer_credit.sql`. Al cobrar con método `'credit'`, se llama la RPC `charge_customer_credit()` — respeta el límite de crédito del cliente (`customer_credit_accounts.credit_limit`) y rechaza el cargo si lo excede. Los abonos usan `record_credit_payment()`, que reduce el balance. UI: `/admin/credit` (`CreditClient.tsx`).

### A7. Caja / cierre de turno

`supabase/migrations/cash_sessions.sql`. Un cajero abre una sesión (`cash_sessions`), los movimientos de efectivo quedan en `cash_session_movements`. Al cerrar: `compute_cash_session_expected(session_id)` calcula el monto esperado según lo cobrado en efectivo durante la sesión, y `close_cash_session(session_id, counted_amount, notes)` registra el monto contado y la diferencia (faltante/sobrante). UI: `/admin/cash` (`CashClient.tsx`).

---

## B) Flujo del cliente

### B1. Llegada

Tres caminos, sin necesidad de cuenta en ninguno de los tres:

1. **QR de mesa** — escanea el código en la mesa física → `/table-order?table=<id>` (generado y descargable desde `/admin/tables`, `TablesClient.tsx`) → ve el menú, arma su pedido, confirma → orden nace en `in_kitchen` directo (ver A1.2).
2. **Pedido online (para llevar / domicilio)** — `/order` (`OrderClient.tsx`): elige para llevar o domicilio, si es domicilio elige zona (`delivery_zones`, con `delivery_fee` asociado), método de pago (efectivo o tarjeta).
3. **Reservación** — `/reservations` (público, `ReservationsClient.tsx` en `app/reservations/`): crea o consulta sus propias reservas. El staff las gestiona en `/admin/reservations`.

Ninguno de los tres exige login — `anon` puede insertar la orden (`customer_id IS NULL`), RLS lo permite explícitamente para pedidos por QR/web.

### B2. Seguimiento del pedido

- **Con cuenta:** `/mis-pedidos` (`MisPedidosClient.tsx`) — historial completo + estado en vivo del pedido activo.
- **Sin cuenta:** `/track` (`TrackClient.tsx`) — sigue un pedido puntual por ID, sin login. Ambas pantallas se suscriben a `postgres_changes` UPDATE sobre `orders` filtrado a la orden del cliente, con el mismo respaldo de `useLiveRefetch` que el lado operativo.

### B3. Pago

Efectivo o tarjeta en el momento de la entrega (para llevar/domicilio), o en el POS si es dine-in y el mesero cierra la cuenta. El cálculo de subtotal/impuesto/total pasa siempre por `calcTotals()` (`web-next/lib/format.ts`) con la tasa de impuesto real del tenant (`tenant_settings.tax_enabled` / `tax_rate`) — nunca hardcodeada por pantalla.

### B4. Puntos de lealtad

Definido en `OrdersClient.tsx`: `POINT_VALUE = 0.01` (cada punto vale $0.01 USD), acumulación `earnedPts = Math.floor(total_pagado)` → **1 punto por cada $1 pagado**. Canje: máximo 50% del total de la orden (`MAX_REDEEM_PERCENT = 0.5`), a $0.01 por punto. Cada movimiento queda en `loyalty_transactions` (`type: 'earned' | 'redeemed'`). El cliente ve su saldo e historial en `/profile` (`ProfileClient.tsx`); el staff puede ajustarlo manualmente desde `/admin/customers`.

---

## Nota sobre impuestos (contexto Crunchies SV)

Crunchies SV **no** es contribuyente formal — no cobra IVA ni emite factura electrónica (DTE). El tenant `crunchies-root` tiene `tenant_settings.tax_enabled = false` (revertido explícitamente vía `supabase/migrations/disable_root_tenant_tax.sql` tras una activación por error de contexto). No existe ningún módulo de DTE en el código — es trabajo futuro si algún día se necesita, no algo desactivado detrás de un flag hoy.
