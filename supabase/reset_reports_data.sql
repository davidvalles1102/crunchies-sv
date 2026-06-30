-- ============================================================
--  Crunchies — Reiniciar todo el historial transaccional
--  (lo que alimenta Reportes, Finanzas, Dashboard e historial de clientes)
--  Run in: Supabase → SQL Editor → New Query
-- ============================================================

-- Limpieza, en orden seguro:
-- order_items y order_item_modifiers se borran solos (ON DELETE CASCADE
-- desde orders / order_items), así que solo hace falta borrar explícito
-- orders, payments y expenses.

DELETE FROM public.payments;
DELETE FROM public.orders;
DELETE FROM public.expenses;

-- Las mesas que quedaron marcadas "ocupada" por una orden ya borrada
-- vuelven a quedar disponibles
UPDATE public.restaurant_tables SET status = 'available' WHERE status = 'occupied';

-- Confirmar que todo quedó en cero
SELECT
  (SELECT count(*) FROM public.orders)   AS ordenes,
  (SELECT count(*) FROM public.payments) AS pagos,
  (SELECT count(*) FROM public.expenses) AS gastos;
