-- ─────────────────────────────────────────────────────────────────────────────
-- Actualización de imágenes del menú — Neón y Sabor Mi Rancho
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Base URL: https://neon-y-sabor.vercel.app/customerSide/images/menu/
-- ─────────────────────────────────────────────────────────────────────────────

-- Alitas BBQ (ambas entradas)
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/alitas-bbq.png'
WHERE name = 'Alitas BBQ';

-- Almuerzo Corriente
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/almuerzo-corriente-carne-desmechada.png'
WHERE name = 'Almuerzo Corriente';

-- Cócteles
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/cocteles.png'
WHERE name = 'Cócteles';

-- Costilla ahumada
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/costilla-ahumada-a-la-carta.png'
WHERE name = 'Costilla ahumada';

-- Costilla BBQ
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/costilla-ahumada-de-cerdo.png'
WHERE name = 'Costilla BBQ';

-- Desayuno Ejecutivo
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/desayuno-ejecutivo1.png'
WHERE name = 'Desayuno Ejecutivo';

-- Desayuno Corriente (foto adicional disponible)
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/desayuno-ejecutivo2.png'
WHERE name = 'Desayuno Corriente';

-- Filete de tilapia
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/tilapia-frita-almuerzo-a-la-carta.png'
WHERE name = 'Filete de tilapia';

-- Jugos naturales
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/jugo-de-maracuya.png'
WHERE name = 'Jugos naturales';

-- Pataconazo
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/pataconaso.png'
WHERE name = 'Pataconazo';

-- Pechuga a la plancha
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/pechuga-a-la-plancha.png'
WHERE name = 'Pechuga a la plancha';

-- Picadas
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/picada-campesina.png'
WHERE name = 'Picadas';

-- Salchipapa
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/salchipapa-costena.png'
WHERE name = 'Salchipapa';

-- Tilapia ahumada
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/tapado-de-cachama-ahumada.png'
WHERE name = 'Tilapia ahumada';

-- Pescado de río (cachama = pez de río)
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/cachama-sudada-almuerzo-corriente.png'
WHERE name = 'Pescado de río';

-- Bandeja paisa mini
UPDATE menu_items SET image_url = 'https://neon-y-sabor.vercel.app/customerSide/images/menu/bandeja-paisa-mini.jpeg'
WHERE name = 'Bandeja paisa mini';

-- ─────────────────────────────────────────────────────────────────────────────
-- IMÁGENES SIN COINCIDENCIA EXACTA EN EL MENÚ (disponibles para asignar):
-- carne-a-la-plancha.png
-- carne-ahumada.png
-- carne-en-viste-almuerzo-corriente.png
-- pechuga-gratinada-almuerzo-a-la-carta.png
-- pechuga-rellena.png
-- desayuno-ejecutivo4.png
--
-- Si agregas estos platos al menú, usa las URLs:
-- https://neon-y-sabor.vercel.app/customerSide/images/menu/carne-a-la-plancha.png
-- https://neon-y-sabor.vercel.app/customerSide/images/menu/carne-ahumada.png
-- https://neon-y-sabor.vercel.app/customerSide/images/menu/pechuga-gratinada-almuerzo-a-la-carta.png
-- https://neon-y-sabor.vercel.app/customerSide/images/menu/pechuga-rellena.png
-- ─────────────────────────────────────────────────────────────────────────────

-- Verificar resultados:
SELECT name, image_url FROM menu_items WHERE image_url IS NOT NULL ORDER BY name;
