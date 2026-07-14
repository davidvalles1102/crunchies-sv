'use client'

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
  { href: '/admin/expense-tracker',  label: '💸 Gastos' },
  { href: '/admin/finance',          label: '💰 Finanzas' },
  { href: '/admin/menu-management',  label: '🍽️ Menú' },
  { href: '/admin/reports',          label: '📈 Reportes' },
  { href: '/admin/customers',        label: '👥 Clientes' },
  { href: '/admin/tables',           label: '🪑 Mesas' },
  { href: '/admin/staff',            label: '🔐 Staff & Portales' },
]

const PLATFORM_LINK = { href: '/admin/platform', label: '🏢 Plataforma' }

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { session, profile, tenant } = useAdmin()

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  const closeSidebar = () => document.getElementById('sidebar')?.classList.remove('open')

  return (
    <>
      <aside className="sidebar" id="sidebar">
        <div className="sidebar__brand">CRUNCHIES</div>
        <div className="sidebar__tenant" style={{ padding: '0 20px 12px', color: 'var(--text-muted)', fontSize: '.76rem', lineHeight: 1.4 }}>
          <div style={{ textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Negocio activo</div>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{tenant.name}</div>
          <div style={{ marginTop: 2 }}>{tenant.slug}</div>
        </div>
        <nav className="sidebar__nav">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`slink${pathname === l.href ? ' active' : ''}`}
              onClick={closeSidebar}
            >
              {l.label}
            </Link>
          ))}
          {profile.role === 'admin' && (
            <Link
              href={PLATFORM_LINK.href}
              className={`slink${pathname === PLATFORM_LINK.href ? ' active' : ''}`}
              onClick={closeSidebar}
            >
              {PLATFORM_LINK.label}
            </Link>
          )}
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
