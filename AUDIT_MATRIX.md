# Audit Matrix

> Actualizado 2026-07-14. Este documento se había quedado congelado en el
> momento en que el multitenant era solo un plan/draft SQL. Desde entonces
> se implementaron y probaron las Fases 1–8 del roadmap (ver
> `MULTITENANT_IMPLEMENTATION_ROADMAP.md` y `supabase/MIGRATIONS.md` #15–24).
> Este archivo refleja el estado real verificado contra el código y los
> tests, no el plan original.

## Scope

Auditoría del sistema POS + QR + cocina + delivery + staff PIN + base de datos, con foco en:

- seguridad de acceso
- validación de datos
- operaciones reales de restaurante
- viabilidad multitenant
- escalabilidad para 5+ clientes
- factibilidad comercial para 2 desarrolladores

## Status Summary

### Ya probado en local (verificado 2026-07-14)

- `npm run build` compila sin errores (Next.js 16, 28+ rutas).
- `npm run lint` pasa sin warnings.
- `npm run test` — 12/12 tests unitarios pasan (`calcTotals`, modificadores, keys de línea de pedido).
- `npm run test:db` — 14/14 tests de integración pasan contra Postgres real (PGlite, no mocks): aislamiento multitenant, onboarding vía `create_tenant()`, flujo dine-in completo, cierre de caja, consumo automático de inventario por receta, fiado con límite de crédito, seguridad de pedidos anónimos (incluye intento de suplantación de `customer_id`), y estrés de 500 órdenes en 2 tenants sin fuga de aislamiento.
- Los portales PIN y staff panel funcionan con React 19 sin los problemas de efectos/estado detectados en la auditoría original.

### Ya implementado y probado (antes: "draft" / "incompleto")

- **Tenant foundation** (`tenants`, `tenant_members`, `tenant_settings`, `tenant_plan_subscriptions`) — `migrations/tenant_foundation.sql`.
- **RLS tenant-aware en todas las tablas operativas**, `tenant_id NOT NULL` — `migrations/tenant_aware_rls.sql`. Probado: staff de un tenant no puede leer/escribir datos de otro.
- **Onboarding de negocio sin tocar SQL**, RPC `create_tenant()` — `migrations/tenant_onboarding.sql`. Probado: un no-admin no puede crear tenants.
- **Caja / cierre de turno con conciliación** — `migrations/cash_sessions.sql` (`compute_cash_session_expected()`, `close_cash_session()`).
- **Inventario completo**: recetas, consumo automático al vender, movimientos — `migrations/inventory.sql`.
- **Billing / enforcement de plan-suspensión** — `migrations/billing.sql`.
- **Fiscalidad**: `tenant_settings.tax_rate` configurable por tenant (default 13% IVA para negocios nuevos), exportación fiscal (`/admin/fiscal-export`) — `migrations/fiscal.sql`.
- **Fiado / crédito de cliente** — `migrations/customer_credit.sql`.
- **Costo por platillo + COGS real en Finanzas** — `migrations/menu_item_cost.sql`.

### Todavía pendiente / no cubierto por tests automatizados

- Panel `/admin/platform` (gestión de tenants desde la UI) no tiene cobertura de tests dedicada — la lógica de `create_tenant()` sí está probada a nivel de RPC/RLS, pero no el flujo de UI completo.
- Confirmar que las migraciones #1–24 de `supabase/MIGRATIONS.md` ya corrieron contra el proyecto de Supabase de producción (el código y los tests asumen el esquema final; la ejecución manual en el SQL Editor de producción es responsabilidad operativa, no automatizada).
- No hay requerimientos WCAG formales — decisión de producto explícita en `PRODUCT.md`, no un gap de auditoría.

## Requirement-by-Requirement Audit

### 1. “No tocar código sin plan detallado”

Evidence:

- [`MULTITENANT_PLAN.md`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\MULTITENANT_PLAN.md)
- [`MULTITENANT_SCHEMA_BLUEPRINT.md`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\MULTITENANT_SCHEMA_BLUEPRINT.md)
- [`MULTITENANT_IMPLEMENTATION_ROADMAP.md`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\MULTITENANT_IMPLEMENTATION_ROADMAP.md)

Status:

- Proven — el plan se siguió fase por fase (commits `4863b16`…`8cb710b` mapean 1:1 a las Fases 1–8 del roadmap).

### 2. “Auditar todo el código, seguridad, credenciales y validación”

Evidence:

- [`web-next/app/api/portal/auth/route.ts`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\web-next\app\api\portal\auth\route.ts)
- [`web-next/lib/pin-auth.ts`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\web-next\lib\pin-auth.ts)
- [`supabase/migrations/fix_pin_security.sql`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\supabase\migrations\fix_pin_security.sql)
- [`supabase/MIGRATIONS.md`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\supabase\MIGRATIONS.md)

Status:

- Proven. Auditoría de seguridad 2026-07-01 encontró y corrigió una fuga real (`get_role_credentials` devolvía passwords en texto plano a `anon`) — ver `fix_pin_security.sql`. El flujo actual nunca expone credenciales de cuentas compartidas al cliente.

### 3. “Montarlo en local”

Evidence:

- `npm run build` pasa.
- `npm run lint` pasa.
- `npm run test` y `npm run test:db` pasan (26/26 tests totales).

Status:

- Proven.

### 4. “Que sea multitenant”

Evidence:

- [`supabase/migrations/tenant_foundation.sql`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\supabase\migrations\tenant_foundation.sql)
- [`supabase/migrations/tenant_aware_rls.sql`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\supabase\migrations\tenant_aware_rls.sql)
- [`supabase/test/scenarios.test.mjs`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\supabase\test\scenarios.test.mjs) — test "aislamiento real: el staff del tenant A NO puede escribir en el menu de B" y test de estrés con 500 órdenes en 2 tenants.

Status:

- Implemented and proven with real Postgres RLS enforcement, not just design.

### 5. “Agregar inventarios y hacerlo completo y estable”

Evidence:

- [`supabase/migrations/inventory.sql`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\supabase\migrations\inventory.sql)
- Test: "inventario: la receta descuenta stock automaticamente al vender".

Status:

- Implemented and proven (consumo automático vía trigger, no cálculo manual).

### 6. “Que sea viable para 2 desarrolladores y barato”

Evidence:

- Un solo proyecto Supabase compartido con `tenant_id`, sin infraestructura por cliente.
- Onboarding sin SQL manual (`create_tenant()`).
- Tests de estrés (500 órdenes) corren en ~2.7s sobre Postgres real.

Status:

- Strongly supported and now operationally proven a nivel de base de datos. Falta validar el costo operativo real con 5+ tenants activos en producción (fuera del alcance de un test automatizado).

### 7. “Real business logic for El Salvador”

Evidence:

- Fuentes oficiales revisadas (Ministerio de Hacienda, CNR).
- `tenants.currency` default `'USD'`, `tenants.timezone` default `'America/El_Salvador'`.
- `tenant_settings.tax_rate` default `0.13` (13% IVA) para tenants nuevos — `migrations/fiscal.sql`.
- `migrations/enable_root_tenant_tax.sql` (2026-07-14) activó el 13% en el tenant raíz `crunchies-root` por error de contexto — Crunchies SV **no** es contribuyente formal y no cobra IVA. Revertido el mismo día por `migrations/disable_root_tenant_tax.sql` (`tax_enabled=false`, `tax_rate` queda guardado en 0.13 pero inactivo). Estado correcto y actual: sin IVA para este tenant.
- Menú de referencia (`supabase/menu/reset_menu_crunchies.sql`) ya en USD.

Status:

- Implemented at the schema and application level (currency, timezone, tax rate all tenant-configurable, not hardcoded). No hay ningún módulo de facturación electrónica (DTE) en el código de la aplicación — `invoice_mode` es una columna de `tenant_settings` (default `'manual'`) que ningún archivo de `web-next/` lee ni usa; es un placeholder de schema, no un módulo detrás de un flag activo. Si un tenant futuro necesita DTE ante el Ministerio de Hacienda, es trabajo nuevo, no algo que exista latente hoy.

## What the evidence proves

1. El sistema multitenant está implementado y probado, no solo diseñado.
2. El restaurante raíz (Crunchies) sigue operando sin interrupción sobre el mismo esquema.
3. Caja, inventario, fiado y exportación fiscal son módulos reales con pruebas de integración, no borradores.
4. El siguiente paso relevante es operativo (confirmar que producción corrió las 24 migraciones, monitorear un segundo tenant real), no más diseño.

## What the evidence does not yet prove

1. Comportamiento en producción con 2+ tenants reales de forma simultánea y sostenida (los tests cubren esto contra Postgres real, pero no contra el proyecto de Supabase de producción).
2. Integración de facturación electrónica (DTE) con el Ministerio de Hacienda — `invoice_mode='electronic'` existe en el schema pero no está conectado a ningún proveedor/API real.
3. UI de gestión de planes/billing más allá de suspender/reactivar (`set_tenant_status()`) — no hay cobro automático todavía.

## Recommended next implementation block

1. Confirmar en Supabase de producción que las migraciones #1–23 y #25 de `supabase/MIGRATIONS.md` ya corrieron — **no** correr #24 (`enable_root_tenant_tax.sql`) para `crunchies-root`, quedó revertida por #25.
2. Dar de alta un segundo tenant real (no de prueba) y operarlo en paralelo al menos una semana.
3. Si algún tenant futuro sí es contribuyente formal y necesita DTE ante Hacienda, es integración nueva a construir — hoy no existe nada de eso en el código, solo la columna `invoice_mode` sin uso.
4. Agregar cobro automático/recurrente sobre `tenant_plan_subscriptions` si el modelo de negocio lo requiere.
