-- ============================================================
--  Crunchies — Columnas faltantes en orders
--  Ejecutar en: Supabase → SQL Editor → New Query → Run
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type       text DEFAULT 'dine_in'
    CHECK (order_type IN ('dine_in','takeout','delivery')),
  ADD COLUMN IF NOT EXISTS delivery_name    text,
  ADD COLUMN IF NOT EXISTS delivery_phone   text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_status  text
    CHECK (delivery_status IN ('pending','assigned','in_transit','delivered') OR delivery_status IS NULL);

-- Confirmar
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('order_type','delivery_name','delivery_phone','delivery_address','delivery_status')
ORDER BY column_name;
