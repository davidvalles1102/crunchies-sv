-- ============================================================
--  Cash Sessions — Fase 5 del plan multitenant (caja / cierre de turno)
--  Ejecutar DESPUES de tenant_foundation.sql y tenant_aware_rls.sql
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists public.cash_sessions (
  id               uuid default uuid_generate_v4() primary key,
  tenant_id        uuid not null references public.tenants on delete cascade,
  status           text not null default 'open' check (status in ('open', 'closed')),
  opening_amount   numeric(10,2) not null default 0,
  opened_by        uuid references public.profiles on delete set null,
  opened_at        timestamptz not null default now(),
  expected_amount  numeric(10,2),
  counted_amount   numeric(10,2),
  difference       numeric(10,2),
  closed_by        uuid references public.profiles on delete set null,
  closed_at        timestamptz,
  notes            text,
  created_at       timestamptz not null default now()
);

-- Solo una caja abierta a la vez por tenant.
create unique index if not exists cash_sessions_one_open_per_tenant
  on public.cash_sessions (tenant_id)
  where (status = 'open');

create table if not exists public.cash_session_movements (
  id              uuid default uuid_generate_v4() primary key,
  tenant_id       uuid not null references public.tenants on delete cascade,
  cash_session_id uuid not null references public.cash_sessions on delete cascade,
  movement_type   text not null check (movement_type in ('in', 'out')),
  amount          numeric(10,2) not null check (amount > 0),
  reason          text not null,
  created_by      uuid references public.profiles on delete set null,
  created_at      timestamptz not null default now()
);

-- Vincula cada pago en efectivo a la caja que estaba abierta al momento del
-- cobro, para poder calcular el "esperado" del cierre sin depender solo de
-- una ventana de tiempo.
alter table public.payments
  add column if not exists cash_session_id uuid references public.cash_sessions on delete set null;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.cash_sessions          enable row level security;
alter table public.cash_session_movements enable row level security;

drop policy if exists "cash_sessions_staff" on public.cash_sessions;
create policy "cash_sessions_staff" on public.cash_sessions for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','waiter']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter']));

drop policy if exists "cash_session_movements_staff" on public.cash_session_movements;
create policy "cash_session_movements_staff" on public.cash_session_movements for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','waiter']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter']));

-- ------------------------------------------------------------
-- Helper: calcula el monto esperado en caja al momento del cierre
-- ------------------------------------------------------------
-- esperado = apertura + pagos en efectivo de esta sesion + entradas manuales - salidas manuales

create or replace function public.compute_cash_session_expected(p_session_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    s.opening_amount
    + coalesce((select sum(p.amount) from public.payments p
                where p.cash_session_id = s.id and p.method = 'cash'), 0)
    + coalesce((select sum(m.amount) from public.cash_session_movements m
                where m.cash_session_id = s.id and m.movement_type = 'in'), 0)
    - coalesce((select sum(m.amount) from public.cash_session_movements m
                where m.cash_session_id = s.id and m.movement_type = 'out'), 0)
  from public.cash_sessions s
  where s.id = p_session_id;
$$;

grant execute on function public.compute_cash_session_expected(uuid) to authenticated;

-- ------------------------------------------------------------
-- Cierre atomico: calcula esperado, guarda contado/diferencia, marca cerrada
-- ------------------------------------------------------------

create or replace function public.close_cash_session(p_session_id uuid, p_counted_amount numeric, p_notes text default null)
returns public.cash_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cash_sessions%rowtype;
  v_expected numeric;
begin
  select * into v_session from public.cash_sessions where id = p_session_id;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if not public.is_tenant_role(v_session.tenant_id, array['owner','admin','waiter']) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_session.status = 'closed' then
    raise exception 'session_already_closed' using errcode = 'P0001';
  end if;

  v_expected := public.compute_cash_session_expected(p_session_id);

  update public.cash_sessions
  set status          = 'closed',
      expected_amount = v_expected,
      counted_amount  = p_counted_amount,
      difference      = p_counted_amount - v_expected,
      closed_by       = auth.uid(),
      closed_at       = now(),
      notes           = p_notes
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

grant execute on function public.close_cash_session(uuid, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------

-- select * from public.cash_sessions order by opened_at desc;
