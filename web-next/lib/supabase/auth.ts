import { createClient } from './client'
import { ROOT_TENANT, type ActiveTenant } from '../tenant'

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

// Resuelve el tenant activo del usuario via tenant_members. Si la migration
// multitenant todavia no corrio en este entorno (tabla ausente) o el usuario
// no tiene membership, cae al tenant raiz para no romper el single-tenant actual.
export async function getTenantForUser(userId: string): Promise<ActiveTenant> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tenant_members')
    .select('tenant_id, tenants(slug, name)')
    .eq('user_id', userId)
    .eq('active', true)
    .limit(1)
    .maybeSingle<{ tenant_id: string; tenants: { slug: string; name: string } | null }>()

  if (error || !data || !data.tenants) return ROOT_TENANT

  return { tenant_id: data.tenant_id, slug: data.tenants.slug, name: data.tenants.name }
}
