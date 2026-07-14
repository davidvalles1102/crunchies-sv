'use client'

import { createContext, useContext, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'
import type { ActiveTenant } from '@/lib/tenant'

export type AdminContextValue = {
  session: Session
  profile: Profile
  tenant: ActiveTenant
}

export const AdminContext = createContext<AdminContextValue | null>(null)

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used within the admin layout')
  return ctx
}

export const STAFF_ROLES = ['admin', 'waiter', 'kitchen']

// Para páginas con un requisito de rol más estricto que el del shell
// (ej. solo 'admin' en vez de admin/waiter/kitchen). Redirige a login si no califica.
export function useRequireRole(allowedRoles: string[]) {
  const { profile } = useAdmin()
  const router = useRouter()

  useEffect(() => {
    if (!allowedRoles.includes(profile.role)) router.replace('/admin/login')
  }, [profile.role, allowedRoles, router])

  return allowedRoles.includes(profile.role)
}
