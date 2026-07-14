# Orden de Migrations — Crunchies POS

Ejecutar en Supabase → SQL Editor → New Query, en este orden exacto.
Los archivos con `IF NOT EXISTS` / `DROP IF EXISTS` son idempotentes (seguros de re-ejecutar).

## 🚨 URGENTE — correr `URGENT_enable_rls_legacy_tables.sql` YA, sin importar en qué paso vas

Se encontró probando las migrations contra una copia de prueba real (no
contra producción): `profiles`, `categories`, `orders` y `order_items`
**nunca tuvieron Row Level Security habilitado**. El único archivo que lo
hacía es `schema/schema.sql`, marcado como obsoleto/no-ejecutar desde
siempre en este documento. Todas las policies que existen hoy sobre esas
4 tablas (`orders_staff`, `orders_customer_own`, `profile_select_own`,
etc.) están completamente inertes — cualquier usuario autenticado puede
leer o escribir cualquier fila sin restricción real. Esto es independiente
del trabajo multitenant y aplica a la arquitectura actual de un solo
negocio. Corre `migrations/URGENT_enable_rls_legacy_tables.sql` **ahora**,
sin importar en qué paso de la tabla de abajo estés.

## Estado actual de la DB (2026-06-28)

La DB de producción tiene tablas distintas al `schema.sql` original.
**Tablas que YA existen:** `categories`, `collections`, `delivery_zones`, `drivers`,
`favorites`, `fixed_costs`, `order_items`, `orders`, `product_reviews`, `products`,
`profiles`, `variable_costs`.

**Tablas faltantes** (críticas para el código): `menu_items`, `restaurant_tables`,
`payments`, `loyalty_transactions`, `reservations`, `modifier_groups`,
`modifier_options`, `menu_item_modifier_groups`, `order_item_modifiers`, `expenses`.

> ⚠️ La tabla `products` puede contener items del menú de una versión anterior.
> Si tiene datos, migrarlos manualmente a `menu_items` o usar insert_menu_items_nuevos.sql.

## Orden de ejecución para producción (a partir de estado actual)

⚠️ Los archivos NO están todos en la misma carpeta — la columna "Ruta" es
la ruta real desde `supabase/`. Ábrelos por esa ruta exacta, no busques
solo el nombre.

| # | Ruta (desde `supabase/`) | Idempotente | Descripción |
|---|---------------------------|-------------|-------------|
| 1 | **`create_missing_tables.sql`** | ✅ | **EJECUTAR PRIMERO** — Crea las 10 tablas que faltan con RLS |
| 2 | **`fix_delivery_status_constraint.sql`** | ✅ | Columnas delivery en orders + CHECK constraint correcto |
| 3 | `migrations/add_payment_method.sql` | ✅ | Columna payment_method en orders (cash/nequi) |
| 4 | `schema/delivery_management_schema.sql` | ✅ | Columnas driver_id, delivery_zone_id, delivery_fee en orders |
| 5 | `migrations/anon_ordering_rls.sql` | ✅ | RLS para pedidos anónimos via QR (sin cuenta de cliente) |
| 6 | `migrations/fix_tables_and_rls.sql` | ✅ | RLS para clientes autenticados pidiendo desde QR |
| 7 | `migrations/customer_notes_rls.sql` | ✅ | Permisos para que clientes puedan escribir notas en sus órdenes |
| 8 | `migrations/reorganize_tables.sql` | ✅ | Limpieza de mesas ocupadas sin orden activa |
| 9 | `migrations/loyalty_points_fix.sql` | ✅ | Trigger para otorgar puntos automáticamente |
| 10 | `migrations/enable_realtime.sql` | ✅ | Habilitar Realtime en orders y order_items |
| 11 | `menu/archive/insert_menu_items_nuevos.sql` | ✅ | Items iniciales del menú en `menu_items` |
| 12 | `menu/archive/update_menu.sql` / `menu/archive/update_menu_images.sql` | ✅ | Actualizaciones de menú e imágenes |
| 13 | `menu/archive/update_prices_sv.sql` | ✅ | Ajuste de precios |
| 14 | **`staff_pins_schema.sql`** | ✅ | Sistema de portales con PIN (Fase 2) |
| 15 | **`migrations/tenant_foundation.sql`** | ✅ | **Fase multitenant A/B** — crea `tenants`/`tenant_members`/`tenant_settings`/`tenant_plan_subscriptions`, agrega `tenant_id` a las tablas operativas + inventario, backfill al tenant raíz `crunchies-root`, DEFAULT de `tenant_id` al tenant raíz en las tablas preexistentes |
| 16 | **`migrations/tenant_aware_rls.sql`** | ✅ | **Fase multitenant C** — reescribe TODA policy RLS existente en las tablas operativas para exigir pertenencia de tenant (no solo rol), vuelve `tenant_id` `NOT NULL`. Dropea policies dinámicamente (no por nombre) porque los nombres reales ya divergen de los de este documento — ver comentario en el archivo |
| 17 | **`migrations/tenant_onboarding.sql`** | ✅ | **Fase multitenant 4** — RPC `create_tenant()` (SECURITY DEFINER) para dar de alta un negocio nuevo sin tocar SQL; solo `profiles.role='admin'` puede llamarla |
| 18 | **`migrations/cash_sessions.sql`** | ✅ | **Fase multitenant 5** — `cash_sessions`/`cash_session_movements`, columna `payments.cash_session_id`, RPCs `compute_cash_session_expected()` y `close_cash_session()` |
| 19 | **`migrations/inventory.sql`** | ✅ | **Fase multitenant 6** — `recipe_items`, RPC `record_inventory_movement()`, trigger de consumo automático en `order_items`, vista `low_stock_items` |
| 20 | **`migrations/billing.sql`** | ✅ | **Fase multitenant 7** — `is_tenant_role()` ahora exige `tenant.status in ('active','trial')`, RPC `set_tenant_status()` para suspender/reactivar (solo `profiles.role='admin'`) |
| 21 | **`migrations/fiscal.sql`** | ✅ | **Fase multitenant 8** — `tenant_settings.tax_rate` (default 13% IVA), fila explícita del tenant raíz en 0% para no cambiarle el cobro a Crunchies sin que nadie lo pidiera |
| 22 | **`migrations/customer_credit.sql`** | ✅ | **Módulo "fiado"** — `customer_credit_accounts`/`customer_credit_transactions`, `payments.method` gana `'credit'`, RPCs `charge_customer_credit()` y `record_credit_payment()` |
| 23 | **`migrations/menu_item_cost.sql`** | ✅ | `menu_items.cost` — costo por platillo, usado en Finanzas para calcular COGS real contra la venta |

> ⚠️ Correr 15 y 16 solo después de que las migrations 1-14 ya estén aplicadas
> (dependen de que todas las tablas operativas existan). Verificar con la
> query de verificación al final de `tenant_aware_rls.sql` que cada tabla
> tenga las policies esperadas antes de dar por cerrada la migración.

## Archivos obsoletos (NO ejecutar)

| Archivo | Razón |
|---------|-------|
| `schema.sql` | Schema base original — las tablas que crea ya existen o fueron reemplazadas |
| `add_order_columns.sql` | Reemplazado por `fix_delivery_status_constraint.sql` |
| `modifiers_schema.sql` | Reemplazado por `create_missing_tables.sql` (refencia a menu_items corregida) |
| `expenses_create.sql` / `expenses_rls.sql` | Reemplazados por `create_missing_tables.sql` |

## Verificación de columnas en `orders`

Ejecutar después de aplicar las migrations 1-5:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY column_name;
```

Columnas esperadas (mínimo): `created_at`, `customer_id`, `delivery_address`, `delivery_fee`,
`delivery_name`, `delivery_phone`, `delivery_status`, `delivery_zone_id`, `driver_id`,
`id`, `notes`, `order_type`, `payment_method`, `status`, `subtotal`, `table_id`,
`tax`, `total`, `updated_at`, `waiter_id`.

## Habilitar Realtime (manual en dashboard)

Ir a: Supabase → Dashboard → Database → Replication
Activar para las tablas: `orders`, `order_items`

Sin este paso, kitchen.html y delivery.html NO se actualizan en tiempo real.
