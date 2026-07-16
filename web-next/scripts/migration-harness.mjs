// Carga las 22 migrations de supabase/ contra una instancia PGlite (Postgres
// real compilado a WASM, sin Docker) para poder probarlas de verdad sin
// tocar la base de produccion. No es parte de la app — es infraestructura
// de testing para supabase/test/*.test.mjs.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SUPABASE_DIR = path.resolve(__dirname, '../../supabase')

// Orden real de MIGRATIONS.md (pasos 1-22), con la ruta real de cada uno.
const MIGRATION_FILES = [
  'create_missing_tables.sql',
  // profiles/categories/orders/order_items nunca tuvieron RLS habilitado
  // en ningun archivo real (solo el obsoleto schema.sql lo hacia) — ver
  // el aviso URGENTE al inicio de MIGRATIONS.md.
  'migrations/URGENT_enable_rls_legacy_tables.sql',
  'fix_delivery_status_constraint.sql',
  'migrations/add_payment_method.sql',
  'schema/delivery_management_schema.sql',
  'migrations/anon_ordering_rls.sql',
  'migrations/fix_tables_and_rls.sql',
  'migrations/customer_notes_rls.sql',
  'migrations/reorganize_tables.sql',
  'migrations/loyalty_points_fix.sql',
  // enable_realtime.sql: ALTER PUBLICATION requiere infraestructura de
  // replicacion logica que PGlite (WASM, un solo proceso) no implementa —
  // no es parte de la logica de negocio, se omite en el harness.
  //
  // menu/archive/*.sql: son cargas de DATOS puntuales contra IDs de
  // categoria especificos de la produccion real (hardcodeados), no schema
  // portable — no tiene sentido probarlas en una DB vacia. Los tests de
  // escenario siembran sus propias categorias/platillos de prueba.
  'staff_pins_schema.sql',
  'migrations/tenant_foundation.sql',
  'migrations/tenant_aware_rls.sql',
  'migrations/tenant_onboarding.sql',
  'migrations/cash_sessions.sql',
  'migrations/inventory.sql',
  'migrations/fix_inventory_reversal.sql',
  'migrations/billing.sql',
  'migrations/fiscal.sql',
  'migrations/customer_credit.sql',
  'migrations/menu_item_cost.sql',
  'migrations/order_item_cost_snapshot.sql',
  'migrations/loyalty_points_atomic.sql',
  'migrations/tenant_feature_toggles.sql',
]

// PGlite no trae uuid-ossp; gen_random_uuid() ya es nativo desde PG13.
function patchSql(sql) {
  return sql.replace(/create extension if not exists "uuid-ossp";?/gi, '')
}

export async function buildTestDb({ verbose = false } = {}) {
  const db = new PGlite()

  // Shim minimo del esquema auth de Supabase: auth.users + auth.uid() que
  // lee el mismo GUC que usa PostgREST/Supabase en produccion
  // (request.jwt.claim.sub), asi que las policies "using (auth.uid() = ...)"
  // se comportan identico a produccion.
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create or replace function uuid_generate_v4() returns uuid language sql as $$
      select gen_random_uuid()
    $$;
  `)

  // Baseline "legacy" — reconstruye las tablas que MIGRATIONS.md documenta
  // como ya existentes en produccion desde antes de cualquier archivo SQL
  // versionado en este repo (creadas a mano en el dashboard de Supabase).
  // create_missing_tables.sql solo las ALTERa, nunca las crea, asi que sin
  // esto ninguna migration real podria probarse. Reconstruido por
  // ingenieria inversa a partir de los comentarios en create_missing_tables.sql
  // y MIGRATIONS.md ("la DB tiene X; el codigo usa Y").
  await db.exec(`
    -- category_id en menu_items (create_missing_tables.sql) es "text
    -- references categories" — la categories.id real de produccion es
    -- TEXT, no uuid (probablemente slugs de un catalogo previo).
    create table public.categories (
      id text primary key default gen_random_uuid()::text,
      name text not null
    );
    create table public.profiles (
      id uuid primary key references auth.users on delete cascade,
      name text,
      role text default 'customer' check (role in ('customer','waiter','kitchen','admin')),
      created_at timestamptz default now()
    );
    -- payments.order_id / loyalty_transactions.order_id (create_missing_tables.sql)
    -- son "text references orders" — orders.id real de produccion es TEXT.
    create table public.orders (
      id text primary key default gen_random_uuid()::text,
      user_id uuid,
      status text default 'open',
      total numeric default 0,
      created_at timestamptz default now()
    );
    -- El codigo entero (OrdersClient, WaiterPortalClient, table-order,
    -- OrderClient, types.ts) inserta/lee item_name + item_price — estas
    -- columnas ya existian en la tabla legacy (create_missing_tables.sql
    -- solo agrega menu_item_id/quantity/unit_price/notes/status/created_at,
    -- nunca item_name/item_price, y el sitio SI toma pedidos reales hoy).
    create table public.order_items (
      id uuid primary key default gen_random_uuid(),
      order_id text references public.orders on delete cascade,
      product_id uuid,
      qty integer,
      price numeric,
      item_name text,
      item_price numeric
    );
    create table public.delivery_zones (
      id uuid primary key default gen_random_uuid(),
      name text,
      delivery_price numeric,
      available boolean default true
    );
    create table public.drivers (
      id uuid primary key default gen_random_uuid(),
      full_name text,
      phone text,
      active boolean default true,
      created_at timestamptz default now()
    );
  `)

  // Roles no-superuser que SI respetan RLS (a diferencia de la conexion que
  // corre las migrations, que es dueña de las tablas y bypasea RLS igual
  // que el rol postgres en Supabase). Se crean ANTES del loop porque varias
  // migrations tienen policies "TO anon"/"TO authenticated" que fallarian
  // si el rol no existe todavia. ALTER DEFAULT PRIVILEGES cubre las tablas
  // que se crean DESPUES de este punto, dentro del loop.
  await db.exec(`
    do $$ begin
      create role anon nologin;
    exception when duplicate_object then null; end $$;
    do $$ begin
      create role authenticated nologin;
    exception when duplicate_object then null; end $$;

    grant usage on schema public to anon, authenticated;
    grant usage on schema auth to anon, authenticated;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `)

  for (const rel of MIGRATION_FILES) {
    const full = path.join(SUPABASE_DIR, rel)
    const raw = readFileSync(full, 'utf8')
    const sql = patchSql(raw)
    try {
      await db.exec(sql)
      if (verbose) console.log(`  ok  ${rel}`)
    } catch (err) {
      throw new Error(`Fallo migration "${rel}": ${err.message}`)
    }
  }

  // Cubre las tablas/funciones ya creadas en el baseline legacy (antes de
  // que existieran los roles) y cualquier cosa que ALTER DEFAULT no haya
  // alcanzado a cubrir.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    grant execute on all functions in schema public to anon, authenticated;
    grant execute on all functions in schema auth to anon, authenticated;
  `)

  return db
}

// Ejecuta queries "como" un usuario autenticado especifico (simula el JWT
// que Supabase adjunta a cada request de un cliente logueado).
export async function asUser(db, userId, fn) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`)
  }
}

// Simula una request anonima (anon key, sin sesion) — cero auth.uid().
export async function asAnon(db, fn) {
  await db.exec(`set role anon; reset request.jwt.claim.sub;`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role;`)
  }
}
