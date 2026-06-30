-- ═══════════════════════════════════════════════════════════════════
-- RLS para pedidos anónimos via QR (sin cuenta de cliente)
-- Permite que cualquier persona escanee el QR y ordene sin registrarse
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════


-- ─── MESAS ──────────────────────────────────────────────────────────
-- Anónimos pueden leer las mesas (cargar table-order.html)
DROP POLICY IF EXISTS "tables_anon_read" ON public.restaurant_tables;
CREATE POLICY "tables_anon_read"
  ON public.restaurant_tables FOR SELECT
  TO anon
  USING (true);

-- Anónimos pueden marcar mesa como ocupada al escanear
DROP POLICY IF EXISTS "tables_anon_occupied" ON public.restaurant_tables;
CREATE POLICY "tables_anon_occupied"
  ON public.restaurant_tables FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (status = 'occupied');


-- ─── MENÚ ───────────────────────────────────────────────────────────
-- Anónimos pueden leer categorías y platillos disponibles
DROP POLICY IF EXISTS "categories_anon_read" ON public.categories;
CREATE POLICY "categories_anon_read"
  ON public.categories FOR SELECT
  TO anon
  USING (active = true);

DROP POLICY IF EXISTS "menu_items_anon_read" ON public.menu_items;
CREATE POLICY "menu_items_anon_read"
  ON public.menu_items FOR SELECT
  TO anon
  USING (available = true);


-- ─── ÓRDENES ────────────────────────────────────────────────────────
-- Anónimos pueden crear órdenes (customer_id queda NULL)
DROP POLICY IF EXISTS "orders_anon_insert" ON public.orders;
CREATE POLICY "orders_anon_insert"
  ON public.orders FOR INSERT
  TO anon
  WITH CHECK (customer_id IS NULL);

-- Anónimos pueden leer sus propias órdenes anónimas (para rastrear estado via QR)
DROP POLICY IF EXISTS "orders_anon_read" ON public.orders;
CREATE POLICY "orders_anon_read"
  ON public.orders FOR SELECT
  TO anon
  USING (
    customer_id IS NULL
    AND created_at > NOW() - INTERVAL '24 hours'
  );

-- Actualizar política de autenticados para también permitir customer_id NULL
-- (cubre el caso de personal del restaurante escaneando el QR para probar)
DROP POLICY IF EXISTS "orders_customer_insert" ON public.orders;
CREATE POLICY "orders_customer_insert"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid() OR customer_id IS NULL);


-- ─── ITEMS DE ORDEN ─────────────────────────────────────────────────
-- Anónimos pueden agregar items a órdenes anónimas recién creadas
DROP POLICY IF EXISTS "order_items_anon_insert" ON public.order_items;
CREATE POLICY "order_items_anon_insert"
  ON public.order_items FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id        = order_id
        AND o.customer_id IS NULL
        AND o.created_at  > NOW() - INTERVAL '10 minutes'
    )
  );


-- ─── VERIFICACIÓN ───────────────────────────────────────────────────
-- Muestra todas las políticas activas en las tablas afectadas
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename IN ('restaurant_tables','orders','order_items','categories','menu_items')
ORDER BY tablename, policyname;
