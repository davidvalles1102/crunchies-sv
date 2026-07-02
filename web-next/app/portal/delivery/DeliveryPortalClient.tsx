'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { modifiersSummary } from '@/lib/modifiers'
import { getPinSession, logoutPin, logEvent, type PinSession } from '@/lib/pin-auth'
import PinPad from '../PinPad'

type DeliveryItem = { id: string; item_name: string; quantity: number; order_item_modifiers?: { option_name: string; price_delta: number }[] }
type Order = {
  id: string
  delivery_name: string | null
  delivery_phone: string | null
  delivery_address: string | null
  delivery_status: string | null
  payment_method: string
  total: number
  notes: string | null
  created_at: string
  order_items: DeliveryItem[]
  elapsedReady: number
}

export default function DeliveryPortalClient() {
  const supabase = createClient()
  const [session, setSession] = useState<PinSession | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const s = getPinSession()
    if (s?.role === 'delivery') setSession(s)
  }, [])

  useEffect(() => {
    if (!session) return undefined

    // Upsert PRIMERO — 'waiter' está en orders_staff/order_items_staff, 'delivery' no
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').upsert({ id: user.id, role: 'waiter' }, { onConflict: 'id' })
      }
      await load()
    }
    init()

    const channel = supabase
      .channel('delivery-portal-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()

    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  async function load() {
    const now = Date.now()
    const today = new Date(now).toISOString().split('T')[0]
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, order_item_modifiers(*))')
      .eq('order_type', 'delivery')
      .in('delivery_status', ['ready', 'on_the_way'])
      .gte('created_at', `${today}T00:00:00`)
      .order('created_at')

    setOrders(
      ((data || []) as Omit<Order, 'elapsedReady'>[]).map((o) => ({
        ...o,
        elapsedReady: Math.floor((now - new Date(o.created_at).getTime()) / 60000),
      }))
    )
  }

  async function markReceived(order: Order) {
    setLoading(true)
    await supabase
      .from('orders')
      .update({ delivery_status: 'on_the_way', updated_at: new Date().toISOString() })
      .eq('id', order.id)
    logEvent(order.id, 'delivery_received', session!.staff_id, { delivery_name: order.delivery_name })
    await load()
    setLoading(false)
  }

  async function markDelivered(order: Order) {
    setLoading(true)
    await supabase
      .from('orders')
      .update({ delivery_status: 'delivered', status: 'delivered', updated_at: new Date().toISOString() })
      .eq('id', order.id)
    logEvent(order.id, 'delivery_delivered', session!.staff_id, { delivery_name: order.delivery_name, total: order.total })
    await load()
    setLoading(false)
  }

  if (!session) {
    return <PinPad portalName="Delivery" icon="🛵" expectedRole="delivery" onSuccess={setSession} />
  }

  return (
    <div className="portal-body">
      <header className="portal-header">
        <div className="portal-header__left">
          <span className="portal-header__brand">CRUNCHIES — DELIVERY</span>
          <span className="portal-header__staff">👤 {session.full_name}</span>
        </div>
        <div className="portal-header__right">
          <span className="badge badge-muted text-xs">{orders.length} activos</span>
          <button className="btn btn-ghost btn-sm" onClick={async () => { await logoutPin(); setSession(null) }}>⏻ Salir</button>
        </div>
      </header>

      <div className="delivery-portal-list">
        {orders.length === 0 ? (
          <div className="kitchen-empty" style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: '3rem' }}>🛵</div>
            <p className="text-muted text-sm mt-8">Sin pedidos listos por ahora</p>
          </div>
        ) : (
          orders.map((o) => {
            const isOnTheWay = o.delivery_status === 'on_the_way'
            const timerCls = o.elapsedReady < 20 ? 'timer--ok' : o.elapsedReady < 40 ? 'timer--warn' : 'timer--urgent'
            return (
              <div key={o.id} className={`delivery-portal-card${isOnTheWay ? ' delivery-portal-card--on-the-way' : ''}`}>
                <div className="delivery-portal-card__header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isOnTheWay
                      ? <span className="badge badge-amber">🛵 En camino</span>
                      : <span className="badge badge-green">✅ Listo para recoger</span>}
                    <span className={`badge ${timerCls === 'timer--ok' ? 'badge-muted' : timerCls === 'timer--warn' ? 'badge-amber' : 'badge-danger'}`}>⏱ {o.elapsedReady}m</span>
                  </div>
                  <span className="text-xs text-muted">{fmt.time(o.created_at)}</span>
                </div>

                {o.delivery_address && (
                  <div className="delivery-portal-card__address">📍 {o.delivery_address}</div>
                )}

                <div className="delivery-portal-card__customer">
                  👤 {o.delivery_name || '—'} &nbsp;·&nbsp; 📞 {o.delivery_phone || '—'}
                  <span style={{ marginLeft: 10, color: o.payment_method === 'nequi' ? 'var(--orange)' : 'var(--amber)' }}>
                    {o.payment_method === 'nequi' ? '📱 Nequi' : `💵 Efectivo · ${fmt.currency(o.total)}`}
                  </span>
                </div>

                <div className="delivery-portal-card__items">
                  {(o.order_items || []).map((i) => (
                    <div key={i.id} style={{ fontSize: '.85rem', padding: '3px 0' }}>
                      <span style={{ fontWeight: 600 }}>{i.quantity}×</span> {i.item_name}
                      {i.order_item_modifiers?.length ? (
                        <span className="text-muted text-xs"> ({modifiersSummary(i.order_item_modifiers.map((m) => ({ option_name: m.option_name, price_delta: m.price_delta })))})</span>
                      ) : null}
                    </div>
                  ))}
                  {o.notes && <div className="text-xs text-muted mt-8">📋 {o.notes}</div>}
                </div>

                <div className="delivery-portal-card__actions">
                  {!isOnTheWay ? (
                    <button
                      className="btn btn-primary btn-full"
                      disabled={loading}
                      onClick={() => markReceived(o)}
                    >
                      🛵 Recibí el pedido — en camino
                    </button>
                  ) : (
                    <button
                      className="btn btn-amber btn-full"
                      disabled={loading}
                      onClick={() => markDelivered(o)}
                    >
                      📦 Entregué al cliente
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
