import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { resolveRootTenantId } from '@/lib/tenant'
import NavBar from './components/NavBar'
import MenuSection from './components/MenuSection'
import type { Category, MenuItem } from '@/lib/types'

export const metadata: Metadata = { title: 'Menú' }
export const revalidate = 0

export default async function HomePage() {
  const supabase = await createClient()
  const tenantId = await resolveRootTenantId(supabase)

  let categoriesQuery = supabase.from('categories').select('*').eq('active', true).order('display_order')
  let itemsQuery = supabase.from('menu_items').select('*, categories(name)').eq('available', true)
  if (tenantId) {
    categoriesQuery = categoriesQuery.eq('tenant_id', tenantId)
    itemsQuery = itemsQuery.eq('tenant_id', tenantId)
  }

  const [{ data: categories }, { data: items }] = await Promise.all([categoriesQuery, itemsQuery])

  return (
    <>
      <NavBar />

      <header className="hero">
        <div className="hero__bg-grid"></div>
        <div className="hero__content">
          <p className="hero__eyebrow neon-amber">Ave La Reyna, Entre PJE 7 Y 1de Mayo, San Salvador · Lun–Vie: 11AM–2:30PM &amp; 6–10:30PM · Sáb–Dom: 11AM–10:30PM</p>
          <h1 className="hero__title">
            <span className="neon-green">CRUNCHIES</span>
          </h1>
          <p className="hero__sub">
            Pollo, alas y sabores de rancho que no olvidarás.<br />
            Ordena en línea, reserva tu mesa o pide a domicilio.
          </p>
          <div className="hero__actions">
            <a href="#menu" className="btn btn-primary btn-lg">Ver Menú</a>
            {/* <Link href="/reservations" className="btn btn-outline btn-lg">Reservar Mesa</Link> */}
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
          <span>📍 Ave La Reyna, Entre PJE 7 Y 1de Mayo, San Salvador, El Salvador</span>
          <span>📞 +503 7311 8276</span>
          <span>🕐 Lun–Vie: 11:00 AM – 2:30 PM · 6:00 PM – 10:30 PM | Sáb–Dom: 11:00 AM – 10:30 PM</span>
        </div>
        <div className="footer-divider"></div>
        <p className="footer-copy">© 2026 Crunchies — Todos los derechos reservados</p>
      </footer>
    </>
  )
}
