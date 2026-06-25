-- ============================================================
--  Gestión de Delivery — Repartidores + Zonas + columnas en orders
--  Run in: Supabase → SQL Editor → New Query
-- ============================================================

create extension if not exists "uuid-ossp";

-- ─── REPARTIDORES ────────────────────────────────────────────
create table public.drivers (
  id          uuid default uuid_generate_v4() primary key,
  full_name   text not null,
  phone       text not null,
  active      boolean default true,
  created_at  timestamptz default now()
);

-- ─── ZONAS DE ENTREGA ────────────────────────────────────────
-- Tarifa de domicilio editable por zona en vez de un costo fijo
create table public.delivery_zones (
  id            uuid default uuid_generate_v4() primary key,
  name          text not null,
  fee           decimal(10,2) not null default 0,
  active        boolean default true,
  display_order integer default 0,
  created_at    timestamptz default now()
);

-- ─── NUEVAS COLUMNAS EN ORDERS ───────────────────────────────
alter table public.orders add column if not exists driver_id        uuid references public.drivers on delete set null;
alter table public.orders add column if not exists delivery_zone_id uuid references public.delivery_zones on delete set null;
alter table public.orders add column if not exists delivery_fee     decimal(10,2) default 0;

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────
alter table public.drivers        enable row level security;
alter table public.delivery_zones enable row level security;

-- Repartidores: lectura pública (track.js necesita mostrar nombre/teléfono
-- al cliente que sigue su pedido), escritura solo staff (admin/waiter)
create policy "drivers_read_all" on public.drivers for select using (true);
create policy "drivers_staff_write" on public.drivers for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','waiter')));

-- Zonas: lectura pública de zonas activas (order.js las necesita para
-- calcular el costo de envío), escritura solo admin
create policy "delivery_zones_read_all" on public.delivery_zones for select using (true);
create policy "delivery_zones_admin_write" on public.delivery_zones for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
