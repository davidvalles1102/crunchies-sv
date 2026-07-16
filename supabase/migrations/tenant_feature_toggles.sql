-- ============================================================
--  Toggles de feature por tenant: lealtad y fiado apagados por
--  default (Crunchies SV no los va a usar por ahora). El codigo/logica
--  de ambos sigue existiendo intacto — esto solo controla si se
--  muestra/ejecuta desde la UI, no borra nada.
-- ============================================================

alter table public.tenant_settings
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists credit_enabled  boolean not null default false;

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------
-- select t.slug, ts.loyalty_enabled, ts.credit_enabled
-- from public.tenant_settings ts join public.tenants t on t.id = ts.tenant_id
-- where t.slug = 'crunchies-root';
-- Esperado: loyalty_enabled = false, credit_enabled = false
