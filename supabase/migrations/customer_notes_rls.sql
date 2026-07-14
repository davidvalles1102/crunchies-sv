-- ============================================================
--  Notas de Cliente — Tabla + RLS
--  Run in: Supabase → SQL Editor → New Query
-- ============================================================

create extension if not exists "uuid-ossp";

-- Notas operativas internas del staff sobre un cliente (alergias,
-- incidentes, preferencias) — nunca visibles para el cliente mismo.
-- El nombre "customer_notes_created_by_fkey" es el que Postgres genera por
-- default para esta FK (patron tabla_columna_fkey) — el frontend lo usa
-- explicitamente en el join (`profiles!customer_notes_created_by_fkey`),
-- asi que no renombrar esta constraint.
create table if not exists public.customer_notes (
  id          uuid default uuid_generate_v4() primary key,
  customer_id uuid not null references public.profiles on delete cascade,
  note        text not null,
  created_by  uuid references public.profiles on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.customer_notes enable row level security;

-- Solo staff (admin/waiter) puede ver y escribir notas — son notas
-- operativas internas (alergias, incidentes), no para el cliente.
create policy "customer_notes_staff" on public.customer_notes for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','waiter')));
