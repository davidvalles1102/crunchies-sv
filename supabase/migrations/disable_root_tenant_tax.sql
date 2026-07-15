-- ============================================================
--  Revierte enable_root_tenant_tax.sql — Crunchies SV NO es
--  contribuyente formal, no cobra IVA. Ejecutar despues de
--  enable_root_tenant_tax.sql (o en vez de, si ese archivo
--  todavia no corrio en produccion).
-- ============================================================

-- enable_root_tenant_tax.sql (2026-07-14) activo el 13% de IVA en
-- crunchies-root asumiendo el estandar de El Salvador para negocios
-- formales. Fue un error de contexto: este cliente especifico opera
-- sin factura fiscal, solo recibos normales — igual que antes de esa
-- migracion. tax_rate se deja en 0.13 (no se borra, es el default de
-- El Salvador para tenants nuevos que si sean contribuyentes) — solo
-- se apaga tax_enabled para que calcTotals() reciba taxRate=0 otra
-- vez, igual que fiscal.sql lo dejo originalmente.
update public.tenant_settings ts
set tax_enabled = false
from public.tenants t
where t.id = ts.tenant_id
  and t.slug = 'crunchies-root';

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------
-- select t.slug, ts.tax_enabled, ts.tax_rate
-- from public.tenant_settings ts join public.tenants t on t.id = ts.tenant_id
-- where t.slug = 'crunchies-root';
-- Esperado: tax_enabled = false (tax_rate se queda en 0.13 pero no se aplica)
