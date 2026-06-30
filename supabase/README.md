# Base de Datos — Scripts SQL

No hay migraciones automatizadas: cada script se pega manualmente en Supabase → **SQL Editor** → Run. Esta carpeta está organizada por propósito, no por fecha.

## Estructura

```
supabase/
├── schema/      ← Define la estructura de tablas (ejecutar primero, en orden, en un proyecto nuevo)
├── migrations/   ← Cambios incrementales ya aplicados (RLS, columnas nuevas, fixes) — orden no crítico entre sí, pero todos asumen que schema/ ya corrió
├── seed/         ← Datos de ejemplo / demo, opcionales
├── menu/         ← Contenido del menú (reset_menu_crunchies.sql es el vigente; archive/ son versiones anteriores ya superadas, solo de referencia)
└── reset_reports_data.sql  ← Script suelto pendiente de ejecutar (ver abajo)
```

## Configuración de un proyecto Supabase nuevo (orden)

1. `schema/schema.sql`
2. `schema/modifiers_schema.sql`
3. `schema/delivery_management_schema.sql`
4. `schema/expenses_create.sql`
5. Todo `migrations/*.sql` (cualquier orden, son independientes entre sí)
6. `menu/reset_menu_crunchies.sql` — carga el menú vigente
7. (Opcional) `seed/seed.sql` o `seed/seed_demo.sql` para datos de prueba

## Pendiente

`reset_reports_data.sql` — borra todas las órdenes, pagos y gastos (reinicia Reportes/Finanzas/Dashboard a cero). No tocado todavía — correrlo solo cuando se quiera limpiar el historial de transacciones real.
