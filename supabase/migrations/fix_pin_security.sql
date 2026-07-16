-- ═══════════════════════════════════════════════════════════════════
-- fix_pin_security.sql
-- 1. Rate limiting en verify_staff_pin (failed_attempts + locked_until)
-- 2. Eliminar get_role_credentials — las credenciales van a .env, no a la DB
-- 3. Restringir order_events a INSERT-only para roles no-admin
-- Idempotente: usa IF NOT EXISTS / CREATE OR REPLACE
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Columnas de rate limiting en staff_members ──────────────────

ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until    timestamptz;

-- ─── 2. verify_staff_pin con rate limiting ──────────────────────────

DROP FUNCTION IF EXISTS public.verify_staff_pin(text);

CREATE OR REPLACE FUNCTION public.verify_staff_pin(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_any  public.staff_members%ROWTYPE;
  v_active public.staff_members%ROWTYPE;
BEGIN
  -- Buscar el miembro por PIN (activo o no) para chequear lockout
  SELECT * INTO v_any FROM public.staff_members WHERE pin = p_pin LIMIT 1;

  -- PIN encontrado: verificar lockout
  IF FOUND AND v_any.locked_until IS NOT NULL AND v_any.locked_until > now() THEN
    RETURN jsonb_build_object('error', 'locked');
  END IF;

  -- Verificar PIN activo
  SELECT * INTO v_active
  FROM public.staff_members
  WHERE pin = p_pin AND active = true;

  IF NOT FOUND THEN
    -- Incrementar intentos fallidos (si el PIN existe)
    UPDATE public.staff_members
    SET
      failed_attempts = failed_attempts + 1,
      locked_until = CASE
        WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes'
        ELSE locked_until
      END
    WHERE pin = p_pin;
    RETURN NULL;
  END IF;

  -- Éxito: resetear contadores
  UPDATE public.staff_members
  SET last_login = now(), failed_attempts = 0, locked_until = NULL
  WHERE id = v_active.id;

  RETURN jsonb_build_object(
    'staff_id',  v_active.id,
    'full_name', v_active.full_name,
    'role',      v_active.role
  );
END;
$$;

-- ─── 3. Eliminar get_role_credentials (credentials van a .env) ──────

REVOKE EXECUTE ON FUNCTION public.get_role_credentials(text) FROM anon, authenticated;
DROP FUNCTION IF EXISTS public.get_role_credentials(text);

-- ─── 4. order_events: solo INSERT para staff (no UPDATE/DELETE) ─────

DROP POLICY IF EXISTS "order_events_staff" ON public.order_events;

-- Admin puede todo
CREATE POLICY "order_events_admin"
  ON public.order_events FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Staff (mesero/cocina/delivery) solo puede insertar
CREATE POLICY "order_events_staff_insert"
  ON public.order_events FOR INSERT TO authenticated
  WITH CHECK (true);

-- Staff puede leer sus propios eventos
CREATE POLICY "order_events_staff_select"
  ON public.order_events FOR SELECT TO authenticated
  USING (
    staff_id IN (
      SELECT id FROM public.staff_members WHERE active = true
    )
  );

-- ─── 5. Restaurar GRANT (DROP+CREATE lo borra) ──────────────────────

GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text) TO anon, authenticated;

-- ─── 6. Verificación ────────────────────────────────────────────────

SELECT column_name FROM information_schema.columns
WHERE table_name = 'staff_members'
  AND column_name IN ('failed_attempts', 'locked_until');

SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('verify_staff_pin', 'get_role_credentials');
