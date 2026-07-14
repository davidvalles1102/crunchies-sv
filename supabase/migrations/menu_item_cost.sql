-- ============================================================
--  Costo por platillo (COGS) — pedido explicito del cliente
--  Ejecutar en: Supabase → SQL Editor → New Query → Run
-- ============================================================
--
-- Balance/Finanzas ya calculaba Ingresos - Gastos (renta, nomina,
-- servicios, etc. via la tabla expenses), pero nunca goleaba el costo de
-- insumos por platillo vendido — el costo mas grande de un restaurante
-- estaba completamente ausente de la Utilidad Neta mostrada hoy.

alter table public.menu_items
  add column if not exists cost numeric(10,2) not null default 0;

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------

-- select name, price, cost, (price - cost) as margen_bruto from public.menu_items order by name;
