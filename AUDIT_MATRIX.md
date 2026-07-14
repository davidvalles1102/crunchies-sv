# Audit Matrix

## Scope

Auditoría del sistema POS + QR + cocina + delivery + staff PIN + base de datos, con foco en:

- seguridad de acceso
- validación de datos
- operaciones reales de restaurante
- viabilidad multitenant
- escalabilidad para 5+ clientes
- factibilidad comercial para 2 desarrolladores

## Status Summary

### Ya probado en local

- La app compila con `npm run build`.
- `npm run lint` pasa tras las correcciones recientes.
- Los portales PIN y staff panel dejaron de romper React 19 por patrones de efectos/estado.
- El esquema actual sí soporta un restaurante único funcional con roles.

### Ya documentado

- Plan multitenant general.
- Blueprint de migración tenant-aware.
- Draft SQL de base multitenant.

### Todavía incompleto

- Migración real de producción a `tenant_id`.
- RLS tenant-aware aplicada a todas las tablas.
- Queries del frontend adaptadas al tenant activo.
- Onboarding de un nuevo negocio sin tocar código.
- Inventario completo con costo, movimientos y consumo.
- Caja/cierre por turno con conciliación.
- Fiscalidad operativa completa para un SaaS real.

## Requirement-by-Requirement Audit

### 1. “No tocar código sin plan detallado”

Evidence:

- [`MULTITENANT_PLAN.md`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\MULTITENANT_PLAN.md)
- [`MULTITENANT_SCHEMA_BLUEPRINT.md`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\MULTITENANT_SCHEMA_BLUEPRINT.md)

Status:

- Proven.

### 2. “Auditar todo el código, seguridad, credenciales y validación”

Evidence:

- [`web-next/app/api/portal/auth/route.ts`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\web-next\app\api\portal\auth\route.ts)
- [`web-next/lib/pin-auth.ts`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\web-next\lib\pin-auth.ts)
- [`supabase/schema/schema.sql`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\supabase\schema\schema.sql)
- [`supabase/MIGRATIONS.md`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\supabase\MIGRATIONS.md)

Status:

- Partially proven.
- The project is audited enough to identify the core risks, but the multitenant refactor is not yet implemented.

### 3. “Montarlo en local”

Evidence:

- `npm run build` passed.
- `npm run lint` passed after fixes.

Status:

- Proven for the current codebase state.

### 4. “Que sea multitenant”

Evidence:

- [`MULTITENANT_PLAN.md`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\MULTITENANT_PLAN.md)
- [`MULTITENANT_SCHEMA_BLUEPRINT.md`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\MULTITENANT_SCHEMA_BLUEPRINT.md)
- [`supabase/migrations/multitenant_schema_draft.sql`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\supabase\migrations\multitenant_schema_draft.sql)

Status:

- Design proven.
- Implementation incomplete.

### 5. “Agregar inventarios y hacerlo completo y estable”

Evidence:

- Inventory tables are only drafted in [`supabase/migrations/multitenant_schema_draft.sql`](C:\Users\Chris\Documents\Projects\POS\neon-y-sabor\supabase\migrations\multitenant_schema_draft.sql)

Status:

- Incomplete.

### 6. “Que sea viable para 2 desarrolladores y barato”

Evidence:

- Architecture docs favor shared DB with tenant isolation.
- No code-level infrastructure explosion introduced.

Status:

- Strongly supported, but not yet operationally proven.

### 7. “Real business logic for El Salvador”

Evidence:

- Official sources reviewed:
  - [Facturación Electrónica - Ministerio de Hacienda](https://www.mh.gob.sv/facturacion-electronica/)
  - [Inscripción o Restitución como Contribuyente de IVA Persona Natural](https://www.mh.gob.sv/servicios/inscripcion-o-restitucion-como-contribuyente-de-iva-persona-natural-incluye-modificacion-de-datos-o-reposicion-de-tarjeta-de-iva/)
  - [Formularios tributarios para descarga](https://www.mh.gob.sv/servicios/formularios-tributarios-para-descarga/)
  - [SAS - CNR](https://www.cnr.gob.sv/sociedades-por-acciones-simplificadas/)

Status:

- Requirements researched and incorporated into planning.
- Product-level implementation still missing.

## What the evidence proves

1. The current single-restaurant app is operationally coherent.
2. The project can be stabilized locally.
3. A multitenant direction has been chosen.
4. The next step must be schema and RLS implementation, not more abstract planning.

## What the evidence does not yet prove

1. Real tenant isolation in the database.
2. Provisioning a brand-new customer without code changes.
3. Inventory flow with stock movements.
4. Billing/subscription lifecycle enforcement.
5. Production-ready onboarding for multiple businesses.

## Recommended next implementation block

1. Apply the tenant draft to a dev database.
2. Convert RLS policies to tenant-aware policies.
3. Add frontend tenant resolution.
4. Build onboarding and tenant settings UI.
5. Add inventory and cash-session modules.
6. Run scenario tests with at least:
   - 1 restaurant
   - 2 tenants
   - 3 staff roles
   - 1 delivery flow
   - 1 QR flow

