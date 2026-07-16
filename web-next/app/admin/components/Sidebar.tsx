'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAdmin } from '../AdminContext'

const LINKS = [
  { href: '/admin/dashboard',        label: '📊 Dashboard' },
  { href: '/admin/orders',           label: '🧾 Órdenes' },
  { href: '/admin/kitchen',          label: '👨‍🍳 Cocina' },
  { href: '/admin/reservations',     label: '📅 Reservaciones' },
  { href: '/admin/delivery',         label: '🛵 Delivery' },
  { href: '/admin/payments',         label: '💳 Pagos' },
  { href: '/admin/cash',             label: '💵 Caja' },
  { href: '/admin/inventory',        label: '📦 Inventario' },
  { href: '/admin/credit',           label: '🧾 Fiado' },
  { href: '/admin/expense-tracker',  label: '💸 Gastos' },
  { href: '/admin/finance',          label: '💰 Finanzas' },
  { href: '/admin/menu-management',  label: '🍽️ Menú' },
  { href: '/admin/reports',          label: '📈 Reportes' },
  { href: '/admin/fiscal-export',    label: '📤 Exportar contable' },
  { href: '/admin/customers',        label: '👥 Clientes' },
  { href: '/admin/tables',           label: '🪑 Mesas' },
  { href: '/admin/staff',            label: '🔐 Staff & Portales' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { session, profile, tenant } = useAdmin()
  const [creditEnabled, setCreditEnabled] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('tenant_settings').select('credit_enabled')
        .eq('tenant_id', tenant.tenant_id).maybeSingle<{ credit_enabled: boolean }>()
      setCreditEnabled(!!data?.credit_enabled)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.tenant_id])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  const closeSidebar = () => document.getElementById('sidebar')?.classList.remove('open')

  const links = LINKS.filter((l) => l.href !== '/admin/credit' || creditEnabled)

  return (
    <>
      <aside className="sidebar" id="sidebar">
        <div className="sidebar__brand">CRUNCHIES</div>
        <div className="sidebar__tenant" style={{ padding: '0 20px 12px', color: 'var(--text-muted)', fontSize: '.76rem', lineHeight: 1.4 }}>
          <div style={{ textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Negocio activo</div>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{tenant.name}</div>
        </div>
        <nav className="sidebar__nav">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`slink${pathname === l.href ? ' active' : ''}`}
              onClick={closeSidebar}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="sidebar__user">{profile.full_name || session.user.email} · {profile.role}</div>
          <button className="slink slink--danger" onClick={logout}>⏻ Salir</button>
        </div>
      </aside>
      <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden="true" />
    </>
  )
}
