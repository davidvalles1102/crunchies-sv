-- ============================================================
--  Billing / planes — Fase 7 del plan multitenant
--  Ejecutar DESPUES de tenant_foundation.sql y tenant_aware_rls.sql
-- ============================================================
--
-- Estrategia: un solo cambio en is_tenant_role (usada por CADA policy de
-- escritura ya creada en tenant_aware_rls.sql / cash_sessions.sql /
-- inventory.sql / tenant_onboarding.sql) en vez de tocar tabla por tabla.
-- Un tenant 'suspended' o 'archived' pierde permiso de ESCRITURA en todo
-- el sistema sin necesidad de re-escribir ninguna policy — is_tenant_member
-- (lecturas) no cambia, para que el dueno pueda seguir viendo sus datos
-- (exportar, revisar historial) aunque este suspendido.

create or replace function public.is_tenant_role(p_tenant_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members tm
    join public.tenants t on t.id = tm.tenant_id
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.active = true
      and tm.role = any (p_roles)
      and t.status in ('active', 'trial')
  );
$$;

-- ------------------------------------------------------------
-- Suspender / reactivar un tenant (solo profiles.role='admin' — mismo
-- proxy de "operador de plataforma" que create_tenant() en tenant_onboarding.sql)
-- ------------------------------------------------------------

create or replace function public.set_tenant_status(p_tenant_id uuid, p_status text)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended', 'trial', 'archived') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.tenants set status = p_status where id = p_tenant_id
  returning * into v_tenant;

  if not found then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;

  return v_tenant;
end;
$$;

grant execute on function public.set_tenant_status(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------

-- select id, name, status, plan from public.tenants order by created_at desc;
