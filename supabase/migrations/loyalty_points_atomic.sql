-- ============================================================
--  Fix: profiles.loyalty_points se actualizaba con un balance calculado
--  en el cliente (loyalty_points_del_momento_en_que_se_busco + delta) y
--  un UPDATE ciego — no atomico. Dos pagos concurrentes para el mismo
--  cliente (dos cajas, o mesero + admin) podian pisarse: el segundo
--  UPDATE sobreescribe el balance del primero en vez de sumarle/restarle
--  encima. Mismo patron ya arreglado en charge_customer_credit /
--  record_credit_payment — aca se resuelve igual, con un UPDATE atomico
--  de una sola sentencia (Postgres bloquea la fila automaticamente).
--  Encontrado en auditoria de logica, 2026-07-15.
-- ============================================================

create or replace function public.adjust_loyalty_points(
  p_customer_id uuid,
  p_delta        integer,
  p_tenant_id    uuid,       -- requerido: loyalty_transactions.tenant_id es NOT NULL
  p_order_id     uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance integer;
begin
  if p_delta = 0 then
    select loyalty_points into v_new_balance from public.profiles where id = p_customer_id;
    return v_new_balance;
  end if;

  update public.profiles
  set loyalty_points = greatest(0, coalesce(loyalty_points, 0) + p_delta)
  where id = p_customer_id
  returning loyalty_points into v_new_balance;

  if not found then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  -- loyalty_transactions.type solo acepta 'earned'/'redeemed' (CHECK
  -- constraint) — se deriva del signo del delta en vez de que cada caller
  -- tenga que acertarle a un string exacto.
  insert into public.loyalty_transactions (customer_id, order_id, points, type, tenant_id)
  values (p_customer_id, p_order_id, abs(p_delta), case when p_delta > 0 then 'earned' else 'redeemed' end, p_tenant_id);

  return v_new_balance;
end;
$$;

grant execute on function public.adjust_loyalty_points(uuid, integer, uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------
-- select public.adjust_loyalty_points('<customer_id>'::uuid, 10, '<tenant_id>'::uuid);
-- select loyalty_points from public.profiles where id = '<customer_id>';
