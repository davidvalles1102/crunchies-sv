-- ============================================================
--  Credito de cliente / "Fiado" — modulo nuevo
--  Ejecutar DESPUES de tenant_foundation.sql y tenant_aware_rls.sql
-- ============================================================
--
-- Feature muy comun en negocios pequeños de Latinoamerica (venta a
-- credito a clientes de confianza, pago despues): el sistema hoy no lo
-- tenia — comparado contra Loyverse/Treinta, este es el hueco mas claro.

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- 1) Cuenta de credito por cliente y por tenant (un cliente puede deber
--    en un negocio y no en otro — el balance NO vive en profiles porque
--    profiles es global, no pertenece a un tenant)
-- ------------------------------------------------------------

create table if not exists public.customer_credit_accounts (
  id            uuid default uuid_generate_v4() primary key,
  tenant_id     uuid not null references public.tenants on delete cascade,
  customer_id   uuid not null references public.profiles on delete cascade,
  credit_limit  numeric(10,2) not null default 0, -- 0 = sin limite
  balance       numeric(10,2) not null default 0, -- lo que el cliente debe
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, customer_id)
);

create table if not exists public.customer_credit_transactions (
  id            uuid default uuid_generate_v4() primary key,
  tenant_id     uuid not null references public.tenants on delete cascade,
  customer_id   uuid not null references public.profiles on delete cascade,
  -- orders.id es text en produccion (heredado de un catalogo previo, no uuid)
  order_id      text references public.orders on delete set null,
  movement_type text not null check (movement_type in ('charge', 'payment', 'adjustment')),
  amount        numeric(10,2) not null check (amount > 0),
  notes         text,
  created_by    uuid references public.profiles on delete set null,
  created_at    timestamptz not null default now()
);

-- payments.method gana 'credit' — el nombre real de la constraint puede
-- variar segun cual archivo la creo originalmente; se dropea por
-- introspeccion (mismo motivo que tenant_aware_rls.sql) y se recrea.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.payments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%method%'
  loop
    execute format('alter table public.payments drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.payments
  add constraint payments_method_check
  check (method in ('cash', 'card', 'transfer', 'points', 'credit'));

-- ------------------------------------------------------------
-- 2) RLS
-- ------------------------------------------------------------

alter table public.customer_credit_accounts     enable row level security;
alter table public.customer_credit_transactions enable row level security;

drop policy if exists "customer_credit_accounts_staff" on public.customer_credit_accounts;
create policy "customer_credit_accounts_staff" on public.customer_credit_accounts for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','waiter']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter']));

drop policy if exists "customer_credit_transactions_staff" on public.customer_credit_transactions;
create policy "customer_credit_transactions_staff" on public.customer_credit_transactions for all
  using (public.is_tenant_role(tenant_id, array['owner','admin','waiter']))
  with check (public.is_tenant_role(tenant_id, array['owner','admin','waiter']));

-- ------------------------------------------------------------
-- 3) RPCs atomicas — el balance nunca se actualiza con un UPDATE directo
--    del cliente, siempre pasa por aqui junto con su registro en el ledger
--    (mismo patron que record_inventory_movement / close_cash_session).
-- ------------------------------------------------------------

create or replace function public.charge_customer_credit(
  p_tenant_id  uuid,
  p_customer_id uuid,
  p_amount     numeric,
  p_order_id   uuid default null,
  p_notes      text default null
)
returns public.customer_credit_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.customer_credit_accounts%rowtype;
begin
  if not public.is_tenant_role(p_tenant_id, array['owner','admin','waiter']) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  insert into public.customer_credit_accounts (tenant_id, customer_id, balance)
  values (p_tenant_id, p_customer_id, 0)
  on conflict (tenant_id, customer_id) do nothing;

  select * into v_account
  from public.customer_credit_accounts
  where tenant_id = p_tenant_id and customer_id = p_customer_id
  for update;

  if v_account.credit_limit > 0 and v_account.balance + p_amount > v_account.credit_limit then
    raise exception 'credit_limit_exceeded' using errcode = '23514';
  end if;

  update public.customer_credit_accounts
  set balance = balance + p_amount, updated_at = now()
  where tenant_id = p_tenant_id and customer_id = p_customer_id
  returning * into v_account;

  insert into public.customer_credit_transactions
    (tenant_id, customer_id, order_id, movement_type, amount, notes, created_by)
  values
    (p_tenant_id, p_customer_id, p_order_id, 'charge', p_amount, p_notes, auth.uid());

  return v_account;
end;
$$;

grant execute on function public.charge_customer_credit(uuid, uuid, numeric, uuid, text) to authenticated;

create or replace function public.record_credit_payment(
  p_tenant_id   uuid,
  p_customer_id uuid,
  p_amount      numeric,
  p_notes       text default null
)
returns public.customer_credit_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.customer_credit_accounts%rowtype;
begin
  if not public.is_tenant_role(p_tenant_id, array['owner','admin','waiter']) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select * into v_account
  from public.customer_credit_accounts
  where tenant_id = p_tenant_id and customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  update public.customer_credit_accounts
  set balance = greatest(0, balance - p_amount), updated_at = now()
  where tenant_id = p_tenant_id and customer_id = p_customer_id
  returning * into v_account;

  insert into public.customer_credit_transactions
    (tenant_id, customer_id, order_id, movement_type, amount, notes, created_by)
  values
    (p_tenant_id, p_customer_id, null, 'payment', p_amount, p_notes, auth.uid());

  return v_account;
end;
$$;

grant execute on function public.record_credit_payment(uuid, uuid, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------

-- select tablename, policyname from pg_policies where tablename like 'customer_credit%';
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.payments'::regclass and contype = 'c';
