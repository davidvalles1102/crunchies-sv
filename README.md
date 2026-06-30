# Crunchies — Sistema POS & Pedidos en Línea

Restaurante de pollo, alitas y chunks. Este repositorio contiene el sistema completo: punto de venta (POS) para el personal, panel de cocina en tiempo real, y sitio web para clientes con pedidos en línea, delivery y pedido por QR desde la mesa.

> **Nota:** este proyecto fue migrado de un sitio estático en HTML/Vanilla JS a **Next.js**. Todo el código vive en [`web-next/`](web-next/) — no hay archivos `.html` ni JS suelto en el repo.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19 + TypeScript |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth (JWT) |
| Tiempo real | Supabase Realtime (`postgres_changes`) |
| Hosting | Vercel |
| Recibos | jsPDF (formato 80 mm) |
| Gráficas | Chart.js v4 |
| Códigos QR | `qrcode` |

Todo el código de cliente vive en Client Components (`'use client'`) que consumen Supabase directamente desde el navegador; no hay capa de API propia — Supabase + RLS hacen ese trabajo.

---

## Flujo del Sistema

```
Cliente escanea QR de mesa / abre el sitio
        │
        ▼
  Navega el menú → agrega items → confirma pedido
        │
        ▼
  Orden llega a la cocina (Realtime) ──────────────────────────────────┐
        │                                                               │
        ▼                                                               ▼
  Staff ve la orden en el POS (/admin/orders)            Cocina ve la tarjeta en /admin/kitchen
        │ (banner en vivo: 🟡 en cocina → ✅ lista)                      │
        ▼                                                               ▼
  Cocina marca "Listo" ──────────────────────────────── Cliente ve el estado en /mis-pedidos o /track
        │
        ▼
  Mesero entrega → POS procesa pago → recibo PDF / WhatsApp
        │
        ▼
  Sistema suma puntos de lealtad al cliente
```

Si se agrega o aumenta un platillo a una orden que ya estaba `ready`/`delivered` (ej. la mesa pide algo extra), el POS la reenvía automáticamente a `in_kitchen` para que cocina no se la pierda.

---

## Estructura del Proyecto (`web-next/`)

```
web-next/
├── app/
│   ├── page.tsx                      ← Vitrina pública del menú (home)
│   ├── components/
│   │   ├── MenuSection.tsx           ← Grid de categorías + platillos
│   │   ├── NavBar.tsx
│   │   └── ToastProvider.tsx         ← Notificaciones globales
│   │
│   ├── auth/                         ← Login / registro cliente
│   ├── order/                        ← Pedido online (para llevar / domicilio)
│   ├── table-order/                  ← Pedido desde la mesa vía QR (?table=<id>)
│   ├── mis-pedidos/                  ← Historial + estado en vivo del cliente
│   ├── track/                        ← Seguimiento de un pedido por ID (sin login)
│   ├── reservations/                 ← Reservaciones (cliente)
│   ├── profile/                      ← Puntos de lealtad, historial, cuenta
│   │
│   ├── admin/
│   │   ├── login/
│   │   ├── kitchen/                  ← Display de cocina (fuera del grupo protegido,
│   │   │                                solo exige sesión — sin gate de rol específico)
│   │   ├── components/               ← Sidebar, Topbar, LiveClock
│   │   ├── styles/admin.css          ← Layout sidebar/topbar + POS + cocina
│   │   └── (protected)/              ← Requiere rol admin/waiter via useRequireRole()
│   │       ├── dashboard/
│   │       ├── orders/               ← Terminal POS (menú + ticket + pago + recibo)
│   │       ├── delivery/             ← Gestión de domicilio/para llevar
│   │       ├── tables/               ← Mesas + generación de QR
│   │       ├── payments/             ← Historial de pagos
│   │       ├── menu-management/      ← CRUD platillos, categorías, modificadores
│   │       ├── reservations/         ← Gestión de reservaciones (staff)
│   │       ├── reports/              ← Reportes y gráficas
│   │       ├── customers/            ← CRM + ajuste de puntos
│   │       ├── finance/              ← Balance, EDC, datos de prueba
│   │       └── expense-tracker/      ← Registro de gastos
│   │
│   └── styles/                       ← design-system.css, customer.css
│
├── lib/
│   ├── supabase/client.ts            ← Cliente Supabase (browser)
│   ├── supabase/server.ts            ← Cliente Supabase (server components)
│   ├── supabase/auth.ts              ← getSession() helper
│   ├── format.ts                     ← fmt.currency / fmt.date / TAX_RATE / calcTotals
│   ├── modifiers.ts                  ← Helpers de modificadores (selección, precio extra)
│   └── types.ts                      ← Tipos compartidos (Order, MenuItem, etc.)
│
└── public/menu/                      ← Imágenes del menú (servidas localmente)
```

---

## Módulos: Qué Hace Cada Uno

### Sitio Público (Cliente)

| Ruta | Función |
|------|---------|
| `/` | Vitrina del menú. Tabs de categoría, búsqueda, cards con imagen, precio y descripción. |
| `/auth` | Login / registro / reset de contraseña. |
| `/order` | Pedido online: Para Llevar / Domicilio, zonas y costo de envío, efectivo o Nequi. |
| `/table-order?table=<id>` | Igual que `/order` pero `order_type: dine_in`, mesa identificada por la URL del QR. Envía la orden directo a `in_kitchen` (sin paso intermedio). |
| `/mis-pedidos` | Historial del cliente logueado, stepper de estado. |
| `/track` | Seguimiento de un pedido específico por ID, sin necesidad de login. |
| `/reservations` | Crear / ver reservaciones propias. |
| `/profile` | Saldo de puntos de lealtad, historial, edición de perfil. |

### Panel Admin

| Ruta | Función | Roles |
|------|---------|-------|
| `/admin/login` | Login del personal. | Todos |
| `/admin/dashboard` | KPIs del día, gráficas, órdenes activas. | admin, waiter |
| `/admin/orders` | Terminal POS: menú + ticket, modal de pago (efectivo/tarjeta/transferencia, canje de puntos), banner de estado en vivo, recibo PDF + WhatsApp. | admin, waiter |
| `/admin/kitchen` | Display de cocina. Columnas "En Preparación" / "Listo para Servir" + historial del día. Realtime sobre `orders`. | sesión autenticada (filtrado real por RLS a admin/waiter/kitchen) |
| `/admin/delivery` | Tarjetas de domicilio/para llevar, avance de estado, asignación de repartidor. | admin, waiter |
| `/admin/tables` | Mesas + generación/descarga de código QR por mesa y QR de vitrina del menú. | admin, waiter |
| `/admin/payments` | Historial de pagos, reimpresión de recibo. | admin, waiter |
| `/admin/menu-management` | CRUD de categorías, platillos y grupos de modificadores. | admin |
| `/admin/reservations` | Gestión de todas las reservaciones. | admin, waiter |
| `/admin/reports` | KPIs y gráficas (ventas, métodos de pago, categorías, gastos, top platillos). | admin |
| `/admin/customers` | CRM de clientes, historial real de pedidos, ajuste de puntos. | admin |
| `/admin/finance` | Balance financiero. | admin |
| `/admin/expense-tracker` | Registro de gastos por categoría. | admin |

---

## Base de Datos

### Tablas Principales

| Tabla | Descripción |
|-------|-------------|
| `profiles` | Extiende `auth.users`. `role`, `full_name`, `phone`, `loyalty_points`. |
| `categories` | Categorías del menú (`name`, `icon`, `display_order`, `active`). |
| `menu_items` | Platillos (`name`, `description`, `price`, `image_url`, `category_id`, `available`, `is_featured`). |
| `modifier_groups` / `modifier_options` / `menu_item_modifier_groups` | Variantes y extras por platillo (ej. tamaños, "sin cebolla"). |
| `restaurant_tables` | Mesas físicas (`number`, `location`, `capacity`, `status`). |
| `orders` | Encabezado de orden (`status`, `order_type`, `total`, `subtotal`, `tax`, `table_id`, `waiter_id`, datos de delivery, `customer_id`). |
| `order_items` | Líneas de orden (`order_id`, `item_name`, `quantity`, `item_price`, `notes`). |
| `order_item_modifiers` | Modificadores aplicados a cada línea. |
| `payments` | Pagos procesados (`order_id`, `method`, `amount`). |
| `reservations` | Reservaciones (`date`, `time`, `party_size`, `status`). |
| `expenses` | Gastos (`expense_date`, `category`, `amount`). |
| `loyalty_transactions` | Historial de puntos (`customer_id`, `points`, `type`, `order_id`). |
| `delivery_zones` / `drivers` | Zonas de entrega y repartidores. |

### Estados de una Orden (`orders.status`)

```
open → in_kitchen → ready → delivered → paid
                                      ↘ cancelled
```

`delivery_status` (solo para `order_type` delivery/takeout) avanza por separado: `pending → preparing → ready → on_the_way → delivered`, y se sincroniza con `orders.status` (`preparing` ⇒ `in_kitchen`).

### RLS (Row Level Security)

Todas las tablas tienen RLS activa:

- `profiles`: cada usuario lee/edita la suya; admin lee todas.
- `orders` / `order_items`: `anon` puede insertar (pedido por QR/web sin cuenta, `customer_id IS NULL`); `admin`/`waiter`/`kitchen` ven y editan todo.
- `categories` / `menu_items`: lectura pública (`anon`); escritura solo `admin`.
- `expenses`, `drivers`, `delivery_zones`: solo `admin`.

Los scripts de cada cambio de schema están organizados en `supabase/` (`schema/`, `migrations/`, `seed/`, `menu/` — ver [`supabase/README.md`](supabase/README.md)) y se ejecutan manualmente desde el SQL Editor de Supabase (no hay migraciones automatizadas).

---

## Roles de Usuario

| Rol | Acceso |
|-----|--------|
| `admin` | Todo: panel completo, reportes, gestión de menú, clientes, finanzas. |
| `waiter` | POS, cocina, delivery, mesas, pagos, reservaciones, dashboard. |
| `kitchen` | Pantalla de cocina (acceso real controlado por RLS, no por gate de UI). |
| `customer` | Solo sitio público. |

El guard vive en `app/admin/AdminContext.tsx` vía `useRequireRole(rolesPermitidos)`, usado en cada página dentro de `app/admin/(protected)/`.

---

## Menú y Precios

El menú se maneja **en dólares (USD), con centavos reales** (no redondeado) — ver `lib/format.ts` (`fmt.currency`, `calcTotals`). Categorías actuales: Burgers, Alitas y Chunks (4 tamaños cada uno), Papas, Combos. El script de referencia para reemplazar el menú está en `supabase/menu/reset_menu_crunchies.sql`.

Las imágenes del menú se sirven localmente desde `web-next/public/menu/` (no desde URLs externas).

---

## Mesas y Código QR

5 mesas (`restaurant_tables`), todas "Salón Principal", capacidad 4, sin zonas especiales. Cada mesa tiene su propio QR (`/admin/tables`) que apunta a `/table-order?table=<id>` usando el dominio donde se generó (`window.location.origin`) — generar los QR siempre desde el dominio de producción correcto.

---

## Configuración Inicial

### 1. Variables de entorno

Crea `web-next/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

### 2. Base de datos

En Supabase → **SQL Editor**, sigue el orden documentado en [`supabase/README.md`](supabase/README.md): primero `schema/`, luego `migrations/`, luego `menu/reset_menu_crunchies.sql`, y opcionalmente `seed/`.

### 3. Cuentas de personal

Supabase → **Authentication → Users** → crear usuario. Luego en **Table Editor → profiles**, asignar `role`: `admin`, `waiter` o `kitchen`.

---

## Ejecutar Localmente

```bash
cd web-next
npm install
npm run dev
```

Abre `http://localhost:3000`.

---

## Despliegue

Proyecto en Vercel: **`crunchies-next`** → `https://crunchies-next.vercel.app` (Root Directory: `web-next`, framework Next.js, autodetectado).

> Existe un proyecto Vercel anterior (`neon-y-sabor.vercel.app`) que sigue sirviendo la versión vieja en HTML — está deprecado, no es el sitio de producción actual.

---

## Sistema de Diseño

| Variable | Valor | Uso |
|----------|-------|-----|
| `--green` | `#FF6600` | Acento primario (alias "green" por compatibilidad histórica) |
| `--amber` | `#FF9900` | Acento secundario, precios, advertencias |
| `--bg-0` / `--bg-2` / `--bg-3` | `#0E0908` / `#1E1210` / `#261510` | Fondo / modales / cards |
| `--text-primary` / `--text-secondary` / `--text-muted` | `#FFFFFF` / `#BFA099` / `#7A5248` | Jerarquía de texto |
| `--danger` | `#FF4455` | Errores, cancelaciones |

Tipografía: **Bangers** (display, marca, mesas en cocina) + **Poppins** (todo el cuerpo, incluyendo precios).

---

## Puntos de Lealtad

- **Acumulación**: 1 punto por cada $1 pagado (aplica en POS, pedido web y delivery).
- **Canje**: máximo 50% del total de la orden, $0.01 por punto.
- **Gestión manual**: desde `/admin/customers`.
- **Historial**: tabla `loyalty_transactions`, tipo `earned` / `redeemed`.

---

## Realtime (Suscripciones Activas)

| Página/Componente | Canal | Qué hace |
|--------------------|-------|----------|
| `KitchenClient.tsx` | `postgres_changes` en `orders` (todos los eventos) | Refresca las columnas de cocina y el historial del día. |
| `OrdersClient.tsx` (POS) | `postgres_changes` UPDATE en `orders`, filtrado a la orden activa | Banner en vivo del estado del ticket (🟡 en cocina → ✅ lista → 🍽️ entregada). |
| `TrackClient.tsx` | `postgres_changes` UPDATE en `orders` | Actualiza el stepper del cliente. |
| `DeliveryClient.tsx` | `postgres_changes` en `orders` | Actualiza las tarjetas de domicilio/para llevar. |

---

## Mapeo Rápido: Funcionalidad → Archivo

| Necesito cambiar... | Archivo |
|---------------------|---------|
| Credenciales de Supabase | `web-next/.env.local` |
| Impuesto o cálculo de totales | `web-next/lib/format.ts` — `TAX_RATE`, `calcTotals` |
| Formato de moneda | `web-next/lib/format.ts` — `fmt.currency` |
| Colores del sistema | `web-next/app/styles/design-system.css` |
| Layout del sidebar / topbar | `web-next/app/admin/styles/admin.css` |
| Estilos del POS / banner de estado | `web-next/app/admin/styles/admin.css` |
| Lógica del POS (items, ticket, pago) | `web-next/app/admin/(protected)/orders/OrdersClient.tsx` |
| Recibo PDF | `web-next/app/admin/(protected)/orders/receipt-pdf.ts` |
| Display de cocina | `web-next/app/admin/kitchen/KitchenClient.tsx` |
| Menú para clientes | `web-next/app/components/MenuSection.tsx` |
| Pedido por QR de mesa | `web-next/app/table-order/TableOrderClient.tsx` |
| Generación de QR | `web-next/app/admin/(protected)/tables/TablesClient.tsx` |
| Guard de autenticación admin | `web-next/app/admin/AdminContext.tsx` — `useRequireRole()` |
| Schema de la base de datos | `supabase/schema/schema.sql` y demás `supabase/` (ver `supabase/README.md`) |
