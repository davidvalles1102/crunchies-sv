-- ============================================================
--  Fix: COGS historico usaba menu_items.cost ACTUAL para recalcular el
--  margen de ventas pasadas — cambiar el costo de un insumo hoy
--  reescribia retroactivamente todos los reportes de margen anteriores.
--  Se guarda el costo unitario en order_items al momento de la venta,
--  igual que ya se hace con item_price, en vez de recalcularlo despues
--  contra el costo vigente. Encontrado en auditoria de logica,
--  2026-07-15 — prioridad real del negocio, se arregla ahora.
-- ============================================================

alter table public.order_items
  add column if not exists cost numeric(10,2) not null default 0;

-- Backfill best-effort para filas ya existentes: usa el costo actual del
-- platillo como aproximacion (mejor que 0, aunque no es 100% historico
-- para ventas viejas si el costo del insumo cambio desde entonces).
update public.order_items oi
set cost = mi.cost
from public.menu_items mi
where oi.menu_item_id = mi.id
  and oi.cost = 0;

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------
-- select item_name, item_price, cost, (item_price - cost) as margen from public.order_items order by created_at desc limit 20;
