# Multitenant Schema Blueprint

## Propósito

Definir la migración técnica necesaria para convertir el sistema actual en una plataforma SaaS multi-negocio sin duplicar infraestructura ni disparar el costo operativo.

Este documento es la base para la implementación posterior. No reemplaza la migración; la prepara.

## Diagnóstico actual

El repo tiene dos capas que deben reconciliarse:

- un schema base centrado en un solo restaurante;
- migrations incrementales para delivery, staff PIN, RLS, QR y modificadores.

Eso funciona para un negocio.
No alcanza para SaaS.

## Objetivo de la migración

1. Agregar aislamiento por negocio con `tenant_id`.
2. Evitar que un negocio pueda leer o inferir datos de otro.
3. Mantener el stack actual lo más intacto posible para no encarecer la operación.
4. Preparar inventario, caja y suscripción mensual sin rehacer todo de nuevo.

## Estrategia recomendada

### Modelo elegido

Base de datos compartida con `tenant_id` en datos operativos.

### Motivo

- menor costo por cliente;
- onboarding más rápido;
- menos infraestructura;
- más simple para 2 desarrolladores;
- mejor para 5 clientes o más en etapa temprana.

## Nuevas tablas núcleo

### tenants

Campos sugeridos:

- `id`
- `slug`
- `name`
- `status`
- `plan`
- `timezone`
- `currency`
- `created_at`

### tenant_members

Campos sugeridos:

- `tenant_id`
- `user_id`
- `role`
- `active`
- `created_at`

### tenant_settings

Campos sugeridos:

- `tenant_id`
- `brand_name`
- `logo_url`
- `primary_color`
- `tax_enabled`
- `invoice_mode`
- `delivery_enabled`
- `inventory_enabled`
- `qr_enabled`
- `created_at`

### tenant_plan_subscriptions

Campos sugeridos:

- `tenant_id`
- `plan_code`
- `billing_cycle`
- `status`
- `starts_at`
- `ends_at`
- `trial_ends_at`
- `created_at`

## Tablas que deben llevar `tenant_id`

### Catálogo y operación

- `profiles`
- `categories`
- `menu_items`
- `modifier_groups`
- `modifier_options`
- `menu_item_modifier_groups`
- `restaurant_tables`
- `orders`
- `order_items`
- `order_item_modifiers`
- `payments`
- `reservations`
- `expenses`
- `drivers`
- `delivery_zones`
- `staff_members`
- `order_events`

### Inventario

- `inventory_items`
- `inventory_categories`
- `inventory_movements`
- `recipe_items`
- `purchase_orders`
- `purchase_order_items`

### Soporte comercial

- `customer_notes`
- `loyalty_transactions`
- `cash_sessions`
- `cash_session_movements`
- `audit_events`

## Principio de integridad

Ninguna tabla operativa debe depender solo de `role` para control de acceso.

`role` define permiso.
`tenant_id` define pertenencia.

Las dos cosas son diferentes.

## Reglas de RLS

### Regla base de lectura

Un usuario puede leer un registro solo si:

- pertenece al tenant del registro;
- y su rol permite la acción.

### Regla base de escritura

Un usuario puede escribir un registro solo si:

- pertenece al tenant del registro;
- y el rol permite esa acción;
- y el `WITH CHECK` mantiene el mismo `tenant_id`.

### Regla de admin global

El super-admin de plataforma puede ver todos los tenants, pero su acceso debe ser explícito y auditado.

## Patrón de policy

### Lectura por tenant

```sql
exists (
  select 1
  from public.tenant_members tm
  where tm.tenant_id = target.tenant_id
    and tm.user_id = auth.uid()
    and tm.active = true
)
```

### Escritura con validación

```sql
exists (
  select 1
  from public.tenant_members tm
  where tm.tenant_id = new.tenant_id
    and tm.user_id = auth.uid()
    and tm.active = true
    and tm.role in ('admin', 'waiter', 'kitchen')
)
```

## Migración por fases

### Fase A

Agregar `tenants`, `tenant_members`, `tenant_settings`, `tenant_plan_subscriptions`.

### Fase B

Agregar `tenant_id` a las tablas críticas y rellenar datos existentes con el tenant actual.

### Fase C

Reescribir RLS con tenant-aware policies.

### Fase D

Actualizar queries y flujos de login para resolver tenant activo.

### Fase E

Habilitar inventario y caja sobre el mismo tenant.

## Consideraciones para datos existentes

El sistema ya tiene data de un negocio único.
La migración debe hacer un “tenant raíz” para ese negocio actual:

- crear `tenant` principal;
- asignar todos los registros existentes a ese tenant;
- luego activar RLS multitenant.

## Impacto en frontend

### Necesario

- resolver tenant activo al iniciar sesión;
- guardar el tenant seleccionado en sesión;
- filtrar vistas por tenant;
- impedir que el usuario cambie de tenant sin permiso.

### No necesario al inicio

- reescribir todo el UI;
- separar repositorio;
- levantar microservicios.

## Impacto en negocio

### Venta del producto

- cobrar por negocio o sucursal;
- modular inventario y fiscalidad;
- vender el core como entrada barata;
- monetizar módulos de valor alto.

### Operación real

- onboarding corto;
- soporte mínimo;
- datos aislados;
- trazabilidad clara;
- cierres que cuadren con caja.

## Riesgos si no se hace

- fuga accidental entre negocios;
- reportes incorrectos;
- staff viendo datos de otro cliente;
- migraciones rotas por schema ambiguo;
- costos de soporte demasiado altos para 2 desarrolladores.

## Criterio de finalización

La migración multitenant estará lista cuando:

- exista `tenant_id` en todas las tablas operativas;
- RLS obligue pertenencia por tenant;
- el negocio raíz siga funcionando sin pérdida de datos;
- un nuevo tenant pueda crearse sin tocar código;
- los módulos de inventario y caja puedan heredar el mismo aislamiento.

