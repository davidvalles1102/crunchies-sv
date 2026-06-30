-- ============================================================
--  Variaciones de Producto (Modificadores) — Schema + RLS
--  Run in: Supabase → SQL Editor → New Query
-- ============================================================

create extension if not exists "uuid-ossp";

-- ─── GRUPOS DE MODIFICADORES ─────────────────────────────────
-- Ej: "Tamaño de pan", "Extras", "Término de la carne"
create table public.modifier_groups (
  id             uuid default uuid_generate_v4() primary key,
  name           text not null,
  selection_type text not null default 'single' check (selection_type in ('single','multiple')),
  required       boolean default false,
  max_select     integer,                 -- límite de opciones si selection_type = 'multiple'
  display_order  integer default 0,
  created_at     timestamptz default now()
);

-- ─── OPCIONES ─────────────────────────────────────────────────
-- Ej: "Sencillo" +$0, "Doble" +$1.50, "Con queso" +$0.75
create table public.modifier_options (
  id            uuid default uuid_generate_v4() primary key,
  group_id      uuid references public.modifier_groups on delete cascade not null,
  name          text not null,
  price_delta   decimal(10,2) not null default 0,
  is_default    boolean default false,
  display_order integer default 0,
  created_at    timestamptz default now()
);

-- ─── ASIGNACIÓN A PLATILLOS ───────────────────────────────────
-- Un grupo (ej. "Tamaño de pan") puede aplicar a muchos platillos
create table public.menu_item_modifier_groups (
  menu_item_id      uuid references public.menu_items on delete cascade not null,
  modifier_group_id uuid references public.modifier_groups on delete cascade not null,
  primary key (menu_item_id, modifier_group_id)
);

-- ─── SNAPSHOT DE LO ELEGIDO POR LÍNEA DE ORDEN ───────────────
-- Igual criterio que item_name/item_price en order_items: no depende
-- de modifier_options para que cambios futuros de precio no alteren
-- órdenes ya facturadas.
create table public.order_item_modifiers (
  id            uuid default uuid_generate_v4() primary key,
  order_item_id uuid references public.order_items on delete cascade not null,
  option_name   text not null,
  price_delta   decimal(10,2) not null default 0,
  created_at    timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────
alter table public.modifier_groups           enable row level security;
alter table public.modifier_options           enable row level security;
alter table public.menu_item_modifier_groups   enable row level security;
alter table public.order_item_modifiers        enable row level security;

-- Lectura pública (menú, POS, pedido web) — mismo criterio que categories/menu_items
create policy "modifier_groups_read_all" on public.modifier_groups for select using (true);
create policy "modifier_options_read_all" on public.modifier_options for select using (true);
create policy "menu_item_modifier_groups_read_all" on public.menu_item_modifier_groups for select using (true);

-- Escritura solo admin
create policy "modifier_groups_admin_write" on public.modifier_groups for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "modifier_options_admin_write" on public.modifier_options for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "menu_item_modifier_groups_admin_write" on public.menu_item_modifier_groups for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- order_item_modifiers: mismo patrón que order_items (ver anon_ordering_rls.sql / fix_tables_and_rls.sql)
create policy "order_item_modifiers_staff" on public.order_item_modifiers for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','waiter','kitchen')));

create policy "order_item_modifiers_anon_insert" on public.order_item_modifiers for insert
  to anon
  with check (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id
        and o.customer_id is null
        and o.created_at > now() - interval '10 minutes'
    )
  );

create policy "order_item_modifiers_customer_insert" on public.order_item_modifiers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id
        and o.customer_id = auth.uid()
    )
  );
