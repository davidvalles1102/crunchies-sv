import type { SupabaseClient } from '@supabase/supabase-js'

const ACTIVE_TENANT_KEY = 'crunchies_active_tenant'

export type ActiveTenant = {
  tenant_id: string
  slug: string
  name: string
}

export const ROOT_TENANT: ActiveTenant = {
  tenant_id: 'crunchies-root',
  slug: 'crunchies-root',
  name: 'CrunchiesSV',
}

export function getActiveTenant(): ActiveTenant {
  if (typeof window === 'undefined') return ROOT_TENANT
  try {
    const raw = sessionStorage.getItem(ACTIVE_TENANT_KEY) ?? localStorage.getItem(ACTIVE_TENANT_KEY)
    if (!raw) return ROOT_TENANT
    const parsed = JSON.parse(raw) as Partial<ActiveTenant>
    if (!parsed.tenant_id || !parsed.slug || !parsed.name) return ROOT_TENANT
    return {
      tenant_id: parsed.tenant_id,
      slug: parsed.slug,
      name: parsed.name,
    }
  } catch {
    return ROOT_TENANT
  }
}

export function setActiveTenant(tenant: ActiveTenant): void {
  if (typeof window === 'undefined') return
  const raw = JSON.stringify(tenant)
  sessionStorage.setItem(ACTIVE_TENANT_KEY, raw)
  localStorage.setItem(ACTIVE_TENANT_KEY, raw)
}

export function clearActiveTenant(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(ACTIVE_TENANT_KEY)
  localStorage.removeItem(ACTIVE_TENANT_KEY)
}

// ROOT_TENANT.tenant_id es el slug, no un uuid real — sirve como fallback de
// UI (nombre a mostrar) antes de que se resuelva el tenant real. NUNCA usarlo
// para filtrar `tenant_id` en una query (la columna es uuid). Usar esto:
export async function resolveRootTenantId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', ROOT_TENANT.slug)
    .maybeSingle<{ id: string }>()
  return data?.id ?? null
}

