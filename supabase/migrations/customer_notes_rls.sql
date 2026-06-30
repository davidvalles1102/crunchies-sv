-- ============================================================
--  Notas de Cliente — RLS
--  Run in: Supabase → SQL Editor → New Query
--  (la tabla public.customer_notes ya debe existir)
-- ============================================================

alter table public.customer_notes enable row level security;

-- Solo staff (admin/waiter) puede ver y escribir notas — son notas
-- operativas internas (alergias, incidentes), no para el cliente.
create policy "customer_notes_staff" on public.customer_notes for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','waiter')));
