-- ─────────────────────────────────────────────────────────────────────────────
-- Insertar 6 platos nuevos con sus imágenes — Neón y Sabor Mi Rancho
-- Ejecutar en: Supabase → SQL Editor → New query → Run
--
-- ⚠️  ANTES DE EJECUTAR: revisa los precios en las líneas marcadas con <PRECIO>
--     y ajústalos según tu carta real.
-- ─────────────────────────────────────────────────────────────────────────────

-- IDs de categoría (para referencia):
-- Desayunos              → 361cd52a-0468-43fe-92f0-1dac5e7d65a6
-- Almuerzos              → 00896d26-d3c4-4d06-8659-08b3ec184034
-- Almuerzos a la Carta   → 0d8c9b87-1727-471d-8950-0ad6c2229c6b
-- Bebidas                → 02d2d9e7-33f6-4102-986c-849037982652
-- Comidas Rápidas        → 93f18ea2-a76e-4f39-a9b2-6b8362deee54
-- Bebidas Bar            → f92bb74f-2aea-4cc0-9fd5-e9bc83fc685a

INSERT INTO menu_items (name, description, price, category_id, image_url, available)
VALUES

  -- 1. Carne a la plancha — Almuerzos a la Carta
  (
    'Carne a la plancha',
    'Carne de res asada a la plancha, acompañada de arroz, ensalada y patacones.',
    15000,   -- <PRECIO> ajusta según tu carta
    '0d8c9b87-1727-471d-8950-0ad6c2229c6b',
    'https://neon-y-sabor.vercel.app/customerSide/images/menu/carne-a-la-plancha.png',
    true
  ),

  -- 2. Carne ahumada — Almuerzos a la Carta
  (
    'Carne ahumada',
    'Carne de res ahumada lentamente, servida con guarnición tradicional.',
    18000,   -- <PRECIO> ajusta según tu carta
    '0d8c9b87-1727-471d-8950-0ad6c2229c6b',
    'https://neon-y-sabor.vercel.app/customerSide/images/menu/carne-ahumada.png',
    true
  ),

  -- 3. Carne en viste — Almuerzos Corrientes
  (
    'Carne en viste',
    'Almuerzo corriente con carne en viste, arroz, sopa del día y jugo.',
    13000,   -- <PRECIO> ajusta según tu carta
    '00896d26-d3c4-4d06-8659-08b3ec184034',
    'https://neon-y-sabor.vercel.app/customerSide/images/menu/carne-en-viste-almuerzo-corriente.png',
    true
  ),

  -- 4. Pechuga gratinada — Almuerzos a la Carta
  (
    'Pechuga gratinada',
    'Pechuga de pollo gratinada con queso, acompañada de arroz y ensalada.',
    15000,   -- <PRECIO> ajusta según tu carta
    '0d8c9b87-1727-471d-8950-0ad6c2229c6b',
    'https://neon-y-sabor.vercel.app/customerSide/images/menu/pechuga-gratinada-almuerzo-a-la-carta.png',
    true
  ),

  -- 5. Pechuga rellena — Almuerzos a la Carta
  (
    'Pechuga rellena',
    'Pechuga de pollo rellena con verduras y queso, acompañada de arroz y ensalada.',
    15000,   -- <PRECIO> ajusta según tu carta
    '0d8c9b87-1727-471d-8950-0ad6c2229c6b',
    'https://neon-y-sabor.vercel.app/customerSide/images/menu/pechuga-rellena.png',
    true
  ),

  -- 6. Desayuno Especial — Desayunos
  --    (foto extra del desayuno ejecutivo, variante con diferente acompañamiento)
  (
    'Desayuno Especial',
    'Desayuno completo con huevos al gusto, calentado, arepa, jugo y bebida caliente.',
    12000,   -- <PRECIO> ajusta según tu carta
    '361cd52a-0468-43fe-92f0-1dac5e7d65a6',
    'https://neon-y-sabor.vercel.app/customerSide/images/menu/desayuno-ejecutivo4.png',
    true
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificar que se insertaron correctamente:
SELECT name, price, image_url
FROM menu_items
WHERE name IN (
  'Carne a la plancha', 'Carne ahumada', 'Carne en viste',
  'Pechuga gratinada',  'Pechuga rellena', 'Desayuno Especial'
)
ORDER BY name;
-- ─────────────────────────────────────────────────────────────────────────────
