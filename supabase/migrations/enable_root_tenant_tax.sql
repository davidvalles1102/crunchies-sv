-- ============================================================
--  Activa el IVA de El Salvador (13%) para el tenant raiz
--  (crunchies-root). Ejecutar DESPUES de fiscal.sql.
-- ============================================================

-- fiscal.sql dejo crunchies-root explicitamente en tax_enabled=false,
-- tax_rate=0 como decision de negocio "hasta que alguien lo pida". Ya
-- lo pidieron: el negocio opera en El Salvador (USD, IVA 13%), asi que
-- el tenant raiz debe cobrar la misma tasa estandar que cualquier
-- tenant nuevo (default de tenant_settings.tax_rate).
update public.tenant_settings ts
set tax_enabled = true,
    tax_rate = 0.13
from public.tenants t
where t.id = ts.tenant_id
  and t.slug = 'crunchies-root';

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------
-- select t.slug, ts.tax_enabled, ts.tax_rate
-- from public.tenant_settings ts join public.tenants t on t.id = ts.tenant_id
-- where t.slug = 'crunchies-root';
