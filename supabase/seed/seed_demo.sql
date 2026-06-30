-- ============================================================
--  Crunchies — Demo Seed (30 días de ventas y gastos)
--  Prerequisitos: expenses_create.sql ya ejecutado
--  Ejecutar en: Supabase → SQL Editor → New Query
-- ============================================================

DO $$
DECLARE
  -- Catálogo: precios en USD enteros, estilo El Salvador
  item_names  text[]    := ARRAY[
    'Pollo Entero', 'Media Pollo', '1/4 Pollo',
    'Alas 6 pzs', 'Alas 12 pzs', 'Combo Rancho',
    'Sopa de Gallina', 'Enchiladas 3 pzs', 'Arroz con Pollo',
    'Refresco', 'Agua Pura'
  ];
  item_prices numeric[] := ARRAY[12, 7, 5, 8, 14, 10, 8, 5, 7, 2, 1];

  curr_date   date;
  dow         int;
  num_orders  int;
  order_total numeric;
  pay_rand    float;
  pay_method  text;
  receipt_no  text;
  idx         int;
  oid         uuid;
  qty         int;
BEGIN
  FOR d IN 0..29 LOOP
    curr_date := current_date - (30 - d);
    dow        := EXTRACT(DOW FROM curr_date)::int;  -- 0=Dom … 6=Sáb

    -- Volumen diario: Viernes > Fin de semana > Entre semana
    IF dow = 5 THEN
      num_orders := 15 + (floor(random() * 9))::int;
    ELSIF dow IN (0, 6) THEN
      num_orders := 18 + (floor(random() * 11))::int;
    ELSE
      num_orders := 9  + (floor(random() * 8))::int;
    END IF;

    -- ── Órdenes del día ─────────────────────────────────────
    FOR n IN 1..num_orders LOOP
      oid         := uuid_generate_v4();
      order_total := 0;

      INSERT INTO public.orders (id, status, subtotal, tax, total, created_at, updated_at)
      VALUES (
        oid, 'paid', 0, 0, 0,
        (curr_date + time '10:00:00') + (random() * interval '10 hours'),
        (curr_date + time '10:00:00') + (random() * interval '10 hours')
      );

      -- 1–4 ítems por orden
      FOR i IN 1..(1 + (floor(random() * 4))::int) LOOP
        idx         := (floor(random() * 11) + 1)::int;
        qty         := 1 + (floor(random() * 3))::int;
        order_total := order_total + item_prices[idx] * qty;

        INSERT INTO public.order_items (id, order_id, item_name, item_price, quantity, created_at)
        VALUES (
          uuid_generate_v4(), oid, item_names[idx], item_prices[idx], qty,
          (curr_date + time '10:00:00') + (random() * interval '10 hours')
        );
      END LOOP;

      UPDATE public.orders SET subtotal = order_total, total = order_total WHERE id = oid;

      -- Método de pago: 75% efectivo, 20% tarjeta, 5% transferencia
      pay_rand := random();
      IF pay_rand < 0.75 THEN
        pay_method := 'cash';
      ELSIF pay_rand < 0.95 THEN
        pay_method := 'card';
      ELSE
        pay_method := 'transfer';
      END IF;

      receipt_no := 'R-SEED-' || LPAD((d * 100 + n)::text, 5, '0');

      INSERT INTO public.payments (id, order_id, amount, method, receipt_number, created_at)
      VALUES (
        uuid_generate_v4(), oid, order_total, pay_method, receipt_no,
        (curr_date + time '10:00:00') + (random() * interval '10 hours')
      );
    END LOOP;

    -- ── Gastos del día ──────────────────────────────────────

    -- Insumos diarios ($50–$80)
    INSERT INTO public.expenses (expense_date, category, description, amount, payment_method)
    VALUES (curr_date, 'insumos', 'Compra de insumos del día',
            50 + (floor(random() * 31))::int, 'cash');

    -- Nómina semanal (lunes)
    IF dow = 1 THEN
      INSERT INTO public.expenses (expense_date, category, description, amount, payment_method)
      VALUES (curr_date, 'nomina', 'Pago semanal de personal', 175, 'transfer');
    END IF;

    -- Renta y servicios (día 1 del mes)
    IF EXTRACT(DAY FROM curr_date) = 1 THEN
      INSERT INTO public.expenses (expense_date, category, description, amount, payment_method)
      VALUES (curr_date, 'renta', 'Renta mensual del local', 350, 'transfer');
      INSERT INTO public.expenses (expense_date, category, description, amount, payment_method)
      VALUES (curr_date, 'servicios', 'Agua, luz e internet', 120, 'transfer');
    END IF;

    -- Mantenimiento quincenal (días 1 y 15)
    IF EXTRACT(DAY FROM curr_date) IN (1, 15) THEN
      INSERT INTO public.expenses (expense_date, category, description, amount, payment_method)
      VALUES (curr_date, 'mantenimiento', 'Mantenimiento de equipo de cocina', 40, 'cash');
    END IF;

    -- Marketing quincenal (días 7 y 21)
    IF EXTRACT(DAY FROM curr_date) IN (7, 21) THEN
      INSERT INTO public.expenses (expense_date, category, description, amount, payment_method)
      VALUES (curr_date, 'marketing', 'Redes sociales y publicidad', 30, 'card');
    END IF;

    -- Transporte aleatorio (~30%)
    IF random() < 0.3 THEN
      INSERT INTO public.expenses (expense_date, category, description, amount, payment_method)
      VALUES (curr_date, 'transporte', 'Transporte y entregas del día',
              15 + (floor(random() * 16))::int, 'cash');
    END IF;

  END LOOP;
END;
$$;
