-- ============================================================
--  El tenant raiz seedeado por tenant_foundation.sql quedo con el
--  nombre historico "Crunchies Mi Rancho" (branding viejo, pre-rebrand).
--  El unico negocio real usando el sistema hoy es Crunchies SV
--  (El Salvador) — actualiza el nombre mostrado en el sidebar/admin.
-- ============================================================

update public.tenants
set name = 'CrunchiesSV'
where slug = 'crunchies-root';

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------
-- select slug, name from public.tenants where slug = 'crunchies-root';
-- Esperado: name = 'CrunchiesSV'
