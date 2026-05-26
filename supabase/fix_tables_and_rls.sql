-- ═══════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO Y CORRECCIÓN — Mesas sin orden activa + RLS clientes
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════


-- ─── PASO 1: Diagnóstico ────────────────────────────────────────────
-- Ver qué órdenes existen para cada mesa ocupada
SELECT
  rt.number        AS mesa,
  rt.status        AS estado_mesa,
  o.id             AS orden_id,
  o.status         AS estado_orden,
  o.created_at,
  COUNT(oi.id)     AS items
FROM restaurant_tables rt
LEFT JOIN orders o
  ON o.table_id = rt.id
  AND o.status IN ('open','in_kitchen','ready','delivered')
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE rt.status = 'occupied'
GROUP BY rt.number, rt.status, o.id, o.status, o.created_at
ORDER BY rt.number;


-- ─── PASO 2: Limpiar mesas ocupadas sin orden activa ───────────────
-- Esto libera las mesas 2 y 3 para que el admin pueda crear órdenes nuevas
-- ⚠️  Solo ejecutar si el PASO 1 confirma que esas mesas no tienen orden
UPDATE restaurant_tables
SET status = 'available'
WHERE status = 'occupied'
  AND id NOT IN (
    SELECT DISTINCT table_id
    FROM orders
    WHERE table_id IS NOT NULL
      AND status IN ('open','in_kitchen','ready','delivered')
  );


-- ─── PASO 3: Políticas RLS para que clientes puedan pedir desde QR ─
-- Sin estas políticas, table-order.html falla silenciosamente

-- 3a. Clientes pueden leer su propia mesa (necesario para cargar la página)
CREATE POLICY IF NOT EXISTS "tables_customer_read"
  ON public.restaurant_tables FOR SELECT
  TO authenticated
  USING (true);

-- 3b. Clientes pueden marcar mesa como ocupada al escanear QR
CREATE POLICY IF NOT EXISTS "tables_customer_mark_occupied"
  ON public.restaurant_tables FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (status = 'occupied');

-- 3c. Clientes pueden crear órdenes (INSERT)
CREATE POLICY IF NOT EXISTS "orders_customer_insert"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

-- 3d. Clientes pueden ver sus propias órdenes
CREATE POLICY IF NOT EXISTS "orders_customer_own"
  ON public.orders FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

-- 3e. Clientes pueden agregar items a sus propias órdenes
CREATE POLICY IF NOT EXISTS "order_items_customer_insert"
  ON public.order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.customer_id = auth.uid()
    )
  );

-- ─── PASO 4: Verificar resultado ────────────────────────────────────
SELECT number, status FROM restaurant_tables ORDER BY number;
