-- ============================================================
--  Seed Data — Neón y Sabor Mi Rancho
--  Run AFTER schema.sql
-- ============================================================

-- ── Categorías ─────────────────────────────────────────────
INSERT INTO public.categories (name, icon, display_order, active) VALUES
  ('Desayunos',            '🍳', 1, true),
  ('Almuerzos',            '🍲', 2, true),
  ('Almuerzos a la Carta', '🍽️', 3, true),
  ('Bebidas',              '🥤', 4, true),
  ('Comidas Rápidas',      '🍔', 5, true),
  ('Bebidas Bar',          '🍻', 6, true);

-- ── Platillos ───────────────────────────────────────────────
WITH cats AS (SELECT id, name FROM public.categories)
INSERT INTO public.menu_items (category_id, name, description, price, is_featured, available) VALUES

  -- Desayunos
  ((SELECT id FROM cats WHERE name='Desayunos'),
    'Desayuno Ejecutivo',
    'Huevos al gusto (pericos / revueltos / fritos / pericos rancheros) + acompañamiento a elección (arepa / pan / patacones / arroz). Adición de frutas y queso disponible.',
    12000, true, true),
  ((SELECT id FROM cats WHERE name='Desayunos'),
    'Desayuno Corriente',
    'Caldo del día + proteína a elección (carne asada / pechuga / cerdo / huevos sudados / chorizo).',
    10000, false, true),

  -- Almuerzos
  ((SELECT id FROM cats WHERE name='Almuerzos'),
    'Almuerzo Corriente',
    'Sopa del día, principio del día, arroz, proteína y ensalada.',
    13000, true, true),

  -- Almuerzos a la Carta
  ((SELECT id FROM cats WHERE name='Almuerzos a la Carta'), 'Costilla ahumada',            'Costilla de cerdo ahumada al estilo de la casa.',                               18000, true,  true),
  ((SELECT id FROM cats WHERE name='Almuerzos a la Carta'), 'Tilapia ahumada',             'Tilapia entera ahumada.',                                                        18000, false, true),
  ((SELECT id FROM cats WHERE name='Almuerzos a la Carta'), 'Bandeja paisa mini',          'Frijoles, chicharrón, carne, chorizo, morcilla, huevo, arroz, arepa y tajada.', 20000, true,  true),
  ((SELECT id FROM cats WHERE name='Almuerzos a la Carta'), 'Costilla BBQ',                'Costilla de cerdo en salsa BBQ de la casa.',                                     15000, false, true),
  ((SELECT id FROM cats WHERE name='Almuerzos a la Carta'), 'Alitas BBQ',                  'Alitas de pollo en salsa BBQ.',                                                  15000, true,  true),
  ((SELECT id FROM cats WHERE name='Almuerzos a la Carta'), 'Sancocho de gallina de campo','Sancocho tradicional de gallina criolla.',                                        25000, true,  true),
  ((SELECT id FROM cats WHERE name='Almuerzos a la Carta'), 'Sancocho gallina piqui mocha','Sancocho especial de gallina piqui mocha.',                                       15000, false, true),
  ((SELECT id FROM cats WHERE name='Almuerzos a la Carta'), 'Ajiaco',                      'Ajiaco bogotano con pollo, papas y guascas.',                                    14000, false, true),
  ((SELECT id FROM cats WHERE name='Almuerzos a la Carta'), 'Trucha',                      'Trucha a la plancha con guarnición.',                                            18000, false, true),
  ((SELECT id FROM cats WHERE name='Almuerzos a la Carta'), 'Filete de tilapia',           'Filete de tilapia a la plancha.',                                                18000, false, true),
  ((SELECT id FROM cats WHERE name='Almuerzos a la Carta'), 'Pescado de río',              'Pescado de río fresco del día.',                                                 18000, false, true),

  -- Bebidas
  ((SELECT id FROM cats WHERE name='Bebidas'), 'Jugo de naranja',  'Jugo natural de naranja.',                 5000, false, true),
  ((SELECT id FROM cats WHERE name='Bebidas'), 'Gaseosas',         'Surtido de gaseosas.',                     3000, false, true),
  ((SELECT id FROM cats WHERE name='Bebidas'), 'Coca-Cola',        'Coca-Cola en lata o botella.',             3000, false, true),
  ((SELECT id FROM cats WHERE name='Bebidas'), 'Limonada natural', 'Limonada natural con o sin azúcar.',       5000, false, true),
  ((SELECT id FROM cats WHERE name='Bebidas'), 'Chocolate',        'Chocolate caliente con leche.',            4000, false, true),
  ((SELECT id FROM cats WHERE name='Bebidas'), 'Café en leche',    'Café colombiano con leche caliente.',      4000, false, true),
  ((SELECT id FROM cats WHERE name='Bebidas'), 'Tinto',            'Tinto colombiano.',                        2000, false, true),
  ((SELECT id FROM cats WHERE name='Bebidas'), 'Jugos naturales',  'Jugos de frutas de temporada.',            5000, false, true),
  ((SELECT id FROM cats WHERE name='Bebidas'), 'Agua natural',     'Agua en botella.',                         2000, false, true),

  -- Comidas Rápidas
  ((SELECT id FROM cats WHERE name='Comidas Rápidas'), 'Salchipapa',               'Papas fritas con salchichas y salsas.',                          8000, false, true),
  ((SELECT id FROM cats WHERE name='Comidas Rápidas'), 'Picadas',                  'Selección de carnes y acompañamientos para compartir.',         12000, true,  true),
  ((SELECT id FROM cats WHERE name='Comidas Rápidas'), 'Pataconazo',               'Patacón con hogao y guarnición.',                               10000, false, true),
  ((SELECT id FROM cats WHERE name='Comidas Rápidas'), 'Hamburguesas',             'Hamburguesa artesanal de la casa.',                             12000, true,  true),
  ((SELECT id FROM cats WHERE name='Comidas Rápidas'), 'Arepa de choclo con queso','Arepa de choclo dulce con queso blanco derretido.',              6000, false, true),
  ((SELECT id FROM cats WHERE name='Comidas Rápidas'), 'Arepa rellena',            'Arepa rellena con queso y carnes.',                              8000, false, true),
  ((SELECT id FROM cats WHERE name='Comidas Rápidas'), 'Alitas BBQ',               'Alitas de pollo en salsa BBQ.',                                 15000, true,  true),
  ((SELECT id FROM cats WHERE name='Comidas Rápidas'), 'Picadas de pollo',         'Pollo apanado o a la plancha en trozos.',                       12000, false, true),
  ((SELECT id FROM cats WHERE name='Comidas Rápidas'), 'Pechuga a la plancha',     'Pechuga de pollo a la plancha con guarnición.',                 12000, false, true),
  ((SELECT id FROM cats WHERE name='Comidas Rápidas'), 'Pinchos de cerdo y pollo', 'Pinchos a la parrilla de cerdo y pollo.',                       10000, false, true),

  -- Bebidas Bar
  ((SELECT id FROM cats WHERE name='Bebidas Bar'), 'Michelada sin alcohol', 'Michelada de limón sin alcohol.',   8000, false, true),
  ((SELECT id FROM cats WHERE name='Bebidas Bar'), 'Michelada con alcohol', 'Michelada con cerveza.',           12000, true,  true),
  ((SELECT id FROM cats WHERE name='Bebidas Bar'), 'Cócteles',             'Cócteles de la carta.',             15000, true,  true),
  ((SELECT id FROM cats WHERE name='Bebidas Bar'), 'Cubetazo',             'Cubo de cervezas surtidas.',        25000, true,  true);

-- ── Mesas ───────────────────────────────────────────────────
-- Zonas: VIP (3) · Fogata (1) · Exterior (2) · Salón Principal (8)
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
  -- Salón Principal — 2 familiares (7p) + 6 estándar (4p)
  (7,  7, 'Salón Principal'),
  (8,  7, 'Salón Principal'),
  (9,  4, 'Salón Principal'),
  (10, 4, 'Salón Principal'),
  (11, 4, 'Salón Principal'),
  (12, 4, 'Salón Principal'),
  (13, 4, 'Salón Principal'),
  (14, 4, 'Salón Principal');
