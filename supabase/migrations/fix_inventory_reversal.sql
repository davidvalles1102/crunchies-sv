-- ============================================================
--  Fix: el consumo automatico de inventario (inventory.sql) solo
--  descontaba stock en INSERT sobre order_items. Si un mesero reduce
--  la cantidad o quita un item del ticket ANTES de cobrar (algo que
--  pasa seguido — cliente cambia de opinion, mesero se equivoca), el
--  stock ya descontado nunca se devolvia. Encontrado en auditoria de
--  logica, 2026-07-15.
-- ============================================================

create or replace function public.apply_recipe_consumption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  affected_menu_item uuid;
  affected_tenant uuid;
  ref_id uuid;
  qty_delta numeric;
begin
  -- ponytail: no maneja UPDATE de menu_item_id (cambiar el platillo de un
  -- order_item ya insertado) — la app nunca lo hace, solo cambia quantity
  -- o borra+reinserta. Agregar esa rama si algun caller nuevo lo necesita.
  if tg_op = 'DELETE' then
    affected_menu_item := old.menu_item_id;
    affected_tenant := old.tenant_id;
    ref_id := old.id;
    qty_delta := -old.quantity; -- se devuelve al stock lo que se habia descontado
  elsif tg_op = 'UPDATE' then
    affected_menu_item := new.menu_item_id;
    affected_tenant := new.tenant_id;
    ref_id := new.id;
    qty_delta := new.quantity - old.quantity; -- solo el delta, no la cantidad completa
  else -- INSERT
    affected_menu_item := new.menu_item_id;
    affected_tenant := new.tenant_id;
    ref_id := new.id;
    qty_delta := new.quantity;
  end if;

  if affected_menu_item is null or qty_delta = 0 then
    return coalesce(new, old);
  end if;

  for r in
    select inventory_item_id, quantity_per_unit
    from public.recipe_items
    where menu_item_id = affected_menu_item
  loop
    update public.inventory_items
    set stock_on_hand = stock_on_hand - (r.quantity_per_unit * qty_delta),
        updated_at = now()
    where id = r.inventory_item_id;

    insert into public.inventory_movements
      (tenant_id, inventory_item_id, movement_type, quantity, reason, reference_type, reference_id)
    values
      (affected_tenant, r.inventory_item_id,
       case when qty_delta > 0 then 'out' else 'in' end,
       abs(r.quantity_per_unit * qty_delta),
       case tg_op when 'DELETE' then 'item quitado de la orden' when 'UPDATE' then 'ajuste de cantidad' else 'venta' end,
       'order_item', ref_id);
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_order_item_recipe_consumption on public.order_items;
create trigger trg_order_item_recipe_consumption
  after insert or update of quantity or delete on public.order_items
  for each row execute function public.apply_recipe_consumption();

-- ------------------------------------------------------------
-- Verificacion manual (opcional)
-- ------------------------------------------------------------
-- 1. Anota stock_on_hand de un inventory_item con receta.
-- 2. Inserta un order_item de ese menu_item con quantity=2 -> stock baja.
-- 3. Actualiza ese order_item a quantity=1 -> stock sube la diferencia de 1.
-- 4. Borra el order_item -> stock vuelve al valor original del paso 1.
