'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getCustomerSession } from '@/lib/supabase/auth'

const LINKS = [
  { href: '/', label: 'Menú' },
  { href: '/order', label: '🛵 Ordenar' },
  { href: '/mis-pedidos', label: '📦 Mis Pedidos' },
  { href: '/reservations', label: 'Reservaciones' },
  { href: '/profile', label: 'Mi Perfil' },
]

export default function NavBar() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    getCustomerSession().then((session) => setLoggedIn(!!session))

    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const authHref  = loggedIn ? '/profile' : '/auth'
  const authLabel = loggedIn ? 'Mi Perfil' : 'Ingresar'

  return (
    <nav className={`cust-nav${scrolled ? ' scrolled' : ''}`}>
      <div className="cust-nav__inner">
        <Link href="/" className="cust-nav__brand">CRUNCHIES</Link>
        <div className="cust-nav__links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`nav-link${pathname === l.href ? ' active' : ''}`}
              aria-current={pathname === l.href ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
          <Link href={authHref} className="btn btn-primary btn-sm">{authLabel}</Link>
        </div>
        <button
          className="nav-toggle"
          aria-label="Menú"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span></span><span></span><span></span>
        </button>
      </div>
      <div className={`nav-mobile${mobileOpen ? ' open' : ''}`}>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
        <Link href={authHref}>{authLabel}</Link>
      </div>
    </nav>
  )
}
