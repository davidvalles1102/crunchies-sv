-- ============================================================
--  URGENTE — Habilitar RLS en profiles/categories/orders/order_items
--  Ejecutar YA, sin importar en que paso de MIGRATIONS.md estas.
--  Idempotente y seguro de correr en cualquier momento.
-- ============================================================
--
-- Hallazgo (encontrado corriendo las migrations contra una copia de
-- prueba real, no contra produccion): el UNICO archivo que alguna vez
-- habilita RLS en profiles/categories/orders/order_items es schema.sql —
-- y schema.sql esta marcado como OBSOLETO / NO EJECUTAR en MIGRATIONS.md
-- desde el principio de este repo. create_missing_tables.sql (que si se
-- corrio) habilita RLS en las tablas NUEVAS que crea (menu_items,
-- payments, reservations, etc.) pero nunca en estas 4, porque asumio que
-- ya venian con RLS activo desde antes.
--
-- Consecuencia real: las policies "orders_staff", "orders_customer_own",
-- "profile_select_own", "cat_admin_write", etc. (creadas por
-- anon_ordering_rls.sql, fix_tables_and_rls.sql, y las que este proyecto
-- fue agregando) EXISTEN pero estan completamente inertes — Postgres solo
-- aplica policies en una tabla si esa tabla tiene
-- "ENABLE ROW LEVEL SECURITY" corrido. Sin este paso, CUALQUIER usuario
-- autenticado (y posiblemente anon, segun los grants por defecto de
-- Supabase) puede leer/escribir CUALQUIER fila de orders/order_items/
-- profiles/categories sin ninguna restriccion real, sin importar cuantas
-- policies existan en pg_policies.
--
-- Esto es INDEPENDIENTE del trabajo multitenant (fases 15-22) — aplica
-- ahora mismo a la arquitectura actual de un solo negocio.

alter table public.profiles    enable row level security;
alter table public.categories  enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- ------------------------------------------------------------
-- Verificacion — las 4 deben mostrar rowsecurity = true
-- ------------------------------------------------------------

-- select relname, relrowsecurity
-- from pg_class
-- where relname in ('profiles', 'categories', 'orders', 'order_items');
