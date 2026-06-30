-- ============================================================
--  Crunchies — Tabla de Gastos
--  Ejecutar en: Supabase → SQL Editor → New Query → Run
--  (Si ya existe la tabla, usar solo la sección de RLS al final)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id             uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  expense_date   date        NOT NULL DEFAULT current_date,
  category       text        NOT NULL CHECK (category IN ('insumos','servicios','nomina','renta','mantenimiento','marketing','transporte','otros')),
  description    text        NOT NULL,
  amount         decimal(10,2) NOT NULL CHECK (amount > 0),
  payment_method text        DEFAULT 'cash' CHECK (payment_method IN ('cash','card','transfer')),
  is_recurring   boolean     DEFAULT false,
  recurrence     text        CHECK (recurrence IN ('daily','weekly','monthly')),
  registered_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Admin y waiter pueden ver y registrar gastos; solo admin puede eliminar
DROP POLICY IF EXISTS "expenses_admin_all"    ON public.expenses;
DROP POLICY IF EXISTS "expenses_staff_select" ON public.expenses;
DROP POLICY IF EXISTS "expenses_staff_write"  ON public.expenses;
DROP POLICY IF EXISTS "expenses_admin_delete" ON public.expenses;

CREATE POLICY "expenses_staff_select" ON public.expenses FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','waiter')));

CREATE POLICY "expenses_staff_write" ON public.expenses FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','waiter')));

CREATE POLICY "expenses_admin_update" ON public.expenses FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "expenses_admin_delete" ON public.expenses FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
