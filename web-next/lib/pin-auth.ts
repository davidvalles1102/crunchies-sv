'use client'

import { createClient } from './supabase/client'

export type PinSession = {
  staff_id: string
  full_name: string
  role: 'kitchen' | 'delivery' | 'waiter'
}

const SESSION_KEY = 'crunchies_pin_session'

export function getPinSession(): PinSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as PinSession) : null
  } catch { return null }
}

export async function loginWithPin(pin: string): Promise<PinSession | null> {
  const supabase = createClient()

  const { data: staff } = await supabase.rpc('verify_staff_pin', { p_pin: pin })
  if (!staff) return null

  const { data: creds } = await supabase.rpc('get_role_credentials', { p_pin: pin })
  if (!creds) return null

  const { error } = await supabase.auth.signInWithPassword({
    email: (creds as { email: string; password: string }).email,
    password: (creds as { email: string; password: string }).password,
  })
  if (error) return null

  const session: PinSession = {
    staff_id: (staff as { staff_id: string; full_name: string; role: 'kitchen' | 'delivery' | 'waiter' }).staff_id,
    full_name: (staff as { staff_id: string; full_name: string; role: 'kitchen' | 'delivery' | 'waiter' }).full_name,
    role: (staff as { staff_id: string; full_name: string; role: 'kitchen' | 'delivery' | 'waiter' }).role,
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export async function logoutPin(): Promise<void> {
  const supabase = createClient()
  await supabase.auth.signOut()
  sessionStorage.removeItem(SESSION_KEY)
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
