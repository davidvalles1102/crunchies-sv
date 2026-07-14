# Orden de Migrations — Crunchies POS

Ejecutar en Supabase → SQL Editor → New Query, en este orden exacto.
Los archivos con `IF NOT EXISTS` / `DROP IF EXISTS` son idempotentes (seguros de re-ejecutar).

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

| # | Archivo | Idempotente | Descripción |
|---|---------|-------------|-------------|
| 1 | **`create_missing_tables.sql`** | ✅ | **EJECUTAR PRIMERO** — Crea las 10 tablas que faltan con RLS |
| 2 | **`fix_delivery_status_constraint.sql`** | ✅ | Columnas delivery en orders + CHECK constraint correcto |
| 3 | `add_payment_method.sql` | ✅ | Columna payment_method en orders (cash/nequi) |
| 4 | `delivery_management_schema.sql` | ✅ | Columnas driver_id, delivery_zone_id, delivery_fee en orders |
| 5 | `anon_ordering_rls.sql` | ✅ | RLS para pedidos anónimos via QR (sin cuenta de cliente) |
| 6 | `fix_tables_and_rls.sql` | ✅ | RLS para clientes autenticados pidiendo desde QR |
| 7 | `customer_notes_rls.sql` | ✅ | Permisos para que clientes puedan escribir notas en sus órdenes |
| 8 | `reorganize_tables.sql` | ✅ | Limpieza de mesas ocupadas sin orden activa |
| 9 | `loyalty_points_fix.sql` | ✅ | Trigger para otorgar puntos automáticamente |
| 10 | `enable_realtime.sql` | ✅ | Habilitar Realtime en orders y order_items |
| 11 | `insert_menu_items_nuevos.sql` | ✅ | Items iniciales del menú en `menu_items` |
| 12 | `update_menu.sql` / `update_menu_images.sql` | ✅ | Actualizaciones de menú e imágenes |
| 13 | `update_prices_sv.sql` | ✅ | Ajuste de precios |
| 14 | `staff_pins_schema.sql` | ✅ | Sistema de portales con PIN (Fase 2) |
| 15 | **`tenant_foundation.sql`** | ✅ | **Fase multitenant A/B** — crea `tenants`/`tenant_members`/`tenant_settings`/`tenant_plan_subscriptions`, agrega `tenant_id` a las tablas operativas + inventario, backfill al tenant raíz `crunchies-root` |
| 16 | **`tenant_aware_rls.sql`** | ✅ | **Fase multitenant C** — reescribe TODA policy RLS existente en las tablas operativas para exigir pertenencia de tenant (no solo rol), vuelve `tenant_id` `NOT NULL`. Dropea policies dinámicamente (no por nombre) porque los nombres reales ya divergen de los de este documento — ver comentario en el archivo |
| 17 | **`tenant_onboarding.sql`** | ✅ | **Fase multitenant 4** — RPC `create_tenant()` (SECURITY DEFINER) para dar de alta un negocio nuevo sin tocar SQL; solo `profiles.role='admin'` puede llamarla |
| 18 | **`cash_sessions.sql`** | ✅ | **Fase multitenant 5** — `cash_sessions`/`cash_session_movements`, columna `payments.cash_session_id`, RPCs `compute_cash_session_expected()` y `close_cash_session()` |
| 19 | **`inventory.sql`** | ✅ | **Fase multitenant 6** — `recipe_items`, RPC `record_inventory_movement()`, trigger de consumo automático en `order_items`, vista `low_stock_items` |
| 20 | **`billing.sql`** | ✅ | **Fase multitenant 7** — `is_tenant_role()` ahora exige `tenant.status in ('active','trial')`, RPC `set_tenant_status()` para suspender/reactivar (solo `profiles.role='admin'`) |

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
