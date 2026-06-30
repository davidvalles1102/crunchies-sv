-- ══════════════════════════════════════════════════════════════════════════════
--  Neón y Sabor Mi Rancho — Actualización de Menú Real
--  Ejecutar en: Supabase → SQL Editor
--  NOTA: Borra todos los items y categorías previas (no afecta órdenes).
--  Los precios de bebidas, comidas rápidas y bebidas bar marcados con (*)
--  son estimados — puedes ajustarlos desde Admin → Menú.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cat_desayunos uuid;
  cat_almuerzos uuid;
  cat_carta     uuid;
  cat_bebidas   uuid;
  cat_rapidas   uuid;
  cat_bar       uuid;
BEGIN

  -- 1. Limpiar menú anterior (ON DELETE SET NULL en order_items, seguro)
  DELETE FROM public.menu_items;
  DELETE FROM public.categories;

  -- 2. Categorías
  INSERT INTO public.categories (name, icon, display_order, active)
    VALUES ('Desayunos', '🍳', 1, true) RETURNING id INTO cat_desayunos;

  INSERT INTO public.categories (name, icon, display_order, active)
    VALUES ('Almuerzos', '🍲', 2, true) RETURNING id INTO cat_almuerzos;

  INSERT INTO public.categories (name, icon, display_order, active)
    VALUES ('Almuerzos a la Carta', '🍽️', 3, true) RETURNING id INTO cat_carta;

  INSERT INTO public.categories (name, icon, display_order, active)
    VALUES ('Bebidas', '🥤', 4, true) RETURNING id INTO cat_bebidas;

  INSERT INTO public.categories (name, icon, display_order, active)
    VALUES ('Comidas Rápidas', '🍔', 5, true) RETURNING id INTO cat_rapidas;

  INSERT INTO public.categories (name, icon, display_order, active)
    VALUES ('Bebidas Bar', '🍻', 6, true) RETURNING id INTO cat_bar;

  -- 3. Desayunos
  INSERT INTO public.menu_items (category_id, name, description, price, is_featured, available) VALUES
    (cat_desayunos,
      'Desayuno Ejecutivo',
      'Huevos al gusto (pericos / revueltos / fritos / pericos rancheros) + acompañamiento a elección (arepa / pan / patacones / arroz). Adición de frutas y queso disponible.',
      12000, true, true),
    (cat_desayunos,
      'Desayuno Corriente',
      'Caldo del día + proteína a elección (carne asada / pechuga / cerdo / huevos sudados / chorizo).',
      10000, false, true);

  -- 4. Almuerzos
  INSERT INTO public.menu_items (category_id, name, description, price, is_featured, available) VALUES
    (cat_almuerzos,
      'Almuerzo Corriente',
      'Sopa del día, principio del día, arroz, proteína y ensalada.',
      13000, true, true);

  -- 5. Almuerzos a la Carta
  INSERT INTO public.menu_items (category_id, name, description, price, is_featured, available) VALUES
    (cat_carta, 'Costilla ahumada',              'Costilla de cerdo ahumada al estilo de la casa.',                                    18000, true,  true),
    (cat_carta, 'Tilapia ahumada',               'Tilapia entera ahumada.',                                                            18000, false, true),
    (cat_carta, 'Bandeja paisa mini',             'Frijoles, chicharrón, carne, chorizo, morcilla, huevo, arroz, arepa y tajada.',      20000, true,  true),
    (cat_carta, 'Costilla BBQ',                   'Costilla de cerdo en salsa BBQ de la casa.',                                         15000, false, true),
    (cat_carta, 'Alitas BBQ',                     'Alitas de pollo en salsa BBQ.',                                                      15000, true,  true),
    (cat_carta, 'Sancocho de gallina de campo',   'Sancocho tradicional de gallina criolla.',                                           25000, true,  true),
    (cat_carta, 'Sancocho gallina piqui mocha',   'Sancocho especial de gallina piqui mocha.',                                          15000, false, true),
    (cat_carta, 'Ajiaco',                         'Ajiaco bogotano con pollo, papas y guascas.',                                        14000, false, true),
    (cat_carta, 'Trucha',                         'Trucha a la plancha con guarnición.',                                                18000, false, true),
    (cat_carta, 'Filete de tilapia',              'Filete de tilapia a la plancha.',                                                    18000, false, true),
    (cat_carta, 'Pescado de río',                 'Pescado de río fresco del día.',                                                     18000, false, true);

  -- 6. Bebidas  (*) = precio estimado, ajustar en Admin → Menú
  INSERT INTO public.menu_items (category_id, name, description, price, is_featured, available) VALUES
    (cat_bebidas, 'Jugo de naranja',    'Jugo natural de naranja.',                    5000, false, true),
    (cat_bebidas, 'Gaseosas',           'Surtido de gaseosas.',                        3000, false, true),
    (cat_bebidas, 'Coca-Cola',          'Coca-Cola en lata o botella.',                3000, false, true),
    (cat_bebidas, 'Limonada natural',   'Limonada natural con o sin azúcar.',          5000, false, true),
    (cat_bebidas, 'Chocolate',          'Chocolate caliente con leche.',               4000, false, true),
    (cat_bebidas, 'Café en leche',      'Café colombiano con leche caliente.',         4000, false, true),
    (cat_bebidas, 'Tinto',              'Tinto colombiano.',                           2000, false, true),
    (cat_bebidas, 'Jugos naturales',    'Jugos de frutas de temporada.',               5000, false, true),
    (cat_bebidas, 'Agua natural',       'Agua en botella.',                            2000, false, true);

  -- 7. Comidas Rápidas  (*) = precio estimado
  INSERT INTO public.menu_items (category_id, name, description, price, is_featured, available) VALUES
    (cat_rapidas, 'Salchipapa',               'Papas fritas con salchichas y salsas.',                          8000, false, true),
    (cat_rapidas, 'Picadas',                  'Selección de carnes y acompañamientos para compartir.',         12000, true,  true),
    (cat_rapidas, 'Pataconazo',               'Patacón con hogao y guarnición.',                               10000, false, true),
    (cat_rapidas, 'Hamburguesas',             'Hamburguesa artesanal de la casa.',                             12000, true,  true),
    (cat_rapidas, 'Arepa de choclo con queso','Arepa de choclo dulce con queso blanco derretido.',             6000, false, true),
    (cat_rapidas, 'Arepa rellena',            'Arepa rellena con queso y carnes.',                             8000, false, true),
    (cat_rapidas, 'Alitas BBQ',               'Alitas de pollo en salsa BBQ.',                                15000, true,  true),
    (cat_rapidas, 'Picadas de pollo',         'Pollo apanado o a la plancha en trozos.',                      12000, false, true),
    (cat_rapidas, 'Pechuga a la plancha',     'Pechuga de pollo a la plancha con guarnición.',                12000, false, true),
    (cat_rapidas, 'Pinchos de cerdo y pollo', 'Pinchos a la parrilla de cerdo y pollo.',                      10000, false, true);

  -- 8. Bebidas Bar  (*) = precio estimado
  INSERT INTO public.menu_items (category_id, name, description, price, is_featured, available) VALUES
    (cat_bar, 'Michelada sin alcohol', 'Michelada de limón sin alcohol.',    8000, false, true),
    (cat_bar, 'Michelada con alcohol', 'Michelada con cerveza.',            12000, true,  true),
    (cat_bar, 'Cócteles',             'Cócteles de la carta.',              15000, true,  true),
    (cat_bar, 'Cubetazo',             'Cubo de cervezas surtidas.',         25000, true,  true);

END $$;
