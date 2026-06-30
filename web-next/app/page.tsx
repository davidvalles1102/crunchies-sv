import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import NavBar from './components/NavBar'
import MenuSection from './components/MenuSection'
import type { Category, MenuItem } from '@/lib/types'

export const metadata: Metadata = { title: 'Menú' }
export const revalidate = 0

export default async function HomePage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from('categories').select('*').eq('active', true).order('display_order'),
    supabase.from('menu_items').select('*, categories(name)').eq('available', true),
  ])

  return (
    <>
      <NavBar />

      <header className="hero">
        <div className="hero__bg-grid"></div>
        <div className="hero__content">
          <p className="hero__eyebrow neon-amber">Piamonte, Cauca · Lun–Dom 6:30–15:30 y 16:00–23:00</p>
          <h1 className="hero__title">
            <span className="neon-green">CRUNCHIES</span>
          </h1>
          <p className="hero__sub">
            Pollo, alas y sabores de rancho que no olvidarás.<br />
            Ordena en línea, reserva tu mesa o pide a domicilio.
          </p>
          <div className="hero__actions">
            <a href="#menu" className="btn btn-primary btn-lg">Ver Menú</a>
            <Link href="/reservations" className="btn btn-outline btn-lg">Reservar Mesa</Link>
          </div>
        </div>
        <div className="hero__neon-lines" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
      </header>

      <MenuSection
        categories={(categories ?? []) as Category[]}
        items={(items ?? []) as MenuItem[]}
      />

      <section className="promo-band">
        <div className="promo-band__inner">
          <p className="promo-title neon-amber">¡Gana puntos con cada visita!</p>
          <p className="text-secondary">Regístrate y acumula puntos de lealtad en cada orden. Canjéalos por platillos gratis.</p>
          <Link href="/auth?mode=register" className="btn btn-amber mt-16">Crear Cuenta</Link>
        </div>
      </section>

      <footer className="cust-footer">
        <div className="footer-brand">CRUNCHIES</div>
        <div className="footer-details">
          <span>📍 Piamonte, Cauca, Colombia</span>
          <span>📞 312 828 2045</span>
          <span>🕐 Lun–Dom: 6:30 am – 3:30 pm · 4:00 pm – 11:00 pm</span>
        </div>
        <div className="footer-divider"></div>
        <p className="footer-copy">© 2026 Crunchies — Todos los derechos reservados</p>
      </footer>
    </>
  )
}
