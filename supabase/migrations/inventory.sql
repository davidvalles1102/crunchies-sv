-- ============================================================
--  Inventario completo — Fase 6 del plan multitenant
--  Ejecutar DESPUES de tenant_foundation.sql y tenant_aware_rls.sql
--  (inventory_items/inventory_movements ya existen desde tenant_foundation.sql;
--  este archivo agrega consumo por receta y movimientos atomicos)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- 1) recipe_items — cuanto inventario consume cada platillo por unidad vendida
-- ------------------------------------------------------------

create table if not exists public.recipe_items (
  id                uuid default uuid_generate_v4() primary key,
  tenant_id         uuid not null references public.tenants on delete cascade,
  menu_item_id      uuid not null references public.menu_items on delete cascade,
  inventory_item_id uuid not null references public.inventory_items on delete cascade,
  quantity_per_unit numeric(12,3) not null check (quantity_per_unit > 0),
  created_at        timestamptz not null default now(),
  unique (menu_item_id, inventory_item_id)
);

alter table public.recipe_items enable row level security;

drop policy if exists "recipe_items_read" on public.recipe_items;
create policy "recipe_items_read" on public.recipe_items for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists "recipe_items_write" on public.recipe_items;
create policy "recipe_items_write" on public.recipe_items for all
  using (public.is_tenant_role(tenant_id, array['owner','admin']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin']));

-- ------------------------------------------------------------
-- 2) Movimiento atomico: toda alta/ajuste/merma pasa por aqui, nunca un
--    UPDATE directo a stock_on_hand — asi el stock siempre es explicable
--    por su historial de movimientos (ver OPERATIONAL_SCENARIOS.md).
-- ------------------------------------------------------------

create or replace function public.record_inventory_movement(
  p_inventory_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_delta numeric;
  v_movement public.inventory_movements%rowtype;
begin
  select * into v_item from public.inventory_items where id = p_inventory_item_id;
  if not found then
    raise exception 'inventory_item_not_found' using errcode = 'P0002';
  end if;
  if not public.is_tenant_role(v_item.tenant_id, array['owner','admin','kitchen']) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_movement_type not in ('in', 'out', 'adjustment', 'waste', 'transfer') then
    raise exception 'invalid_movement_type' using errcode = '22023';
  end if;

  v_delta := case when p_movement_type = 'in' then p_quantity else -p_quantity end;

  update public.inventory_items
  set stock_on_hand = stock_on_hand + v_delta,
      updated_at = now()
  where id = p_inventory_item_id;

  insert into public.inventory_movements
    (tenant_id, inventory_item_id, movement_type, quantity, reason, reference_type, reference_id, created_by)
  values
    (v_item.tenant_id, p_inventory_item_id, p_movement_type, p_quantity, p_reason, p_reference_type, p_reference_id, auth.uid())
  returning * into v_movement;

  return v_movement;
end;
$$;

grant execute on function public.record_inventory_movement(uuid, text, numeric, text, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 3) Consumo automatico: cada order_item vendido descuenta su receta.
--    No reusa record_inventory_movement porque ese exige rol de inventario
--    (owner/admin/kitchen) — un mesero tomando una orden dine-in no
--    necesariamente tiene ese rol, y el descuento de receta debe pasar
--    igual. El trigger corre SECURITY DEFINER con su propia via directa.
-- ------------------------------------------------------------

create or replace function public.apply_recipe_consumption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.menu_item_id is null then
    return new;
  end if;

  for r in
    select inventory_item_id, quantity_per_unit
    from public.recipe_items
    where menu_item_id = new.menu_item_id
  loop
    update public.inventory_items
    set stock_on_hand = stock_on_hand - (r.quantity_per_unit * new.quantity),
        updated_at = now()
    where id = r.inventory_item_id;

    insert into public.inventory_movements
      (tenant_id, inventory_item_id, movement_type, quantity, reason, reference_type, reference_id)
    values
      (new.tenant_id, r.inventory_item_id, 'out', r.quantity_per_unit * new.quantity, 'venta', 'order_item', new.id);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_order_item_recipe_consumption on public.order_items;
create trigger trg_order_item_recipe_consumption
  after insert on public.order_items
  for each row execute function public.apply_recipe_consumption();

-- ------------------------------------------------------------
-- 4) Vista de bajo stock (security_invoker: respeta el RLS del que consulta,
--    nunca el del dueno de la vista — critico para no filtrar entre tenants)
-- ------------------------------------------------------------

create or replace view public.low_stock_items
with (security_invoker = true)
as
select *
from public.inventory_items
where active = true
  and stock_on_hand <= reorder_point;

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------

-- select * from public.low_stock_items;
-- select * from public.inventory_movements order by created_at desc limit 20;
