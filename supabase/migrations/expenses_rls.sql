-- ============================================================
--  Registro de Gastos — RLS
--  Run in: Supabase → SQL Editor → New Query
--  (la tabla public.expenses ya debe existir)
-- ============================================================

alter table public.expenses enable row level security;

-- Solo admin puede ver, crear, editar y borrar gastos
create policy "expenses_admin_all" on public.expenses for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
