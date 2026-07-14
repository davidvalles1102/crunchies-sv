import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { resolveRootTenantId } from '@/lib/tenant'
// import NavBar from '../components/NavBar'  // oculto en modo vitrina — restaurar cuando ORDERING_ENABLED = true
import OrderClient from './OrderClient'
import type { Category, OrderMenuItem, DeliveryZone } from '@/lib/types'

export const metadata: Metadata = { title: 'Menú — Crunchies' }
export const revalidate = 0

export default async function OrderPage() {
  const supabase = await createClient()
  const tenantId = await resolveRootTenantId(supabase)

  let categoriesQuery = supabase.from('categories').select('*').eq('active', true).order('display_order')
  let itemsQuery = supabase.from('menu_items').select('*, categories(name, icon)').eq('available', true)
  let zonesQuery = supabase.from('delivery_zones').select('*').eq('active', true).order('display_order')
  if (tenantId) {
    categoriesQuery = categoriesQuery.eq('tenant_id', tenantId)
    itemsQuery = itemsQuery.eq('tenant_id', tenantId)
    zonesQuery = zonesQuery.eq('tenant_id', tenantId)
  }

  let taxRate = 0
  if (tenantId) {
    const { data: settings } = await supabase.from('tenant_settings').select('tax_enabled, tax_rate')
      .eq('tenant_id', tenantId).maybeSingle<{ tax_enabled: boolean; tax_rate: number }>()
    taxRate = settings?.tax_enabled ? Number(settings.tax_rate) : 0
  }

  const [{ data: categories }, { data: items }, { data: zones }] = await Promise.all([categoriesQuery, itemsQuery, zonesQuery])

  return (
    <>
      {/* <NavBar /> */}
      <header style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'var(--clr-bg, #0a0a0a)' }}>
        <span style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '0.04em', color: 'var(--clr-amber, #f59e0b)', fontFamily: 'inherit' }}>CRUNCHIES</span>
      </header>

      <OrderClient
        categories={(categories ?? []) as Category[]}
        items={(items ?? []) as OrderMenuItem[]}
        zones={(zones ?? []) as DeliveryZone[]}
        taxRate={taxRate}
      />

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
