-- ═══════════════════════════════════════════════════════════════════
-- Reorganización de mesas — Neón y Sabor Mi Rancho
-- Zonas: VIP · Fogata · Exterior · Salón Principal
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════


-- ─── PASO 1: Eliminar mesas actuales ───────────────────────────────
-- Las FK en orders y reservations son ON DELETE SET NULL,
-- por lo que los registros históricos no se pierden, solo quedan
-- con table_id = NULL.
DELETE FROM public.restaurant_tables;


-- ─── PASO 2: Actualizar el CHECK constraint de location ────────────
-- El constraint anterior sólo aceptaba interior / terraza / barra / privado
ALTER TABLE public.restaurant_tables
  DROP CONSTRAINT IF EXISTS restaurant_tables_location_check;

ALTER TABLE public.restaurant_tables
  ADD CONSTRAINT restaurant_tables_location_check
  CHECK (location IN ('Zona VIP', 'Zona Fogata', 'Exterior', 'Salón Principal'));


-- ─── PASO 3: Insertar las nuevas mesas ─────────────────────────────
INSERT INTO public.restaurant_tables (number, capacity, location) VALUES

  -- Zona VIP — 3 mesas · 3 personas c/u
  (1,  3, 'Zona VIP'),
  (2,  3, 'Zona VIP'),
  (3,  3, 'Zona VIP'),

  -- Zona Fogata — 1 mesa · 6 personas
  (4,  6, 'Zona Fogata'),

  -- Exterior — 2 mesas · 4 personas c/u
  (5,  4, 'Exterior'),
  (6,  4, 'Exterior'),

  -- Salón Principal — 2 mesas familiares · 7 personas c/u
  (7,  7, 'Salón Principal'),
  (8,  7, 'Salón Principal'),

  -- Salón Principal — 6 mesas estándar · 4 personas c/u
  (9,  4, 'Salón Principal'),
  (10, 4, 'Salón Principal'),
  (11, 4, 'Salón Principal'),
  (12, 4, 'Salón Principal'),
  (13, 4, 'Salón Principal'),
  (14, 4, 'Salón Principal');


-- ─── VERIFICACIÓN ──────────────────────────────────────────────────
SELECT
  number        AS "Mesa #",
  location      AS "Zona",
  capacity      AS "Personas",
  status        AS "Estado"
FROM public.restaurant_tables
ORDER BY number;
