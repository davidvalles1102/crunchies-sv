-- ============================================================
--  Tenant Onboarding — Fase 4 del plan multitenant
--  Ejecutar DESPUES de tenant_foundation.sql y tenant_aware_rls.sql
-- ============================================================
--
-- Problema del huevo y la gallina: tenant_members_owner_write (en
-- tenant_aware_rls.sql) exige ser owner/admin del tenant para insertar
-- miembros — pero un tenant nuevo no tiene ningun miembro todavia. Esta
-- funcion SECURITY DEFINER crea el tenant + su primer owner de forma
-- atomica, evitando ese problema sin abrir la tabla a cualquiera.
--
-- Quien puede llamarla hoy: solo profiles.role = 'admin' (el rol global
-- que ya existe en este codebase desde antes del modelo multitenant).
-- No existe todavia un concepto de "platform super-admin" separado del
-- admin del restaurante raiz — profiles.role='admin' es el proxy mas
-- cercano y evita que cualquier cliente autenticado se auto-promueva a
-- dueno de un tenant nuevo.
--
-- El dueno del negocio nuevo debe registrarse primero como cliente normal
-- en /auth (ya existe ese flujo) para tener una fila en auth.users; el
-- admin de plataforma lo busca por email y lo promueve a owner aqui.

create or replace function public.create_tenant(
  p_slug text,
  p_name text,
  p_owner_email text,
  p_plan text default 'starter'
)
returns table (tenant_id uuid, tenant_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id  uuid;
  v_tenant_id uuid;
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select id into v_owner_id from auth.users where email = p_owner_email limit 1;
  if v_owner_id is null then
    raise exception 'owner_not_found' using errcode = 'P0002';
  end if;

  insert into public.tenants (slug, name, status, plan)
  values (p_slug, p_name, 'trial', p_plan)
  returning id into v_tenant_id;

  insert into public.tenant_settings (tenant_id, brand_name)
  values (v_tenant_id, p_name);

  insert into public.tenant_members (tenant_id, user_id, role, active)
  values (v_tenant_id, v_owner_id, 'owner', true);

  insert into public.tenant_plan_subscriptions (tenant_id, plan_code, billing_cycle, status, trial_ends_at)
  values (v_tenant_id, p_plan, 'monthly', 'trial', now() + interval '14 days');

  return query select v_tenant_id, p_slug;
end;
$$;

grant execute on function public.create_tenant(text, text, text, text) to authenticated;

-- El admin de plataforma necesita ver TODOS los tenants para poder
-- administrarlos (tenants_member_read de tenant_aware_rls.sql solo deja
-- ver los tenants a los que ya perteneces).
drop policy if exists "tenants_platform_admin_read" on public.tenants;
create policy "tenants_platform_admin_read" on public.tenants for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "tenant_plan_subscriptions_platform_admin_read" on public.tenant_plan_subscriptions;
create policy "tenant_plan_subscriptions_platform_admin_read" on public.tenant_plan_subscriptions for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------

-- select * from public.tenants order by created_at desc;
