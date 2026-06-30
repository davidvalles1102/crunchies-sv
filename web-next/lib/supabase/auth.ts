import { createClient } from './client'

const STAFF_ROLES = ['admin', 'waiter', 'kitchen']

export async function getSession() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getProfile(userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

// Igual que getSession pero devuelve null si el usuario es staff,
// para que el personal no aparezca como cliente logueado en el customer side.
export async function getCustomerSession() {
  const session = await getSession()
  if (!session) return null
  const profile = await getProfile(session.user.id)
  if (profile && STAFF_ROLES.includes(profile.role)) return null
  return session
}
