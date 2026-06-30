-- ============================================================
--  Crunchies — Reemplazo completo del menú
--  Run in: Supabase → SQL Editor → New Query
-- ============================================================

-- Limpieza del menú anterior (las órdenes históricas no se borran,
-- solo pierden el vínculo a estos platillos por diseño del schema)
DELETE FROM public.menu_items;
DELETE FROM public.categories;

-- ─── Categorías nuevas ──────────────────────────────────────
INSERT INTO public.categories (name, icon, display_order, active) VALUES
  ('Burgers',         '🍔', 1, true),
  ('Alitas y Chunks',  '🍗', 2, true),
  ('Papas',           '🍟', 3, true),
  ('Combos',          '🎉', 4, true);

-- ─── Platillos nuevos ───────────────────────────────────────
WITH cat AS (SELECT id, name FROM public.categories)
INSERT INTO public.menu_items (category_id, name, description, price, image_url, available, is_featured)
SELECT id, 'Burger & Wings', 'Hamburguesa con alitas y papas', 5.00, '/menu/burger-wings.jpg', true, false FROM cat WHERE name = 'Burgers'
UNION ALL
SELECT id, 'Burger Doble', 'Doble carne, doble queso, con papas', 5.00, '/menu/burger-doble.jpg', true, false FROM cat WHERE name = 'Burgers'
UNION ALL
SELECT id, 'Bacon Burger', 'Con tocino, queso, lechuga y tomate', 5.00, '/menu/bacon-burger.jpg', true, false FROM cat WHERE name = 'Burgers'
UNION ALL
SELECT id, 'Alitas Pequeña', 'Alitas bañadas en salsa, con papas', 4.00, '/menu/alitas.jpg', true, false FROM cat WHERE name = 'Alitas y Chunks'
UNION ALL
SELECT id, 'Alitas Mediana', 'Alitas bañadas en salsa, con papas', 7.00, '/menu/alitas.jpg', true, false FROM cat WHERE name = 'Alitas y Chunks'
UNION ALL
SELECT id, 'Alitas Grande', 'Alitas bañadas en salsa, con papas', 10.00, '/menu/alitas.jpg', true, false FROM cat WHERE name = 'Alitas y Chunks'
UNION ALL
SELECT id, 'Alitas Familiar', 'Alitas bañadas en salsa, con papas', 18.00, '/menu/alitas.jpg', true, false FROM cat WHERE name = 'Alitas y Chunks'
UNION ALL
SELECT id, 'Chunks Pequeño', 'Trozos de pollo crujiente, con papas', 4.00, '/menu/chunks.jpg', true, false FROM cat WHERE name = 'Alitas y Chunks'
UNION ALL
SELECT id, 'Chunks Mediano', 'Trozos de pollo crujiente, con papas', 7.00, '/menu/chunks.jpg', true, false FROM cat WHERE name = 'Alitas y Chunks'
UNION ALL
SELECT id, 'Chunks Grande', 'Trozos de pollo crujiente, con papas', 10.00, '/menu/chunks.jpg', true, false FROM cat WHERE name = 'Alitas y Chunks'
UNION ALL
SELECT id, 'Chunks Familiar', 'Trozos de pollo crujiente, con papas', 18.00, '/menu/chunks.jpg', true, false FROM cat WHERE name = 'Alitas y Chunks'
UNION ALL
SELECT id, 'Papa Suprema', 'Papas cargadas con carnes, salchicha y aderezos', 5.00, '/menu/papa-suprema.jpg', true, false FROM cat WHERE name = 'Papas'
UNION ALL
SELECT id, 'Party Friends', '18 alitas + 1 chilipapa o chilinachos + 3 burgers', 19.99, '/menu/party-friends.jpg', true, true FROM cat WHERE name = 'Combos';

-- Confirmar
SELECT c.name AS categoria, m.name, m.price, m.image_url
FROM public.menu_items m JOIN public.categories c ON c.id = m.category_id
ORDER BY c.display_order, m.price;
