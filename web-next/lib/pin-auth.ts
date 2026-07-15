'use client'

import { createClient } from './supabase/client'
import { clearActiveTenant, setActiveTenant } from './tenant'

export type PinSession = {
  staff_id: string
  full_name: string
  role: 'kitchen' | 'delivery' | 'waiter'
  tenant_id?: string | null
  tenant_slug?: string | null
  tenant_name?: string | null
}

const SESSION_KEY = 'crunchies_pin_session'

export function getPinSession(): PinSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as PinSession) : null
  } catch { return null }
}

export async function loginWithPin(pin: string): Promise<{ session: PinSession | null; error?: string }> {
  let res: Response
  try {
    res = await fetch('/api/portal/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
  } catch {
    return { session: null, error: 'Error de conexión' }
  }

  const json = await res.json()
  if (!res.ok) return { session: null, error: json.error ?? 'Error desconocido' }

  const supabase = createClient()
  const { error: sessionErr } = await supabase.auth.setSession({
    access_token:  json.accessToken,
    refresh_token: json.refreshToken,
  })
  if (sessionErr) {
    console.error('[PIN] setSession:', sessionErr.message)
    return { session: null, error: 'Error al establecer sesión' }
  }

  const session: PinSession = {
    staff_id: json.staffId,
    full_name: json.fullName,
    role: json.role,
    tenant_id: json.tenantId ?? null,
    tenant_slug: json.tenantSlug ?? null,
    tenant_name: json.tenantName ?? null,
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  if (session.tenant_id && session.tenant_slug && session.tenant_name) {
    setActiveTenant({ tenant_id: session.tenant_id, slug: session.tenant_slug, name: session.tenant_name })
  }
  return { session }
}

export async function logoutPin(): Promise<void> {
  const supabase = createClient()
  await supabase.auth.signOut()
  sessionStorage.removeItem(SESSION_KEY)
  clearActiveTenant()
}

export async function logEvent(
  orderId: string,
  event: string,
  staffId: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createClient()
  // fire-and-forget — don't block UI
  supabase.from('order_events').insert({ order_id: orderId, event, staff_id: staffId, metadata }).then()
}
