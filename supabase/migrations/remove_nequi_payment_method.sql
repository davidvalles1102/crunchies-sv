-- ============================================================
--  Quita "Nequi" como metodo de pago valido — residuo de la marca
--  colombiana original del proyecto. Nequi no opera en El Salvador;
--  el negocio real (Crunchies SV) solo maneja efectivo y tarjeta.
--  Ejecutar despues de add_payment_method.sql / fix_qr_ordering.sql.
-- ============================================================

-- Si alguna orden de prueba quedo guardada con 'nequi', se remapea a
-- 'card' antes de endurecer el constraint (si no, el ALTER de abajo
-- falla porque hay filas que ya no cumplirian la regla nueva).
update public.orders set payment_method = 'card' where payment_method = 'nequi';

-- El nombre del constraint puede variar segun cual migracion historica
-- lo creo primero (add_payment_method.sql vs fix_qr_ordering.sql) — se
-- busca dinamicamente en vez de asumir un nombre fijo.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.orders'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%payment_method%'
  limit 1;
  if cname is not null then
    execute 'alter table public.orders drop constraint ' || quote_ident(cname);
  end if;
end $$;

alter table public.orders
  add constraint orders_payment_method_check
    check (payment_method in ('cash', 'card'));

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------
-- select payment_method, count(*) from public.orders group by payment_method;
-- Esperado: solo 'cash' y/o 'card', cero filas en 'nequi'.
