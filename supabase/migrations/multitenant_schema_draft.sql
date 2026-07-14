-- ============================================================
--  Multitenant Schema Draft
--  Purpose: blueprint for tenant-aware SaaS migration
--  Status: DRAFT ONLY - do not run against production yet
-- ============================================================

-- This file is intentionally conservative:
-- - idempotent where possible
-- - preserves the single-tenant data model as the "root tenant"
-- - adds tenant scaffolding before tightening RLS

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
  timezone     text not null default 'America/Mexico_City',
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
values ('crunchies-root', 'Crunchies Mi Rancho', 'active', 'starter', 'America/Mexico_City', 'USD')
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

-- Default tenant membership for currently seeded admin profile(s) is left to manual assignment
-- because auth.users and profiles may not be synchronized in every environment.

-- ------------------------------------------------------------
-- 4) Foreign key helpers
-- ------------------------------------------------------------

alter table public.profiles
  add constraint profiles_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.categories
  add constraint categories_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.menu_items
  add constraint menu_items_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.modifier_groups
  add constraint modifier_groups_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.modifier_options
  add constraint modifier_options_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.menu_item_modifier_groups
  add constraint menu_item_modifier_groups_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.restaurant_tables
  add constraint restaurant_tables_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.reservations
  add constraint reservations_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.orders
  add constraint orders_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.order_items
  add constraint order_items_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.order_item_modifiers
  add constraint order_item_modifiers_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.payments
  add constraint payments_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.loyalty_transactions
  add constraint loyalty_transactions_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.expenses
  add constraint expenses_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.drivers
  add constraint drivers_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.delivery_zones
  add constraint delivery_zones_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.staff_members
  add constraint staff_members_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.order_events
  add constraint order_events_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.inventory_items
  add constraint inventory_items_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

alter table public.inventory_movements
  add constraint inventory_movements_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;

-- ------------------------------------------------------------
-- 5) Multitenant RLS strategy
-- ------------------------------------------------------------

-- NOTE:
-- Existing policies must be refactored to include tenant membership checks.
-- This file documents the direction and provides the core helper function.

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

-- Example policies to be applied after all tenant_id values are present.
-- They are left commented to avoid breaking current environments prematurely.

-- create policy "orders_tenant_read" on public.orders for select
--   using (public.is_tenant_member(tenant_id));
--
-- create policy "orders_tenant_write" on public.orders for insert, update
--   using (public.is_tenant_role(tenant_id, array['owner','admin','waiter','kitchen']))
--   with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter','kitchen']));

-- ------------------------------------------------------------
-- 6) Verification queries
-- ------------------------------------------------------------

-- select table_name
-- from information_schema.columns
-- where column_name = 'tenant_id'
-- order by table_name;

-- select *
-- from public.tenants;

