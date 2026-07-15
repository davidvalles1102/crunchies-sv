-- ============================================================
--  Tenant Foundation — Fase A/B del plan multitenant
--  Ejecutar DESPUES de las migrations 1-14 de MIGRATIONS.md
--  (requiere que todas las tablas operativas ya existan)
--  Ejecutar ANTES de tenant_aware_rls.sql
-- ============================================================

-- Idempotente:
-- - preserva el modelo single-tenant actual como "tenant raiz"
-- - agrega tenant_id a las tablas operativas y hace backfill al tenant raiz
-- - agrega inventario base para fases posteriores
-- - la reescritura real de RLS vive en tenant_aware_rls.sql

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- 1) Core tenancy tables
-- ------------------------------------------------------------

create table if not exists public.tenants (
  id           uuid default uuid_generate_v4() primary key,
  slug         text not null unique,
  name         text not null,
  status       text not null default 'active' check (status in ('active', 'suspended', 'trial', 'archived')),
  plan         text not null default 'starter',
  timezone     text not null default 'America/El_Salvador',
  currency     text not null default 'USD',
  created_at   timestamptz not null default now()
);

create table if not exists public.tenant_members (
  id           uuid default uuid_generate_v4() primary key,
  tenant_id    uuid not null references public.tenants on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  role         text not null check (role in ('owner', 'admin', 'waiter', 'kitchen', 'delivery', 'customer')),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists public.tenant_settings (
  tenant_id        uuid primary key references public.tenants on delete cascade,
  brand_name       text,
  logo_url         text,
  primary_color    text,
  tax_enabled      boolean not null default true,
  invoice_mode     text not null default 'manual' check (invoice_mode in ('manual', 'electronic', 'export')),
  delivery_enabled boolean not null default true,
  inventory_enabled boolean not null default false,
  qr_enabled       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.tenant_plan_subscriptions (
  id              uuid default uuid_generate_v4() primary key,
  tenant_id       uuid not null references public.tenants on delete cascade,
  plan_code       text not null,
  billing_cycle   text not null check (billing_cycle in ('monthly', 'quarterly', 'yearly')),
  status          text not null check (status in ('trial', 'active', 'past_due', 'cancelled', 'paused')),
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz,
  trial_ends_at   timestamptz,
  created_at      timestamptz not null default now()
);

-- Root tenant for the current restaurant data.
insert into public.tenants (slug, name, status, plan, timezone, currency)
values ('crunchies-root', 'Crunchies Mi Rancho', 'active', 'starter', 'America/El_Salvador', 'USD')
on conflict (slug) do nothing;

-- ------------------------------------------------------------
-- 2) Add tenant_id to core operational tables
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists tenant_id uuid;

alter table public.categories
  add column if not exists tenant_id uuid;

alter table public.menu_items
  add column if not exists tenant_id uuid;

alter table public.modifier_groups
  add column if not exists tenant_id uuid;

alter table public.modifier_options
  add column if not exists tenant_id uuid;

alter table public.menu_item_modifier_groups
  add column if not exists tenant_id uuid;

alter table public.restaurant_tables
  add column if not exists tenant_id uuid;

alter table public.reservations
  add column if not exists tenant_id uuid;

alter table public.orders
  add column if not exists tenant_id uuid;

alter table public.order_items
  add column if not exists tenant_id uuid;

alter table public.order_item_modifiers
  add column if not exists tenant_id uuid;

alter table public.payments
  add column if not exists tenant_id uuid;

alter table public.loyalty_transactions
  add column if not exists tenant_id uuid;

alter table public.expenses
  add column if not exists tenant_id uuid;

alter table public.drivers
  add column if not exists tenant_id uuid;

alter table public.delivery_zones
  add column if not exists tenant_id uuid;

alter table public.staff_members
  add column if not exists tenant_id uuid;

alter table public.order_events
  add column if not exists tenant_id uuid;

alter table public.customer_notes
  add column if not exists tenant_id uuid;

-- ------------------------------------------------------------
-- 2b) DEFAULT = tenant raiz en cada columna tenant_id
-- ------------------------------------------------------------
-- CRITICO: el frontend actual (OrdersClient, MenuManagementClient,
-- ExpenseTrackerClient, DeliveryClient, ReservationsClient, OrderClient,
-- WaiterPortalClient, TableOrderClient) todavia NO manda tenant_id en sus
-- inserts a estas tablas — solo lo hace en las tablas nuevas (cash_sessions,
-- inventory_items). Sin este DEFAULT, en cuanto tenant_aware_rls.sql ponga
-- tenant_id NOT NULL, CUALQUIER insert nuevo (una orden, un item de menu,
-- un pago) fallaria en producción con "null value in column tenant_id
-- violates not-null constraint" — es decir, el POS se rompe por completo.
-- Con este DEFAULT, todo insert que no mande tenant_id explicitamente cae
-- automaticamente en el tenant raiz (el comportamiento correcto mientras
-- solo exista un negocio) y sigue funcionando exactamente igual que hoy.

do $$
declare
  v_root_id uuid;
  t record;
begin
  select id into v_root_id from public.tenants where slug = 'crunchies-root';

  for t in
    select * from (values
      ('profiles'), ('categories'), ('menu_items'), ('modifier_groups'),
      ('modifier_options'), ('menu_item_modifier_groups'), ('restaurant_tables'),
      ('reservations'), ('orders'), ('order_items'), ('order_item_modifiers'),
      ('payments'), ('loyalty_transactions'), ('expenses'), ('drivers'),
      ('delivery_zones'), ('staff_members'), ('order_events'), ('customer_notes')
    ) as x(table_name)
  loop
    execute format('alter table public.%I alter column tenant_id set default %L::uuid', t.table_name, v_root_id);
  end loop;
end $$;

-- Inventory scaffolding for later phases.
create table if not exists public.inventory_items (
  id              uuid default uuid_generate_v4() primary key,
  tenant_id       uuid not null references public.tenants on delete cascade,
  name            text not null,
  sku             text,
  unit            text not null default 'unit',
  cost            numeric(10,2) not null default 0,
  stock_on_hand   numeric(12,3) not null default 0,
  reorder_point   numeric(12,3) not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, sku)
);

create table if not exists public.inventory_movements (
  id              uuid default uuid_generate_v4() primary key,
  tenant_id       uuid not null references public.tenants on delete cascade,
  inventory_item_id uuid not null references public.inventory_items on delete cascade,
  movement_type   text not null check (movement_type in ('in', 'out', 'adjustment', 'waste', 'transfer')),
  quantity        numeric(12,3) not null,
  reason          text,
  reference_type  text,
  reference_id    uuid,
  created_by      uuid references public.profiles on delete set null,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3) Backfill existing data to the root tenant
-- ------------------------------------------------------------

update public.profiles p
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and p.tenant_id is null;

update public.categories c
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and c.tenant_id is null;

update public.menu_items m
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and m.tenant_id is null;

update public.modifier_groups g
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and g.tenant_id is null;

update public.modifier_options o
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and o.tenant_id is null;

update public.menu_item_modifier_groups j
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and j.tenant_id is null;

update public.restaurant_tables rt
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and rt.tenant_id is null;

update public.reservations r
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and r.tenant_id is null;

update public.orders o
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and o.tenant_id is null;

update public.order_items oi
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and oi.tenant_id is null;

update public.order_item_modifiers oim
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and oim.tenant_id is null;

update public.payments p
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and p.tenant_id is null;

update public.loyalty_transactions lt
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and lt.tenant_id is null;

update public.expenses e
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and e.tenant_id is null;

update public.drivers d
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and d.tenant_id is null;

update public.delivery_zones z
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and z.tenant_id is null;

update public.staff_members s
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and s.tenant_id is null;

update public.order_events e
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and e.tenant_id is null;

update public.inventory_items i
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and i.tenant_id is null;

update public.inventory_movements m
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and m.tenant_id is null;

update public.customer_notes n
set tenant_id = t.id
from public.tenants t
where t.slug = 'crunchies-root'
  and n.tenant_id is null;

-- Membresia de tenant para los perfiles de staff ya existentes (admin/waiter/kitchen).
-- Los perfiles 'customer' no reciben membership: son globales, no pertenecen a un tenant.
insert into public.tenant_members (tenant_id, user_id, role, active)
select t.id, p.id, p.role, true
from public.profiles p
cross join (select id from public.tenants where slug = 'crunchies-root') t
where p.role in ('admin', 'waiter', 'kitchen')
on conflict (tenant_id, user_id) do nothing;

-- ------------------------------------------------------------
-- 4) Foreign key helpers
-- ------------------------------------------------------------

-- Postgres no soporta "ADD CONSTRAINT IF NOT EXISTS": se envuelve cada uno
-- en un DO block para que el archivo sea re-ejecutable sin error.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('profiles', 'profiles_tenant_fkey'),
      ('categories', 'categories_tenant_fkey'),
      ('menu_items', 'menu_items_tenant_fkey'),
      ('modifier_groups', 'modifier_groups_tenant_fkey'),
      ('modifier_options', 'modifier_options_tenant_fkey'),
      ('menu_item_modifier_groups', 'menu_item_modifier_groups_tenant_fkey'),
      ('restaurant_tables', 'restaurant_tables_tenant_fkey'),
      ('reservations', 'reservations_tenant_fkey'),
      ('orders', 'orders_tenant_fkey'),
      ('order_items', 'order_items_tenant_fkey'),
      ('order_item_modifiers', 'order_item_modifiers_tenant_fkey'),
      ('payments', 'payments_tenant_fkey'),
      ('loyalty_transactions', 'loyalty_transactions_tenant_fkey'),
      ('expenses', 'expenses_tenant_fkey'),
      ('drivers', 'drivers_tenant_fkey'),
      ('delivery_zones', 'delivery_zones_tenant_fkey'),
      ('staff_members', 'staff_members_tenant_fkey'),
      ('order_events', 'order_events_tenant_fkey'),
      ('customer_notes', 'customer_notes_tenant_fkey'),
      ('inventory_items', 'inventory_items_tenant_fkey'),
      ('inventory_movements', 'inventory_movements_tenant_fkey')
    ) as x(table_name, constraint_name)
  loop
    if not exists (
      select 1 from pg_constraint where conname = t.constraint_name
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (tenant_id) references public.tenants(id) on delete cascade',
        t.table_name, t.constraint_name
      );
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5) Helper functions para RLS tenant-aware (usadas en tenant_aware_rls.sql)
-- ------------------------------------------------------------

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.active = true
  );
$$;

create or replace function public.is_tenant_role(p_tenant_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.active = true
      and tm.role = any (p_roles)
  );
$$;

-- SECURITY DEFINER es obligatorio aqui: anon no tiene ninguna policy de
-- lectura sobre `tenants` (tenants_member_read/tenants_platform_admin_read
-- exigen membership o profiles.role='admin', que un visitante anonimo
-- nunca tiene). Un `exists (select ... from tenants ...)` normal dentro de
-- un WITH CHECK corre con los privilegios del rol que hace el INSERT — es
-- decir, para anon esa subquery siempre veria 0 filas y el check fallaria
-- SIEMPRE, incluso con un tenant activo real. Con SECURITY DEFINER esta
-- funcion bypasea esa RLS solo para esta pregunta puntual (¿existe y esta
-- activo?), igual que is_tenant_member/is_tenant_role bypasean RLS de
-- tenant_members para poder evaluarla desde cualquier rol.
create or replace function public.is_tenant_active(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenants t where t.id = p_tenant_id and t.status in ('active', 'trial')
  );
$$;

-- ------------------------------------------------------------
-- 5b) award_loyalty_points ahora propaga tenant_id
-- ------------------------------------------------------------
-- loyalty_points_fix.sql (migration #9, corre ANTES que este archivo) crea
-- esta funcion sin tenant_id porque en ese punto la columna todavia no
-- existe en `orders`/`loyalty_transactions`. Se redefine aqui — recien
-- despues del backfill de la seccion 2/3 de este archivo es seguro
-- referenciar new.tenant_id sin romper el trigger para pedidos que se
-- paguen/entreguen mientras se aplican estas migrations.
create or replace function public.award_loyalty_points()
returns trigger language plpgsql security definer as $$
declare
  pts integer;
  already_awarded boolean;
begin
  if new.customer_id is null then
    return new;
  end if;

  if not (
    new.status = 'paid'
    or (new.order_type in ('delivery','takeout') and new.status = 'delivered')
  ) then
    return new;
  end if;

  if old.status = new.status then
    return new;
  end if;

  select exists(select 1 from public.loyalty_transactions where order_id = new.id and type = 'earned')
    into already_awarded;
  if already_awarded then
    return new;
  end if;

  pts := floor(new.total);
  if pts <= 0 then
    return new;
  end if;

  insert into public.loyalty_transactions (customer_id, order_id, points, type, tenant_id)
  values (new.customer_id, new.id, pts, 'earned', new.tenant_id);

  update public.profiles set loyalty_points = loyalty_points + pts where id = new.customer_id;

  return new;
end;
$$;

-- Las policies reales (rewrite de RLS existente + WITH CHECK de escritura)
-- viven en tenant_aware_rls.sql — correr ese archivo justo despues de este.

-- ------------------------------------------------------------
-- 6) Verification queries
-- ------------------------------------------------------------

-- select table_name
-- from information_schema.columns
-- where column_name = 'tenant_id'
-- order by table_name;

-- select *
-- from public.tenants;

