-- ============================================================
--  Neón y Sabor Mi Rancho — Supabase Schema
--  Run this entire file in: Supabase → SQL Editor → New Query
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ─── PROFILES ────────────────────────────────────────────────
create table public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  full_name    text,
  phone        text,
  role         text default 'customer'
                 check (role in ('customer','waiter','kitchen','admin')),
  loyalty_points integer default 0,
  avatar_url   text,
  created_at   timestamptz default now()
);

-- Auto-create profile on new auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── CATEGORIES ──────────────────────────────────────────────
create table public.categories (
  id            uuid default uuid_generate_v4() primary key,
  name          text not null,
  icon          text default '🍽️',
  display_order integer default 0,
  active        boolean default true,
  created_at    timestamptz default now()
);

-- ─── MENU ITEMS ──────────────────────────────────────────────
create table public.menu_items (
  id           uuid default uuid_generate_v4() primary key,
  category_id  uuid references public.categories on delete set null,
  name         text not null,
  description  text,
  price        decimal(10,2) not null check (price >= 0),
  image_url    text,
  available    boolean default true,
  is_featured  boolean default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ─── RESTAURANT TABLES ───────────────────────────────────────
create table public.restaurant_tables (
  id        uuid default uuid_generate_v4() primary key,
  number    integer not null unique,
  capacity  integer not null,
  location  text default 'Salón Principal' check (location in ('Zona VIP','Zona Fogata','Exterior','Salón Principal')),
  status    text default 'available'
              check (status in ('available','occupied','reserved','maintenance')),
  created_at timestamptz default now()
);

-- ─── RESERVATIONS ────────────────────────────────────────────
create table public.reservations (
  id               uuid default uuid_generate_v4() primary key,
  customer_id      uuid references public.profiles on delete set null,
  table_id         uuid references public.restaurant_tables on delete set null,
  reservation_date date not null,
  reservation_time time not null,
  party_size       integer not null check (party_size > 0),
  status           text default 'pending'
                     check (status in ('pending','confirmed','seated','cancelled','no_show')),
  notes            text,
  created_at       timestamptz default now()
);

-- ─── ORDERS ──────────────────────────────────────────────────
create table public.orders (
  id          uuid default uuid_generate_v4() primary key,
  table_id    uuid references public.restaurant_tables on delete set null,
  customer_id uuid references public.profiles on delete set null,
  waiter_id   uuid references public.profiles on delete set null,
  status      text default 'open'
                check (status in ('open','in_kitchen','ready','delivered','paid','cancelled')),
  subtotal    decimal(10,2) default 0,
  tax         decimal(10,2) default 0,
  total       decimal(10,2) default 0,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─── ORDER ITEMS ─────────────────────────────────────────────
create table public.order_items (
  id            uuid default uuid_generate_v4() primary key,
  order_id      uuid references public.orders on delete cascade not null,
  menu_item_id  uuid references public.menu_items on delete set null,
  item_name     text not null,
  item_price    decimal(10,2) not null,
  quantity      integer not null default 1 check (quantity > 0),
  notes         text,
  status        text default 'pending'
                  check (status in ('pending','preparing','ready','delivered')),
  created_at    timestamptz default now()
);

-- ─── PAYMENTS ────────────────────────────────────────────────
create table public.payments (
  id             uuid default uuid_generate_v4() primary key,
  order_id       uuid references public.orders on delete set null,
  processed_by   uuid references public.profiles on delete set null,
  amount         decimal(10,2) not null,
  method         text not null check (method in ('cash','card','transfer','points')),
  receipt_number text unique,
  change_amount  decimal(10,2) default 0,
  created_at     timestamptz default now()
);

-- ─── LOYALTY TRANSACTIONS ────────────────────────────────────
create table public.loyalty_transactions (
  id          uuid default uuid_generate_v4() primary key,
  customer_id uuid references public.profiles on delete cascade not null,
  order_id    uuid references public.orders on delete set null,
  points      integer not null,
  type        text check (type in ('earned','redeemed')),
  created_at  timestamptz default now()
);

-- ─── VIEWS ───────────────────────────────────────────────────
create or replace view public.orders_with_items as
select
  o.*,
  rt.number         as table_number,
  w.full_name       as waiter_name,
  c.full_name       as customer_name,
  json_agg(
    json_build_object(
      'id',         oi.id,
      'item_name',  oi.item_name,
      'quantity',   oi.quantity,
      'item_price', oi.item_price,
      'notes',      oi.notes,
      'status',     oi.status
    ) order by oi.created_at
  ) filter (where oi.id is not null) as items
from public.orders o
left join public.restaurant_tables rt on rt.id = o.table_id
left join public.profiles w           on w.id  = o.waiter_id
left join public.profiles c           on c.id  = o.customer_id
left join public.order_items oi       on oi.order_id = o.id
group by o.id, rt.number, w.full_name, c.full_name;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────
alter table public.profiles            enable row level security;
alter table public.categories          enable row level security;
alter table public.menu_items          enable row level security;
alter table public.restaurant_tables   enable row level security;
alter table public.reservations        enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.payments            enable row level security;
alter table public.loyalty_transactions enable row level security;

-- Profiles: users see/edit own row; admins/waiters see all
create policy "profile_select_own"   on public.profiles for select using (auth.uid() = id);
create policy "profile_update_own"   on public.profiles for update using (auth.uid() = id);
create policy "profile_insert_own"   on public.profiles for insert with check (auth.uid() = id);
create policy "staff_select_profiles" on public.profiles for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','waiter')));

-- Categories: public read, admin write
create policy "cat_read_all"   on public.categories for select using (true);
create policy "cat_admin_write" on public.categories for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Menu items: public read, admin write
create policy "menu_read_all"  on public.menu_items for select using (true);
create policy "menu_admin_write" on public.menu_items for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Restaurant tables: staff read, admin write
create policy "tables_read_staff" on public.restaurant_tables for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','waiter','kitchen')));
create policy "tables_admin_write" on public.restaurant_tables for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Reservations: customers see own; staff see all
create policy "reserv_customer_own" on public.reservations for select using (customer_id = auth.uid());
create policy "reserv_customer_insert" on public.reservations for insert with check (customer_id = auth.uid());
create policy "reserv_staff_all" on public.reservations for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','waiter')));

-- Orders: staff full access
create policy "orders_staff" on public.orders for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','waiter','kitchen')));

-- Order items: staff full access
create policy "order_items_staff" on public.order_items for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','waiter','kitchen')));

-- Payments: admin/waiter
create policy "payments_staff" on public.payments for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','waiter')));

-- Loyalty: customers see own; admin all
create policy "loyalty_own" on public.loyalty_transactions for select using (customer_id = auth.uid());
create policy "loyalty_admin" on public.loyalty_transactions for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ─── REALTIME ────────────────────────────────────────────────
-- Enable realtime on orders and order_items for kitchen display
-- Go to: Supabase → Database → Replication → enable for orders, order_items
