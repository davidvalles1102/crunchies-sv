# Deployment a Producción — Crunchies POS

> Generado 2026-07-14. Este documento es honesto sobre lo que se pudo verificar desde este entorno y lo que **no** — no tengo acceso a tu Supabase de producción, a tu cuenta de Vercel, ni a tu DNS. Donde digo "no lo sé", es literal: no asumas que ya está hecho solo porque el código o los docs lo dan por sentado.

---

## 0. Lo más importante primero — 3 cosas que probablemente no sabías que faltan

1. **El trabajo de esta rama no está en `main` todavía.** `chris_v1` está 23 commits adelante de `main`, y `main` no tiene ningún commit que `chris_v1` no tenga (o sea, no hay conflicto, solo falta el merge). Además, ahora mismo hay **16 archivos modificados y 4 nuevos sin commitear** en el working tree (todo el trabajo de esta sesión: multitenant docs, fix de login, reversa de IVA, quitar Nequi, `PROCESS_FLOWS.md`). Si el deploy de producción en Vercel sigue la rama `main` (el default típico), **nada de esto está en producción hoy**, sin importar qué migraciones hayan corrido en la base de datos.
2. **Dev y "producción" parecen ser el mismo proyecto de Supabase.** `web-next/.env.local` y `web-next/.env.local.example` apuntan exactamente a la misma URL (`https://gnjwwhuuzwcxcuqzevyn.supabase.co`). No hay evidencia en el repo de un segundo proyecto Supabase para producción — lo cual sugiere que **todo lo que se probó en esta sesión (login real, curl contra el endpoint de auth, la reversa del IVA que ya confirmaste) se hizo contra la misma base que usaría el negocio real.** Si es así, no hay separación entre "estoy probando" y "esto es real" — cualquier prueba futura debería hacerse con cuidado. Confírmalo tú: si tienes un proyecto Supabase distinto para producción, dímelo y hay que apuntar `.env` de Vercel a ese, no al de `.env.local`.
3. **El hosting de prueba de esta sesión (túnel de Cloudflare) es temporal y ya no existe** en cuanto cierre el proceso — no es infraestructura real. La URL de producción real, según el `README.md` del repo, sería `https://crunchies-next.vercel.app` (proyecto Vercel `crunchies-next`) — pero **no pude verificar que ese proyecto de Vercel exista de verdad** (no tengo acceso a Vercel, y no hay carpeta `.vercel/` local con el link al proyecto). Es lo que dice la documentación, no algo que yo haya confirmado.

---

## 1. Migraciones SQL pendientes

### Lo que sé con certeza vs. lo que asumo

`supabase/MIGRATIONS.md` es la fuente de verdad documentada del orden de migraciones, pero su sección "Estado actual de la DB" está fechada **2026-06-28** y describe una base bastante más primitiva de lo que el código actual asume (no tenía `menu_items`, `payments`, etc. — tablas que hoy son usadas por todo el sistema). Es decir, **ese snapshot está desactualizado** y no puedo usarlo como fuente confiable de "qué ya corrió".

Lo único que verifiqué de forma directa contra tu proyecto real de Supabase esta sesión:
- El login de `/admin/login` funciona contra `auth.users` / `profiles` reales (lo probé con curl y en navegador).
- Confirmaste tú mismo que `tenant_settings.tax_enabled = false` para `crunchies-root` — lo cual **solo es posible si las migraciones #15 (`tenant_foundation.sql`) y #21 (`fiscal.sql`) ya corrieron**, porque esa tabla y esa columna no existen antes de esas dos.

Eso es todo lo que puedo confirmar con evidencia real. Todo lo demás (inventario, caja, fiado, RLS multitenant completo) **puede o no haber corrido** — el hecho de que el código compile y los tests de integración pasen no prueba nada sobre tu base real, porque esos tests corren contra Postgres embebido (PGlite), no contra Supabase.

### Qué hacer: correr esta query primero, en tu Supabase real

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'tenants', 'tenant_members', 'tenant_settings', 'tenant_plan_subscriptions',
    'inventory_items', 'inventory_movements', 'recipe_items',
    'cash_sessions', 'cash_session_movements',
    'customer_credit_accounts', 'customer_credit_transactions',
    'staff_members', 'menu_items', 'payments', 'loyalty_transactions'
  )
order by table_name;
```

Compara el resultado contra la lista de abajo. Cualquier tabla que **no aparezca** en el resultado significa que la migración correspondiente no ha corrido.

### Lista completa en orden (desde `supabase/`)

Ejecutar en Supabase → SQL Editor → New Query, en este orden exacto. Todas son idempotentes salvo donde se indica.

| # | Archivo | Qué crea/verifica su existencia |
|---|---------|----------------------------------|
| — | `migrations/URGENT_enable_rls_legacy_tables.sql` | 🚨 Marcado como urgente en `MIGRATIONS.md` independientemente del resto — habilita RLS real en `profiles`/`categories`/`orders`/`order_items`, que según ese doc nunca lo tuvieron habilitado de verdad. **Verifica esto antes que nada.** |
| 1 | `create_missing_tables.sql` | `menu_items`, `restaurant_tables`, `payments`, `loyalty_transactions`, `reservations`, `modifier_groups`, `modifier_options`, `menu_item_modifier_groups`, `order_item_modifiers`, `expenses` |
| 2 | `fix_delivery_status_constraint.sql` | Columnas delivery en `orders` + constraint correcto |
| 3 | `migrations/add_payment_method.sql` | Columna `payment_method` (histórico — su CHECK original incluía `'nequi'`, ver #26) |
| 4 | `schema/delivery_management_schema.sql` | `driver_id`, `delivery_zone_id`, `delivery_fee` en `orders` |
| 5 | `migrations/anon_ordering_rls.sql` | RLS para pedidos anónimos vía QR |
| 6 | `migrations/fix_tables_and_rls.sql` | RLS para clientes autenticados pidiendo desde QR |
| 7 | `migrations/customer_notes_rls.sql` | Permisos de notas en órdenes |
| 8 | `migrations/reorganize_tables.sql` | Limpieza de mesas ocupadas sin orden activa |
| 9 | `migrations/loyalty_points_fix.sql` | Trigger de puntos |
| 10 | `migrations/enable_realtime.sql` | Realtime en `orders`/`order_items` |
| 11 | `menu/archive/insert_menu_items_nuevos.sql` | Items iniciales de menú (histórico) |
| 12 | `menu/archive/update_menu.sql` + `update_menu_images.sql` | Actualizaciones de menú (histórico) |
| 13 | `menu/archive/update_prices_sv.sql` | Ajuste de precios (histórico) |
| 14 | `staff_pins_schema.sql` | `staff_members`, RPC `verify_staff_pin` — sistema de PIN |
| 15 | `migrations/tenant_foundation.sql` | `tenants`, `tenant_members`, `tenant_settings`, `tenant_plan_subscriptions`, `inventory_items`, `inventory_movements`, tenant raíz `crunchies-root` |
| 16 | `migrations/tenant_aware_rls.sql` | RLS tenant-aware en todas las tablas operativas |
| 17 | `migrations/tenant_onboarding.sql` | RPC `create_tenant()` |
| 18 | `migrations/cash_sessions.sql` | `cash_sessions`, `cash_session_movements`, RPCs de cierre de caja |
| 19 | `migrations/inventory.sql` | `recipe_items`, trigger de consumo automático, vista `low_stock_items` |
| 20 | `migrations/billing.sql` | Enforcement de plan/suspensión |
| 21 | `migrations/fiscal.sql` | `tenant_settings.tax_rate` (default 13%), fila de `crunchies-root` en 0% |
| 22 | `migrations/customer_credit.sql` | `customer_credit_accounts`, `customer_credit_transactions`, fiado |
| 23 | `migrations/menu_item_cost.sql` | `menu_items.cost` |
| 24 | ~~`migrations/enable_root_tenant_tax.sql`~~ | **No correr** — fue el error de contexto que activó IVA 13% en `crunchies-root`. Revertido por #25. |
| 25 | `migrations/disable_root_tenant_tax.sql` | `tax_enabled = false` en `crunchies-root`. **Confirmado corrido por ti hoy.** |
| 26 | `migrations/remove_nequi_payment_method.sql` | Quita `'nequi'` del CHECK de `orders.payment_method`, deja solo `('cash','card')`. **No confirmado — corre esta antes del deploy si aún no lo hiciste.** |

> Nota sobre `portal_staff_rls.sql`: existe en `supabase/migrations/` pero no está listada en la tabla de `MIGRATIONS.md` con número — revísala manualmente, parece RLS adicional para los portales PIN.

---

## 2. Variables de entorno para producción

Estas son **todas** las variables que el código realmente lee (grep completo de `process.env.*` en `web-next/`):

| Variable | Pública (`NEXT_PUBLIC_*`) | Qué es | ¿Reusar la de dev? |
|----------|:---:|--------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto Supabase | Solo si dev y prod comparten proyecto (ver punto 0.2) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Anon key pública de Supabase | Igual que arriba |
| `NEXT_PUBLIC_ORDERING_ENABLED` | Sí | Feature flag: `true` = `/order` permite pedir online de verdad, `false` = solo vitrina de menú (sin carrito) | **Decisión de negocio, no técnica.** Hoy en `.env.local` está en `false`. Confirma con el cliente si quiere pedidos online activos desde el día 1 o después. |
| `PORTAL_KITCHEN_EMAIL` / `PORTAL_KITCHEN_PASSWORD` | No (server-only) | Credenciales de la cuenta compartida de cocina, usadas por `/api/portal/auth` | **No.** Genera credenciales nuevas para producción — las de dev pudieron quedar expuestas en logs/historial de terminal durante las pruebas de esta sesión. |
| `PORTAL_DELIVERY_EMAIL` / `PORTAL_DELIVERY_PASSWORD` | No | Igual, para delivery | **No**, mismo motivo |
| `PORTAL_WAITER_EMAIL` / `PORTAL_WAITER_PASSWORD` | No | Igual, para mesero | **No**, mismo motivo |

**Importante sobre las cuentas `PORTAL_*`:** no son solo variables de entorno — cada una corresponde a un usuario real que debe existir en Supabase Auth (Authentication → Users) con ese email/password exacto, además de la variable de entorno en Vercel. Si rotas la password en el `.env` de Vercel sin actualizarla también en Supabase Auth, el login por PIN se rompe silenciosamente (esto es exactamente el tipo de bug que ya encontramos una vez esta sesión — un mismatch entre dos lugares que deberían estar sincronizados).

Las variables `NEXT_PUBLIC_*` se configuran en Vercel → Project Settings → Environment Variables. Las que no son públicas también van ahí, pero marcadas solo para el entorno de servidor (no se exponen al navegador).

---

## 3. Build y deploy

Según `README.md` (no verificado por mí — no tengo acceso a Vercel):

- **Hosting:** Vercel, proyecto `crunchies-next` → `crunchies-next.vercel.app`.
- **Root Directory:** `web-next` (el repo tiene el código de Next.js ahí, no en la raíz).
- **Framework:** Next.js, autodetectado por Vercel.
- **Build command:** el default de Vercel para Next.js (`next build`) — verificado que corre limpio en este entorno (`npm run build` sin errores, ver sección 4).

Pasos concretos:

1. Mergear `chris_v1` a `main` (o repunta el Production Branch de Vercel a `chris_v1` si prefieres probar ahí primero) — sin esto, el punto 0.1 aplica.
2. Confirmar/crear el proyecto Vercel apuntando a este repo de GitHub (`davidvalles1102/neon-y-sabor`), Root Directory `web-next`.
3. Cargar las variables de entorno de la sección 2 en Vercel (Production, y Preview si usas ramas de prueba).
4. Deploy. Vercel lo dispara automático en cada push a la rama de producción configurada.
5. Si el dominio final no es `crunchies-next.vercel.app` sino uno propio (ej. `crunchies.sv` o similar) — no encontré ninguna configuración de dominio custom en el repo. Eso se configura en Vercel → Domains, apuntando los DNS del dominio real ahí. Si el cliente ya tiene un dominio comprado, dímelo y lo documento; si no, este es un paso pendiente de decidir con el cliente antes de mandarle el link "final".

---

## 4. Checklist de verificación post-deploy

Local, ya verificado en esta sesión (no específico de producción, pero es la base):
- [x] `npm run build` compila sin errores.
- [x] `npm run lint` sin warnings.
- [x] `npm run test` (12/12) y `npm run test:db` (14/14) pasan.

**Pendiente de verificar en el dominio de producción real**, uno por uno, con navegador real (no solo `curl` — ya aprendimos en esta sesión que un `200 OK` no prueba que el JS del cliente funcione):

- [ ] `/admin/login` carga, el botón no se queda pegado en "Cargando...", y el login con la cuenta admin real funciona.
- [ ] `/admin/kitchen` recibe un pedido nuevo en tiempo real (crear un pedido de prueba desde `/table-order` o el POS y confirmar que aparece sin refrescar la página).
- [ ] Un pedido de prueba completo end-to-end: mesa → cocina → listo → entregado → cobrado → mesa se libera (`restaurant_tables.status = 'available'`) → recibo se genera.
- [ ] Apertura y cierre de caja: abrir sesión, registrar el pedido de prueba como efectivo, cerrar caja, confirmar que `compute_cash_session_expected` calculó el monto correcto.
- [ ] Login por PIN en los 3 portales (`/portal/kitchen`, `/portal/waiter`, `/portal/delivery`) con las cuentas `PORTAL_*` **de producción** (no las de dev).
- [ ] Confirmar que el pedido de prueba **no** cobró IVA (dado que `tax_enabled=false` para `crunchies-root`).
- [ ] Confirmar que el método de pago en `/order` (si `NEXT_PUBLIC_ORDERING_ENABLED=true`) solo ofrece Efectivo — no debería aparecer Tarjeta como opción visible todavía (el selector sigue oculto por diseño, ver conversación previa).
- [ ] Borrar cualquier dato de prueba que se genere durante esta verificación antes de que el cliente empiece a usarlo de verdad (pedidos de prueba, sesión de caja de prueba, etc.) — o dejarlo claro que son datos de setup, no ventas reales, para que no ensucien los reportes de Finanzas del primer día.

---

## 5. Bugs conocidos — documentados, no bloqueantes, recomendado arreglar pronto

Encontrados durante la auditoría de esta sesión. Ninguno impide operar el negocio día a día; ambos degradan la exactitud de reportes/inventario con el tiempo.

1. **COGS histórico sin snapshot de costo.** `FinanceClient.tsx` calcula el margen de órdenes pasadas usando el costo *actual* de `menu_items.cost`, no el costo que estaba vigente cuando se vendió cada platillo. Cambiar el costo de un insumo hoy reescribe retroactivamente todos los reportes de margen anteriores. Fix recomendado: guardar el costo unitario en `order_items` al momento de la venta (como ya se hace con `item_price`), en vez de recalcularlo después.
2. **Inventario no se revierte al editar/quitar un ítem de una orden antes de pagar.** El trigger de consumo automático (`apply_recipe_consumption`) solo corre en `INSERT` sobre `order_items`. Si se reduce cantidad o se elimina un ítem antes de cobrar, el stock ya descontado no se restaura — el inventario puede ir quedando desfasado con el uso normal (correcciones de mesero, cliente que cambia de pedido). Fix recomendado: trigger equivalente en `UPDATE`/`DELETE` de `order_items` que revierta la porción correspondiente del movimiento de inventario.

Ver la auditoría completa (incluye hallazgos sobre el realtime de cocina, ya mitigados con `useLiveRefetch`) más arriba en esta conversación.

---

## 6. Otras cosas a decidir antes de que un negocio real dependa de esto

- **Backups de la base de datos.** No encontré ninguna configuración de backup automatizado en el repo (es configuración de Supabase, no de código — revisa el plan de tu proyecto Supabase; el plan gratuito tiene retención de backups muy limitada).
- **Quién tiene acceso al SQL Editor de producción.** Varias veces en esta sesión la solución a un problema fue "corre esta query en el SQL Editor" — en producción, con datos reales de un negocio, eso debería estar limitado a quien realmente entienda el impacto (ya vimos con el IVA que un error de contexto ahí afecta directamente lo que se le cobra a un cliente real).
- **Monitoreo de errores.** No hay Sentry ni nada equivalente configurado — si algo se rompe en producción, hoy la única forma de enterarte es que el cliente te avise o que revises los logs de Vercel manualmente.
- **El flag `NEXT_PUBLIC_ORDERING_ENABLED`** (sección 2) es una decisión de producto pendiente, no técnica — confírmala con el cliente antes del deploy final.
