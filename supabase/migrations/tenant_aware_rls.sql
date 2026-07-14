-- ============================================================
--  Tenant-aware RLS — Fase C del plan multitenant
--  Ejecutar DESPUES de tenant_foundation.sql
-- ============================================================
--
-- Por que se dropean policies dinamicamente en vez de por nombre:
-- MIGRATIONS.md documenta que la DB de produccion ya diverge de los
-- nombres originales de schema.sql / modifiers_schema.sql / expenses_rls.sql
-- (create_missing_tables.sql las reemplazo con otros nombres: "mod_groups_read",
-- "oim_staff", "expenses_admin", etc). Adivinar el nombre exacto y hacer
-- DROP POLICY IF EXISTS "nombre-adivinado" es un no-op silencioso si el
-- nombre real es otro — la policy vieja, mas permisiva, se queda activa y
-- Postgres hace OR entre policies permisivas, asi que el aislamiento por
-- tenant quedaria roto aunque este archivo "corra bien". En vez de eso,
-- se dropea TODA policy existente en la tabla (sea cual sea su nombre) y
-- se crea el set nuevo tenant-aware desde cero.

do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles', 'categories', 'menu_items', 'modifier_groups',
        'modifier_options', 'menu_item_modifier_groups', 'restaurant_tables',
        'reservations', 'orders', 'order_items', 'order_item_modifiers',
        'payments', 'loyalty_transactions', 'expenses', 'drivers',
        'delivery_zones', 'staff_members', 'order_events', 'customer_notes'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 0) tenant_id deja de ser opcional en las tablas operativas
-- ------------------------------------------------------------
-- Requiere que tenant_foundation.sql ya haya hecho el backfill al tenant raiz.

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('profiles'), ('categories'), ('menu_items'), ('modifier_groups'),
      ('modifier_options'), ('menu_item_modifier_groups'), ('restaurant_tables'),
      ('reservations'), ('orders'), ('order_items'), ('order_item_modifiers'),
      ('payments'), ('loyalty_transactions'), ('expenses'), ('drivers'),
      ('delivery_zones'), ('staff_members'), ('order_events'), ('customer_notes'),
      ('inventory_items'), ('inventory_movements')
    ) as x(table_name)
  loop
    execute format('alter table public.%I alter column tenant_id set not null', t.table_name);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 1) profiles
-- ------------------------------------------------------------
-- Cada usuario ve/edita su propia fila. El staff ademas ve los perfiles
-- de gente que comparte un tenant con el (via tenant_members, no via
-- profiles.tenant_id: un cliente no "pertenece" a un tenant, puede pedir
-- en varios negocios distintos).

create policy "profile_select_own" on public.profiles for select
  using (auth.uid() = id);
create policy "profile_update_own" on public.profiles for update
  using (auth.uid() = id);
create policy "profile_insert_own" on public.profiles for insert
  with check (auth.uid() = id);

create policy "staff_select_profiles" on public.profiles for select
  using (
    exists (
      select 1
      from public.tenant_members tm_self
      join public.tenant_members tm_target
        on tm_target.tenant_id = tm_self.tenant_id
      where tm_self.user_id = auth.uid()
        and tm_self.active = true
        and tm_target.user_id = profiles.id
        and tm_target.active = true
    )
  );

-- ------------------------------------------------------------
-- 2) categories — lectura publica (el frontend filtra por tenant_id en
--    la query, ver MULTITENANT_FRONTEND_IMPACT.md), escritura por tenant
-- ------------------------------------------------------------

create policy "cat_read_all" on public.categories for select using (true);
create policy "cat_admin_write" on public.categories for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

-- ------------------------------------------------------------
-- 3) menu_items
-- ------------------------------------------------------------

create policy "menu_read_all" on public.menu_items for select using (true);
create policy "menu_admin_write" on public.menu_items for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

-- ------------------------------------------------------------
-- 4) modifier_groups / modifier_options / menu_item_modifier_groups
-- ------------------------------------------------------------

create policy "modifier_groups_read_all" on public.modifier_groups for select using (true);
create policy "modifier_groups_admin_write" on public.modifier_groups for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

create policy "modifier_options_read_all" on public.modifier_options for select using (true);
create policy "modifier_options_admin_write" on public.modifier_options for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

create policy "menu_item_modifier_groups_read_all" on public.menu_item_modifier_groups for select using (true);
create policy "menu_item_modifier_groups_admin_write" on public.menu_item_modifier_groups for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

-- ------------------------------------------------------------
-- 5) restaurant_tables
-- ------------------------------------------------------------

-- Lectura publica: el flujo QR anonimo necesita cargar la mesa antes de
-- cualquier login. El aislamiento real para anon viene de que el frontend
-- siempre filtra por tenant_id resuelto desde la URL/QR (no hay auth.uid()
-- para que RLS lo resuelva del lado servidor en ese caso).
create policy "tables_read_all" on public.restaurant_tables for select using (true);

create policy "tables_staff_write" on public.restaurant_tables for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','waiter']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter']));

-- Anon/cliente puede marcar una mesa como ocupada al escanear el QR
-- (una sola direccion: solo el staff puede volverla a 'available' al cobrar,
-- via tables_staff_write — mismo comportamiento que en produccion hoy)
create policy "tables_anon_update" on public.restaurant_tables for update
  to anon, authenticated
  using (true)
  with check (status = 'occupied');

-- ------------------------------------------------------------
-- 6) reservations
-- ------------------------------------------------------------

create policy "reserv_customer_own" on public.reservations for select
  using (customer_id = auth.uid());
create policy "reserv_customer_insert" on public.reservations for insert
  with check (customer_id = auth.uid());
create policy "reserv_staff_all" on public.reservations for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','waiter']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter']));

-- ------------------------------------------------------------
-- 7) orders / order_items / order_item_modifiers
-- ------------------------------------------------------------

create policy "orders_staff" on public.orders for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','waiter','kitchen','delivery']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter','kitchen','delivery']));

create policy "orders_customer_own" on public.orders for select
  using (customer_id = auth.uid());

create policy "orders_customer_insert" on public.orders for insert
  to authenticated
  with check (
    (customer_id = auth.uid() or customer_id is null)
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.status = 'active')
  );

-- Pedidos anonimos via QR (sin cuenta de cliente): el tenant_id lo fija el
-- frontend a partir de la mesa/QR escaneado.
create policy "orders_anon_insert" on public.orders for insert
  to anon
  with check (
    customer_id is null
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.status = 'active')
  );

create policy "orders_anon_read" on public.orders for select
  to anon
  using (customer_id is null and created_at > now() - interval '24 hours');

create policy "order_items_staff" on public.order_items for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','waiter','kitchen','delivery']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter','kitchen','delivery']));

create policy "order_items_customer_insert" on public.order_items for insert
  to authenticated
  with check (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );

create policy "order_items_anon_insert" on public.order_items for insert
  to anon
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.customer_id is null
        and o.created_at > now() - interval '10 minutes'
    )
  );

create policy "order_item_modifiers_staff" on public.order_item_modifiers for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','waiter','kitchen','delivery']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter','kitchen','delivery']));

create policy "order_item_modifiers_customer_insert" on public.order_item_modifiers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id and o.customer_id = auth.uid()
    )
  );

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

-- ------------------------------------------------------------
-- 8) payments
-- ------------------------------------------------------------

create policy "payments_staff" on public.payments for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','waiter']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter']));

-- ------------------------------------------------------------
-- 9) loyalty_transactions
-- ------------------------------------------------------------

create policy "loyalty_own" on public.loyalty_transactions for select
  using (customer_id = auth.uid());
create policy "loyalty_admin" on public.loyalty_transactions for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

-- ------------------------------------------------------------
-- 10) drivers / delivery_zones
-- ------------------------------------------------------------

-- Lectura publica: track.js muestra nombre/telefono del repartidor al
-- cliente sin login, y order.js necesita las tarifas antes de cualquier auth.
create policy "drivers_read_all" on public.drivers for select using (true);
create policy "drivers_staff_write" on public.drivers for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','waiter']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter']));

create policy "delivery_zones_read_all" on public.delivery_zones for select using (true);
create policy "delivery_zones_admin_write" on public.delivery_zones for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

-- ------------------------------------------------------------
-- 11) expenses
-- ------------------------------------------------------------

create policy "expenses_admin_all" on public.expenses for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

-- ------------------------------------------------------------
-- 12) customer_notes
-- ------------------------------------------------------------

create policy "customer_notes_staff" on public.customer_notes for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','waiter']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter']));

-- ------------------------------------------------------------
-- 13) staff_members (cuentas del portal PIN)
-- ------------------------------------------------------------

create policy "staff_members_admin" on public.staff_members for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

-- ------------------------------------------------------------
-- 14) order_events
-- ------------------------------------------------------------

create policy "order_events_admin" on public.order_events for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

create policy "order_events_staff_insert" on public.order_events for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

create policy "order_events_staff_select" on public.order_events for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

-- ------------------------------------------------------------
-- 15) inventory_items / inventory_movements (nuevas, sin policies previas)
-- ------------------------------------------------------------

alter table public.inventory_items    enable row level security;
alter table public.inventory_movements enable row level security;

drop policy if exists "inventory_items_read" on public.inventory_items;
create policy "inventory_items_read" on public.inventory_items for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists "inventory_items_write" on public.inventory_items;
create policy "inventory_items_write" on public.inventory_items for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

drop policy if exists "inventory_movements_read" on public.inventory_movements;
create policy "inventory_movements_read" on public.inventory_movements for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists "inventory_movements_write" on public.inventory_movements;
create policy "inventory_movements_write" on public.inventory_movements for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','kitchen']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','kitchen']));

-- ------------------------------------------------------------
-- 16) tenants / tenant_members / tenant_settings / tenant_plan_subscriptions
-- ------------------------------------------------------------

alter table public.tenants                   enable row level security;
alter table public.tenant_members            enable row level security;
alter table public.tenant_settings           enable row level security;
alter table public.tenant_plan_subscriptions enable row level security;

drop policy if exists "tenants_member_read" on public.tenants;
create policy "tenants_member_read" on public.tenants for select
  using (public.is_tenant_member(id));

drop policy if exists "tenants_owner_write" on public.tenants;
create policy "tenants_owner_write" on public.tenants for update
  using (public.is_tenant_role(id, array['owner','admin']))
  with check (public.is_tenant_role(id, array['owner','admin']));

drop policy if exists "tenant_members_self_read" on public.tenant_members;
create policy "tenant_members_self_read" on public.tenant_members for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists "tenant_members_owner_write" on public.tenant_members;
create policy "tenant_members_owner_write" on public.tenant_members for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

drop policy if exists "tenant_settings_member_read" on public.tenant_settings;
create policy "tenant_settings_member_read" on public.tenant_settings for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists "tenant_settings_owner_write" on public.tenant_settings;
create policy "tenant_settings_owner_write" on public.tenant_settings for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

drop policy if exists "tenant_plan_subscriptions_member_read" on public.tenant_plan_subscriptions;
create policy "tenant_plan_subscriptions_member_read" on public.tenant_plan_subscriptions for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists "tenant_plan_subscriptions_owner_write" on public.tenant_plan_subscriptions;
create policy "tenant_plan_subscriptions_owner_write" on public.tenant_plan_subscriptions for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

-- ------------------------------------------------------------
-- 17) Verificacion — correr manualmente despues de aplicar este archivo
-- ------------------------------------------------------------

-- select tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public'
-- order by tablename, policyname;

-- select table_name, column_name
-- from information_schema.columns
-- where column_name = 'tenant_id' and is_nullable = 'NO'
-- order by table_name;
