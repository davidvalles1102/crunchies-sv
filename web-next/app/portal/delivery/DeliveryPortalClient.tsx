'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { modifiersSummary } from '@/lib/modifiers'
import { getPinSession, logoutPin, logEvent, type PinSession } from '@/lib/pin-auth'
import { useLiveRefetch } from '@/lib/useLiveRefetch'
import { useWakeLock } from '@/lib/useWakeLock'
import PinPad from '../PinPad'

type DeliveryItem = { id: string; item_name: string; quantity: number; order_item_modifiers?: { option_name: string; price_delta: number }[] }
type Order = {
  id: string
  delivery_name: string | null
  delivery_phone: string | null
  delivery_address: string | null
  delivery_status: string | null
  pickup_staff_id: string | null
  payment_method: string
  subtotal: number
  delivery_fee: number
  total: number
  notes: string | null
  created_at: string
  order_items: DeliveryItem[]
  elapsedReady: number
}
type StaffDriver = { id: string; full_name: string; isBusy: boolean }

export default function DeliveryPortalClient() {
  const supabase = createClient()
  const [session, setSession] = useState<PinSession | null>(() => {
    const s = getPinSession()
    return s?.role === 'delivery' ? s : null
  })
  const [orders, setOrders] = useState<Order[]>([])
  const [staffDrivers, setStaffDrivers] = useState<StaffDriver[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
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
        subtotal: (o as { subtotal?: number }).subtotal ?? o.total,
        delivery_fee: (o as { delivery_fee?: number }).delivery_fee ?? 0,
        pickup_staff_id: (o as { pickup_staff_id?: string | null }).pickup_staff_id ?? null,
        elapsedReady: Math.floor((now - new Date(o.created_at).getTime()) / 60000),
      }))
    )
  }, [supabase])

  const loadStaffStatus = useCallback(async () => {
    const [{ data: staff }, { data: active }] = await Promise.all([
      supabase.from('staff_members').select('id, full_name').eq('role', 'delivery').eq('active', true),
      supabase.from('orders').select('pickup_staff_id').eq('delivery_status', 'on_the_way').not('pickup_staff_id', 'is', null),
    ])
    const busyIds = new Set(((active || []) as { pickup_staff_id: string }[]).map((o) => o.pickup_staff_id))
    setStaffDrivers(
      ((staff || []) as { id: string; full_name: string }[]).map((s) => ({
        id: s.id,
        full_name: s.full_name,
        isBusy: busyIds.has(s.id),
      }))
    )
  }, [supabase])

  const refresh = useCallback(async () => {
    await Promise.all([load(), loadStaffStatus()])
  }, [load, loadStaffStatus])

  const markReceived = useCallback(async (order: Order) => {
    if (order.pickup_staff_id && order.pickup_staff_id !== session?.staff_id) return
    setLoading(true)
    await supabase
      .from('orders')
      .update({
        delivery_status: 'on_the_way',
        status: 'delivered',
        pickup_staff_id: session?.staff_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
    if (session) logEvent(order.id, 'delivery_received', session.staff_id, { delivery_name: order.delivery_name })
    await refresh()
    setLoading(false)
  }, [refresh, session, supabase])

  const markDelivered = useCallback(async (order: Order) => {
    setLoading(true)
    await supabase
      .from('orders')
      .update({ delivery_status: 'delivered', status: 'delivered', updated_at: new Date().toISOString() })
      .eq('id', order.id)
    if (session) logEvent(order.id, 'delivery_delivered', session.staff_id, { delivery_name: order.delivery_name, total: order.total })
    await refresh()
    setLoading(false)
  }, [refresh, session, supabase])

  useEffect(() => {
    if (!session) return undefined
    let alive = true
    ;(async () => {
      await refresh()
      if (!alive) return
    })()

    const channel = supabase
      .channel('delivery-portal-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refresh)
      .subscribe()

    return () => { alive = false; channel.unsubscribe() }
  }, [refresh, session, supabase])

  useLiveRefetch(() => { if (session) refresh() }, { pollMs: 15000 })
  useWakeLock(!!session)

  if (!session) {
    return <PinPad portalName="Delivery" icon="🛵" expectedRole="delivery" onSuccess={setSession} />
  }

  const myOrders = orders.filter((o) => o.pickup_staff_id === session.staff_id)
  const available = orders.filter((o) => !o.pickup_staff_id)
  const othersOrders = orders.filter((o) => o.pickup_staff_id && o.pickup_staff_id !== session.staff_id)

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

      {staffDrivers.length > 1 && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {staffDrivers.map((d) => (
            <span
              key={d.id}
              style={{
                fontSize: '.75rem',
                padding: '3px 10px',
                borderRadius: 99,
                background: d.id === session.staff_id ? 'var(--orange-alpha)' : 'var(--bg-3)',
                border: `1px solid ${d.id === session.staff_id ? 'var(--orange)' : 'var(--border)'}`,
                color: d.isBusy ? 'var(--text-muted)' : 'var(--text)',
              }}
            >
              {d.id === session.staff_id ? '👤 ' : ''}{d.full_name} — {d.isBusy ? '🛵 En ruta' : '✅ Libre'}
            </span>
          ))}
        </div>
      )}

      <div className="delivery-portal-list">
        {orders.length === 0 ? (
          <div className="kitchen-empty" style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: '3rem' }}>🛵</div>
            <p className="text-muted text-sm mt-8">Sin pedidos listos por ahora</p>
          </div>
        ) : (
          <>
            {myOrders.length > 0 && (
              <div>
                <div style={{ padding: '8px 16px', fontSize: '.75rem', fontWeight: 700, color: 'var(--orange)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                  Mis pedidos
                </div>
                {myOrders.map((o) => <DeliveryCard key={o.id} order={o} session={session} loading={loading} onReceive={markReceived} onDeliver={markDelivered} />)}
              </div>
            )}

            {available.length > 0 && (
              <div>
                <div style={{ padding: '8px 16px', fontSize: '.75rem', fontWeight: 700, color: 'var(--amber)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                  Disponibles
                </div>
                {available.map((o) => <DeliveryCard key={o.id} order={o} session={session} loading={loading} onReceive={markReceived} onDeliver={markDelivered} />)}
              </div>
            )}

            {othersOrders.length > 0 && (
              <div>
                <div style={{ padding: '8px 16px', fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                  En ruta (otros)
                </div>
                {othersOrders.map((o) => <DeliveryCard key={o.id} order={o} session={session} loading={loading} onReceive={markReceived} onDeliver={markDelivered} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function DeliveryCard({ order, session, loading, onReceive, onDeliver }: {
  order: Order
  session: PinSession
  loading: boolean
  onReceive: (o: Order) => void
  onDeliver: (o: Order) => void
}) {
  const isOnTheWay = order.delivery_status === 'on_the_way'
  const isMine = order.pickup_staff_id === session.staff_id
  const isOthers = order.pickup_staff_id && !isMine
  const timerCls = order.elapsedReady < 20 ? 'timer--ok' : order.elapsedReady < 40 ? 'timer--warn' : 'timer--urgent'

  return (
    <div className={`delivery-portal-card${isOnTheWay && isMine ? ' delivery-portal-card--on-the-way' : ''}${isOthers ? ' delivery-portal-card--others' : ''}`}
      style={isOthers ? { opacity: .65 } : undefined}>
      <div className="delivery-portal-card__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isOnTheWay && isMine
            ? <span className="badge badge-amber">🛵 En camino — tú</span>
            : isOnTheWay
            ? <span className="badge badge-muted">🛵 Tomado por otro driver</span>
            : <span className="badge badge-green">✅ Listo para recoger</span>}
          <span className={`badge ${timerCls === 'timer--ok' ? 'badge-muted' : timerCls === 'timer--warn' ? 'badge-amber' : 'badge-danger'}`}>⏱ {order.elapsedReady}m</span>
        </div>
        <span className="text-xs text-muted">{fmt.time(order.created_at)}</span>
      </div>

      {order.delivery_address && <div className="delivery-portal-card__address">📍 {order.delivery_address}</div>}

      <div className="delivery-portal-card__customer">
        👤 {order.delivery_name || '—'} &nbsp;·&nbsp; 📞 {order.delivery_phone || '—'}
        <span style={{ marginLeft: 10, color: order.payment_method === 'nequi' ? 'var(--orange)' : 'var(--amber)' }}>
          {order.payment_method === 'nequi' ? '📱 Nequi' : '💵 Efectivo'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, fontSize: '.82rem', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
        <span className="text-muted">Platillos: <strong style={{ color: 'var(--text)' }}>{fmt.currency(order.subtotal)}</strong></span>
        {order.delivery_fee > 0 && <span className="text-muted">Delivery: <strong style={{ color: 'var(--amber)' }}>{fmt.currency(order.delivery_fee)}</strong></span>}
        <span className="text-muted">Total: <strong style={{ color: 'var(--orange)' }}>{fmt.currency(order.total)}</strong></span>
      </div>

      <div className="delivery-portal-card__items">
        {(order.order_items || []).map((i) => (
          <div key={i.id} style={{ fontSize: '.85rem', padding: '3px 0' }}>
            <span style={{ fontWeight: 600 }}>{i.quantity}×</span> {i.item_name}
            {i.order_item_modifiers?.length ? (
              <span className="text-muted text-xs"> ({modifiersSummary(i.order_item_modifiers.map((m) => ({ option_name: m.option_name, price_delta: m.price_delta })))})</span>
            ) : null}
          </div>
        ))}
        {order.notes && <div className="text-xs text-muted mt-8">📋 {order.notes}</div>}
      </div>

      <div className="delivery-portal-card__actions">
        {!isOnTheWay && !isOthers && (
          <button className="btn btn-primary btn-full" disabled={loading} onClick={() => onReceive(order)}>🛵 Recibí el pedido — en camino</button>
        )}
        {isOnTheWay && isMine && (
          <button className="btn btn-amber btn-full" disabled={loading} onClick={() => onDeliver(order)}>📦 Entregué al cliente</button>
        )}
        {isOthers && <div style={{ textAlign: 'center', fontSize: '.82rem', color: 'var(--text-muted)', padding: '6px 0' }}>Tomado por otro repartidor</div>}
      </div>
    </div>
  )
}
