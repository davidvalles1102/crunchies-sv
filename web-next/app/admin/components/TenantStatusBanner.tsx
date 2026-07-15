'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAdmin } from '../AdminContext'

type Sub = { status: string; trial_ends_at: string | null }

export default function TenantStatusBanner() {
  const { tenant } = useAdmin()
  const supabase = createClient()
  const [status, setStatus] = useState<string | null>(null)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      ;(async () => {
        const [{ data: t }, { data: sub }] = await Promise.all([
          supabase.from('tenants').select('status').eq('id', tenant.tenant_id).maybeSingle<{ status: string }>(),
          supabase.from('tenant_plan_subscriptions').select('status, trial_ends_at')
            .eq('tenant_id', tenant.tenant_id).order('created_at', { ascending: false }).limit(1).maybeSingle<Sub>(),
        ])
        setStatus(t?.status ?? null)
        setDaysLeft(sub?.trial_ends_at ? Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000) : null)
      })()
    }, 0)
    return () => clearTimeout(timer)
  }, [supabase, tenant.tenant_id])

  if (status === 'suspended') {
    return (
      <div className="admin-banner admin-banner--danger">
        🚫 Esta cuenta está suspendida — no se pueden crear ni modificar órdenes, pagos ni inventario. Contacta a soporte para reactivarla.
      </div>
    )
  }

  if (status === 'trial' && daysLeft !== null) {
    if (daysLeft <= 0) {
      return <div className="admin-banner admin-banner--danger">⏰ Tu periodo de prueba terminó. Contacta a soporte para activar tu plan.</div>
    }
    return <div className="admin-banner admin-banner--warning">🕐 Periodo de prueba: {daysLeft} día{daysLeft === 1 ? '' : 's'} restante{daysLeft === 1 ? '' : 's'}.</div>
  }

  return null
}
