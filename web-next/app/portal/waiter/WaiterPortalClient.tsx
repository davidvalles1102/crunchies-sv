'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt, calcTotals } from '@/lib/format'
import { getPinSession, logoutPin, type PinSession } from '@/lib/pin-auth'
import PinPad from '../PinPad'
import type { Category, OrderMenuItem, RestaurantTable } from '@/lib/types'

type ActiveOrder = {
  id: string
  table_id: string
  status: string
  subtotal: number
  tax: number
  total: number
}

type TicketLine = { id: string; name: string; price: number; qty: number }

export default function WaiterPortalClient() {
  const supabase = createClient()
  const [session, setSession] = useState<PinSession | null>(() => {
    const s = getPinSession()
    return s?.role === 'waiter' ? s : null
  })
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [menuItems, setMenuItems] = useState<OrderMenuItem[]>([])
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null)
  const [order, setOrder] = useState<ActiveOrder | null>(null)
  const [ticket, setTicket] = useState<TicketLine[]>([])
  const [view, setView] = useState<'tables' | 'order' | 'pay'>('tables')
  const [activeCat, setActiveCat] = useState('all')
  const [loading, setLoading] = useState(false)
  const [taxRate, setTaxRate] = useState(0)

  const loadBase = useCallback(async () => {
    const [{ data: tablesData }, { data: cats }, { data: items }] = await Promise.all([
      supabase.from('restaurant_tables').select('*').order('number'),
      supabase.from('categories').select('*').eq('active', true).order('display_order'),
      supabase.from('menu_items').select('*').eq('available', true).order('name'),
    ])
    setTables((tablesData as RestaurantTable[]) || [])
    setCategories((cats as Category[]) || [])
    setMenuItems((items as OrderMenuItem[]) || [])

    if (session?.tenant_id) {
      const { data: settings } = await supabase.from('tenant_settings').select('tax_enabled, tax_rate')
        .eq('tenant_id', session.tenant_id).maybeSingle<{ tax_enabled: boolean; tax_rate: number }>()
      setTaxRate(settings?.tax_enabled ? Number(settings.tax_rate) : 0)
    }
  }, [supabase, session])

  useEffect(() => {
    if (!session) return undefined
    const timer = setTimeout(() => { void loadBase() }, 0)
    return () => clearTimeout(timer)
  }, [loadBase, session])

  const selectTable = useCallback(async (table: RestaurantTable) => {
    setSelectedTable(table)
    const { data } = await supabase
      .from('orders')
      .select('id, table_id, status, subtotal, tax, total')
      .eq('table_id', table.id)
      .in('status', ['open', 'in_kitchen', 'ready'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setOrder((data as ActiveOrder | null) ?? null)
    setTicket([])
    setView('order')
  }, [supabase])

  const addItem = useCallback((item: OrderMenuItem) => {
    setTicket((prev) => {
      const ex = prev.find((i) => i.id === item.id)
      if (ex) return prev.map((i) => i.id === item.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { id: item.id, name: item.name, price: Number(item.price), qty: 1 }]
    })
  }, [])

  const sendToKitchen = useCallback(async () => {
    if (!selectedTable || ticket.length === 0) return
    setLoading(true)
    const subtotal = ticket.reduce((s, i) => s + i.price * i.qty, 0)
    const { tax, total } = calcTotals(subtotal, taxRate)

    let current = order
    if (!current) {
      const { data, error } = await supabase.from('orders').insert({
        table_id: selectedTable.id,
        order_type: 'dine_in',
        status: 'in_kitchen',
        subtotal,
        tax,
        total,
        tenant_id: session?.tenant_id ?? null,
      }).select('id, table_id, status, subtotal, tax, total').single()
      if (error || !data) { setLoading(false); return }
      current = data as ActiveOrder
      setOrder(current)
    } else {
      await supabase.from('orders').update({ status: 'in_kitchen', subtotal, tax, total }).eq('id', current.id)
    }

    await supabase.from('order_items').insert(ticket.map((i) => ({
      order_id: current.id,
      menu_item_id: i.id,
      item_name: i.name,
      item_price: i.price,
      quantity: i.qty,
      tenant_id: session?.tenant_id ?? null,
    })))

    setTicket([])
    setView('tables')
    setLoading(false)
  }, [order, selectedTable, session, supabase, ticket, taxRate])

  const markPaid = useCallback(async () => {
    if (!order) return
    setLoading(true)
    await supabase.from('orders').update({ status: 'paid' }).eq('id', order.id)
    setOrder(null)
    setSelectedTable(null)
    setTicket([])
    setView('tables')
    setLoading(false)
  }, [order, supabase])

  if (!session) {
    return <PinPad portalName="Mesero" icon="🪑" expectedRole="waiter" onSuccess={setSession} />
  }

  const filtered = menuItems.filter((i) => activeCat === 'all' || i.category_id === activeCat)
  const ticketSubtotal = ticket.reduce((s, i) => s + i.price * i.qty, 0)
  const { total } = calcTotals(ticketSubtotal, taxRate)

  return (
    <div className="portal-body">
      <header className="portal-header">
        <div className="portal-header__left">
          <span className="portal-header__brand">CRUNCHIES — MESERO</span>
          <span className="portal-header__staff">👤 {session.full_name}</span>
        </div>
        <div className="portal-header__right">
          <button className="btn btn-ghost btn-sm" onClick={async () => { await logoutPin(); setSession(null) }}>⏻ Salir</button>
        </div>
      </header>

      <div style={{ padding: 16 }}>
        {view === 'tables' && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
            {tables.map((t) => (
              <button key={t.id} className="btn btn-outline" onClick={() => void selectTable(t)}>
                Mesa {t.number}
              </button>
            ))}
          </div>
        )}

        {view === 'order' && selectedTable && (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '2fr 1fr' }}>
            <div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setView('tables')}>← Mesas</button>
                {categories.map((c) => (
                  <button key={c.id} className="btn btn-outline btn-sm" onClick={() => setActiveCat(c.id)}>{c.name}</button>
                ))}
              </div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
                {filtered.map((item) => (
                  <button key={item.id} className="btn btn-outline" onClick={() => addItem(item)}>
                    {item.name}<br />{fmt.currency(item.price)}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
              <h3>Mesa {selectedTable.number}</h3>
              {ticket.map((i) => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span>{i.qty}x {i.name}</span>
                  <strong>{fmt.currency(i.price * i.qty)}</strong>
                </div>
              ))}
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div>Total: {fmt.currency(total)}</div>
                <button className="btn btn-amber btn-full" disabled={loading || !ticket.length} onClick={() => void sendToKitchen()}>Enviar a cocina</button>
                <button className="btn btn-primary btn-full mt-8" disabled={loading || !order} onClick={() => void markPaid()}>Marcar pagado</button>
              </div>
            </div>
          </div>
        )}

        {view === 'pay' && (
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => setView('order')}>← Volver</button>
          </div>
        )}
      </div>
    </div>
  )
}
