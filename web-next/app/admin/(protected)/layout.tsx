'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, getProfile, getTenantForUser } from '@/lib/supabase/auth'
import { AdminContext, STAFF_ROLES, type AdminContextValue } from '../AdminContext'
import Sidebar from '../components/Sidebar'
import { setActiveTenant } from '@/lib/tenant'

export default function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ctx, setCtx] = useState<AdminContextValue | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    ;(async () => {
      const session = await getSession()
      if (!session) { router.replace('/admin/login'); return }

      const profile = await getProfile(session.user.id)
      if (!profile || !STAFF_ROLES.includes(profile.role)) {
        router.replace('/admin/login')
        setDenied(true)
        return
      }

      const tenant = await getTenantForUser(session.user.id)
      setActiveTenant(tenant)
      setCtx({ session, profile, tenant })
    })()
  }, [router])

  if (denied || !ctx) return null

  return (
    <AdminContext.Provider value={ctx}>
      <div className="admin-body">
        <Sidebar />
        <div className="admin-main">{children}</div>
      </div>
    </AdminContext.Provider>
  )
}
