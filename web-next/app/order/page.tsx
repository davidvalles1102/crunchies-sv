import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import NavBar from '../components/NavBar'
import OrderClient from './OrderClient'
import type { Category, OrderMenuItem, DeliveryZone } from '@/lib/types'

export const metadata: Metadata = { title: 'Ordenar' }
export const revalidate = 0

export default async function OrderPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: items }, { data: zones }] = await Promise.all([
    supabase.from('categories').select('*').eq('active', true).order('display_order'),
    supabase.from('menu_items').select('*, categories(name, icon)').eq('available', true),
    supabase.from('delivery_zones').select('*').eq('active', true).order('display_order'),
  ])

  return (
    <>
      <NavBar />

      <OrderClient
        categories={(categories ?? []) as Category[]}
        items={(items ?? []) as OrderMenuItem[]}
        zones={(zones ?? []) as DeliveryZone[]}
      />

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
