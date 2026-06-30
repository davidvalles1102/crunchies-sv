-- ============================================================
--  Fix: puntos de lealtad no se otorgaban en pedidos web/delivery
--  Causa: solo orders.js (pago en POS con cliente vinculado
--  manualmente) y customers.js (ajuste manual) tocaban
--  loyalty_transactions. order.js (pedido web) y delivery.js
--  (tablero de Delivery) nunca otorgaban puntos al completar
--  un pedido, aunque la orden ya tuviera customer_id.
--
--  Run in: Supabase → SQL Editor → New Query
-- ============================================================

-- ─── PASO 1: Diagnóstico ────────────────────────────────────────
-- Pedidos completados con cliente identificado que NUNCA recibieron puntos
select o.id, o.customer_id, o.order_type, o.status, o.total, o.created_at
from public.orders o
where o.customer_id is not null
  and floor(o.total) > 0
  and (
    o.status = 'paid'
    or (o.order_type in ('delivery','takeout') and o.status = 'delivered')
  )
  and not exists (
    select 1 from public.loyalty_transactions lt where lt.order_id = o.id and lt.type = 'earned'
  )
order by o.created_at desc;


-- ─── PASO 2: Trigger — otorga puntos automáticamente a futuro ──
-- Se dispara en CUALQUIER pantalla que marque la orden como completada
-- (POS, tablero de Delivery, o lo que se agregue después).
create or replace function public.award_loyalty_points()
returns trigger language plpgsql security definer as $$
declare
  pts integer;
  already_awarded boolean;
begin
  if new.customer_id is null then
    return new;
  end if;

  -- ¿Esta actualización representa que la orden se completó?
  if not (
    new.status = 'paid'
    or (new.order_type in ('delivery','takeout') and new.status = 'delivered')
  ) then
    return new;
  end if;

  -- Solo actuar cuando el status realmente cambió a estado final
  if old.status = new.status then
    return new;
  end if;

  -- Evitar doble otorgamiento si ya existe un registro para esta orden
  select exists(select 1 from public.loyalty_transactions where order_id = new.id and type = 'earned')
    into already_awarded;
  if already_awarded then
    return new;
  end if;

  pts := floor(new.total);
  if pts <= 0 then
    return new;
  end if;

  insert into public.loyalty_transactions (customer_id, order_id, points, type)
  values (new.customer_id, new.id, pts, 'earned');

  update public.profiles set loyalty_points = loyalty_points + pts where id = new.customer_id;

  return new;
end;
$$;

drop trigger if exists trg_award_loyalty_points on public.orders;
create trigger trg_award_loyalty_points
  after update on public.orders
  for each row
  execute function public.award_loyalty_points();


-- ─── PASO 3: Backfill — otorgar puntos retroactivos ─────────────
-- Pedidos ya completados que se quedaron sin puntos (como el caso reportado)
insert into public.loyalty_transactions (customer_id, order_id, points, type)
select o.customer_id, o.id, floor(o.total)::integer, 'earned'
from public.orders o
where o.customer_id is not null
  and floor(o.total) > 0
  and (
    o.status = 'paid'
    or (o.order_type in ('delivery','takeout') and o.status = 'delivered')
  )
  and not exists (
    select 1 from public.loyalty_transactions lt where lt.order_id = o.id and lt.type = 'earned'
  );

-- Recalcular loyalty_points desde el ledger completo (fuente de verdad),
-- así queda consistente sin importar otorgamientos parciales anteriores.
update public.profiles p
set loyalty_points = coalesce((
  select sum(case when lt.type = 'earned' then lt.points else -lt.points end)
  from public.loyalty_transactions lt
  where lt.customer_id = p.id
), 0)
where p.role = 'customer' or p.role is null;


-- ─── PASO 4: Verificación ────────────────────────────────────────
select full_name, phone, loyalty_points
from public.profiles
where role = 'customer' or role is null
order by loyalty_points desc
limit 20;
