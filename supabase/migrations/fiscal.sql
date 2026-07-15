-- ============================================================
--  Fiscal / El Salvador — Fase 8 del plan multitenant
--  Ejecutar DESPUES de tenant_foundation.sql y tenant_aware_rls.sql
-- ============================================================

-- tenant_settings.tax_enabled ya existe (default true) pero no habia una
-- tasa configurable — El Salvador usa 13% de IVA como tasa estandar.
alter table public.tenant_settings
  add column if not exists tax_rate numeric(5,4) not null default 0.13;

-- El tenant raiz (crunchies-root) opera hoy SIN IVA (ver TAX_RATE=0 en
-- web-next/lib/format.ts, decision de negocio deliberada, no un default
-- tecnico) — si tenant_foundation.sql no le creo fila de tenant_settings
-- todavia, se crea aqui explicitamente en 0 para no heredar el default de
-- 13% de esta tabla y cambiarle el cobro a un negocio real sin que nadie
-- lo pidiera.
insert into public.tenant_settings (tenant_id, brand_name, tax_enabled, tax_rate)
select t.id, t.name, false, 0
from public.tenants t
where t.slug = 'crunchies-root'
on conflict (tenant_id) do nothing;

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------

-- select tenant_id, tax_enabled, tax_rate, invoice_mode from public.tenant_settings;
