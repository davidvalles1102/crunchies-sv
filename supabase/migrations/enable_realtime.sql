-- ============================================================
--  Crunchies — Habilitar Realtime en tablas clave
--  Ejecutar en: Supabase → SQL Editor → New Query → Run
--  Necesario para que kitchen.html se actualice en tiempo real
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;

-- Verificar que quedaron incluidas
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('orders', 'order_items');
