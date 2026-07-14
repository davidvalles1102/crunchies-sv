'use client'

const ACTIVE_TENANT_KEY = 'crunchies_active_tenant'

export type ActiveTenant = {
  tenant_id: string
  slug: string
  name: string
}

export const ROOT_TENANT: ActiveTenant = {
  tenant_id: 'crunchies-root',
  slug: 'crunchies-root',
  name: 'Crunchies Mi Rancho',
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

