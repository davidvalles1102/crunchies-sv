-- ============================================================
--  Crunchies — Precios reales El Salvador (USD)
--  Ejecutar en: Supabase → SQL Editor → New Query → Run
-- ============================================================

UPDATE public.menu_items SET price =
  CASE name
    -- Desayunos
    WHEN 'Desayuno Ejecutivo'          THEN 4
    WHEN 'Desayuno Corriente'          THEN 3
    WHEN 'Desayuno Especial'           THEN 4

    -- Almuerzos
    WHEN 'Almuerzo Corriente'          THEN 4

    -- Almuerzos a la Carta
    WHEN 'Costilla ahumada'            THEN 8
    WHEN 'Tilapia ahumada'             THEN 8
    WHEN 'Bandeja paisa mini'          THEN 9
    WHEN 'Costilla BBQ'                THEN 7
    WHEN 'Alitas BBQ'                  THEN 6
    WHEN 'Sancocho de gallina de campo'THEN 8
    WHEN 'Sancocho gallina piqui mocha'THEN 6
    WHEN 'Ajiaco'                      THEN 5
    WHEN 'Trucha'                      THEN 8
    WHEN 'Filete de tilapia'           THEN 8
    WHEN 'Pescado de río'              THEN 8
    WHEN 'Carne a la plancha'          THEN 7
    WHEN 'Carne ahumada'               THEN 8
    WHEN 'Carne en viste'              THEN 5
    WHEN 'Pechuga gratinada'           THEN 6
    WHEN 'Pechuga rellena'             THEN 6

    -- Bebidas
    WHEN 'Jugo de naranja'             THEN 2
    WHEN 'Jugos naturales'             THEN 2
    WHEN 'Limonada natural'            THEN 2
    WHEN 'Gaseosas'                    THEN 1
    WHEN 'Coca-Cola'                   THEN 1
    WHEN 'Chocolate'                   THEN 1
    WHEN 'Café en leche'               THEN 1
    WHEN 'Tinto'                       THEN 1
    WHEN 'Agua natural'                THEN 1

    -- Comidas Rápidas
    WHEN 'Salchipapa'                  THEN 3
    WHEN 'Picadas'                     THEN 5
    WHEN 'Pataconazo'                  THEN 4
    WHEN 'Hamburguesas'                THEN 4
    WHEN 'Arepa de choclo con queso'   THEN 2
    WHEN 'Arepa rellena'               THEN 3
    WHEN 'Picadas de pollo'            THEN 5
    WHEN 'Pechuga a la plancha'        THEN 5
    WHEN 'Pinchos de cerdo y pollo'    THEN 4

    -- Bebidas Bar
    WHEN 'Michelada sin alcohol'       THEN 3
    WHEN 'Michelada con alcohol'       THEN 4
    WHEN 'Cócteles'                    THEN 5
    WHEN 'Cubetazo'                    THEN 12

    -- Cualquier otro ítem: dividir entre 3000 (COP → USD aproximado)
    ELSE GREATEST(1, ROUND(price / 3000))
  END;

-- Verificar resultado
SELECT name, price FROM public.menu_items ORDER BY category_id, price DESC;
