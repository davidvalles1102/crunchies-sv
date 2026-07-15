# Multitenant Plan

## Objetivo

Convertir el sistema actual de un restaurante único en una plataforma SaaS para múltiples negocios pequeños y medianos en El Salvador, con operación estable, costo controlado para 2 desarrolladores y capacidad de crecer sin rehacer la base.

## Principio rector

El sistema no debe “parecer multitenant” por UI; debe ser multitenant en la base de datos, en RLS, en sesiones y en reportes.

Si una consulta o una política no sabe a qué negocio pertenece el dato, la arquitectura todavía no está lista.

## Decisión de arquitectura

### Opción recomendada

Un solo proyecto Supabase compartido con `tenant_id` en todas las tablas de negocio, RLS por tenant y super-admin global.

### Por qué esta opción

- Es la más barata de operar para 2 desarrolladores.
- Permite provisionar nuevos clientes sin crear infraestructura nueva.
- Simplifica analítica, mantenimiento y despliegue.
- Evita duplicar codebase y migraciones por cliente.

### Cuándo NO usarla

- Si un cliente grande exige aislamiento físico por contrato.
- Si un negocio tiene requerimientos regulatorios o de datos que exigen base separada.

## Modelo de tenancy

### Entidades núcleo

- `tenants`
- `tenant_members`
- `tenant_settings`
- `tenant_locations`
- `tenant_plan_subscriptions`

### Entidades operativas que deben llevar `tenant_id`

- `profiles`
- `categories`
- `menu_items`
- `modifier_groups`
- `modifier_options`
- `restaurant_tables`
- `orders`
- `order_items`
- `order_item_modifiers`
- `payments`
- `reservations`
- `expenses`
- `inventory_items`
- `inventory_movements`
- `staff_members`
- `order_events`
- `delivery_zones`
- `drivers`

### Regla

Todo dato que un negocio pueda ver, editar o reportar debe tener `tenant_id`.

## RLS

### Reglas base

- Un usuario solo puede leer/escribir datos de su `tenant_id`.
- El staff solo puede acceder al tenant al que pertenece.
- El admin de plataforma puede ver todos los tenants.
- Los clientes finales solo pueden ver sus pedidos propios dentro del tenant.

### Patrón recomendado de policy

```sql
exists (
  select 1
  from public.tenant_members tm
  where tm.tenant_id = target.tenant_id
    and tm.user_id = auth.uid()
    and tm.active = true
)
```

### Ventaja

Esto evita depender solo de `profiles.role`, que sirve para rol, pero no para aislamiento de clientes.

## Estructura de datos sugerida

### tenants

- `id`
- `slug`
- `name`
- `status`
- `plan`
- `timezone`
- `currency`
- `created_at`

### tenant_members

- `tenant_id`
- `user_id`
- `role`
- `active`
- `created_at`

### tenant_settings

- `tenant_id`
- `brand_name`
- `logo_url`
- `primary_color`
- `tax_enabled`
- `invoice_mode`
- `default_language`
- `delivery_enabled`
- `inventory_enabled`
- `created_at`

### inventory_items

- `tenant_id`
- `name`
- `sku`
- `unit`
- `cost`
- `stock_on_hand`
- `reorder_point`
- `active`

### inventory_movements

- `tenant_id`
- `inventory_item_id`
- `type`
- `quantity`
- `reason`
- `reference_type`
- `reference_id`
- `created_by`

## Flujo de onboarding por negocio

1. Crear tenant.
2. Crear owner/admin.
3. Definir plan mensual.
4. Configurar nombre, branding y zonas.
5. Cargar catálogo inicial.
6. Crear staff y PINs.
7. Crear mesas y QR.
8. Ejecutar orden de prueba.
9. Habilitar caja e inventario según plan.

## Producto mínimo vendible

### Versión base

- POS
- QR por mesa
- Cocina realtime
- Delivery / takeout
- Mesas
- Pagos
- Reportes básicos
- Staff PIN

### Add-ons monetizables

- Inventario
- Cierre de caja
- WhatsApp recibos
- Facturación / exportación fiscal
- Múltiples sucursales
- CRM / fidelización
- Permisos avanzados
- Auditoría avanzada

## Estrategia de precios

El precio debe ser bajo de entrada y subir por capacidad.

### Ejemplo de escalón

- Starter: 1 local, POS + cocina + QR.
- Pro: inventario, delivery, reportes y staff extra.
- Multi-sucursal: varias ubicaciones y permisos avanzados.

### Regla comercial

No cobrar por cada clic o cada orden.

Cobrar por:

- negocio
- sucursal
- volumen de personal
- módulos avanzados

## Requerimientos para El Salvador

### Operativos

- IVA visible y configurable.
- Manejo de efectivo, tarjeta, transferencia y pago mixto.
- Recibos y cierres por turno.
- Historial de ajustes y anulaciones.
- Exportación contable simple.

### Legales y prácticos

- Registrar responsable y bitácora de cambios.
- Preparar el sistema para facturación electrónica o exportación compatible.
- Mantener evidencia de quién hizo cada ajuste.
- Manejar datos de cliente con cuidado, sin exponer información innecesaria al staff.

### Observación

En el contexto local, la plataforma debe ser útil para negocios pequeños que no tienen equipo administrativo robusto. Si un dueño puede entender el cierre del día en 2 minutos, el producto está bien diseñado.

## Riesgos que hay que evitar

- Compartir tablas entre tenants sin `tenant_id`.
- Políticas RLS basadas solo en roles globales.
- Guardar credenciales sensibles en el cliente.
- Acumular lógica de negocio en el front sin control transaccional.
- Crear inventario “de adorno” sin movimientos y costo real.
- Meter features premium en el core y encarecer el mantenimiento.

## Ruta de implementación

### Fase 1

- Introducir `tenant_id`.
- Crear `tenants` y `tenant_members`.
- Reescribir RLS principal.

### Fase 2

- Migrar sesiones y portales al contexto de tenant.
- Aislar reportes y catálogo.
- Hacer onboarding multitenant.

### Fase 3

- Inventario.
- Cierres de caja.
- Permisos granulares.
- Auditoría.

### Fase 4

- Facturación / exportación fiscal.
- Módulos premium.
- Escalado comercial.

## Criterio de éxito

El sistema será realmente multitenant cuando:

- un tenant no pueda leer ni inferir datos de otro;
- el onboarding de un cliente nuevo no requiera tocar código;
- un negocio pequeño pueda operar todo el día sin soporte técnico constante;
- los reportes cuadren con caja, pagos e inventario;
- 2 desarrolladores puedan mantener la plataforma sin volverse esclavos de migraciones manuales.

