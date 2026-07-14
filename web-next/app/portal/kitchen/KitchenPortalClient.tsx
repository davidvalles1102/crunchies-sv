'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { modifiersSummary } from '@/lib/modifiers'
import { fmt } from '@/lib/format'
import { getPinSession, logoutPin, type PinSession } from '@/lib/pin-auth'
import PinPad from '../PinPad'
import type { KitchenOrder } from '@/lib/types'

export default function KitchenPortalClient() {
  const supabase = createClient()
  const [session, setSession] = useState<PinSession | null>(() => {
    const s = getPinSession()
    return s?.role === 'kitchen' ? s : null
  })
  const [inKitchen, setInKitchen] = useState<KitchenOrder[]>([])
  const [readyOrders, setReadyOrders] = useState<KitchenOrder[]>([])
  const [startTimes, setStartTimes] = useState<Record<string, number>>({})
  const [nowTick, setNowTick] = useState(() => Date.now())

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, restaurant_tables(number), order_items(*, order_item_modifiers(*))')
      .in('status', ['in_kitchen', 'ready'])
      .or('order_type.neq.delivery,delivery_status.in.(pending,preparing,ready)')
      .order('created_at', { ascending: true })

    const all = (data || []) as KitchenOrder[]
    setStartTimes((prev) => {
      const next = { ...prev }
      let changed = false
      all.forEach((o) => {
        if (!(o.id in next)) {
          next[o.id] = new Date(o.updated_at || o.created_at).getTime()
          changed = true
        }
      })
      return changed ? next : prev
    })
    setInKitchen(all.filter((o) => o.status === 'in_kitchen'))
    setReadyOrders(all.filter((o) => o.status === 'ready'))
  }, [supabase])

  const markReady = useCallback(async (order: KitchenOrder) => {
    const updates: Record<string, unknown> = { status: 'ready', updated_at: new Date().toISOString() }
    if (['delivery', 'takeout'].includes(order.order_type)) updates.delivery_status = 'ready'
    await supabase.from('orders').update(updates).eq('id', order.id)
    await loadOrders()
  }, [loadOrders, supabase])

  useEffect(() => {
    if (!session) return undefined

    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').upsert({ id: user.id, role: 'kitchen' }, { onConflict: 'id' })
      }
      if (alive) await loadOrders()
    })()

    const channel = supabase
      .channel('kitchen-portal-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, loadOrders)
      .subscribe()

    const tick = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => { alive = false; channel.unsubscribe(); clearInterval(tick) }
  }, [loadOrders, session, supabase])

  const elapsed = (id: string) => Math.floor((nowTick - (startTimes[id] ?? nowTick)) / 60000)

  if (!session) {
    return <PinPad portalName="Cocina" icon="👨‍🍳" expectedRole="kitchen" onSuccess={setSession} />
  }

  return (
    <div className="portal-body">
      <header className="portal-header">
        <div className="portal-header__left">
          <span className="portal-header__brand">CRUNCHIES — COCINA</span>
          <span className="portal-header__staff">👤 {session.full_name}</span>
        </div>
        <div className="portal-header__right">
          <span className="text-xs text-muted">{fmt.time(new Date().toISOString())}</span>
          <button className="btn btn-ghost btn-sm" onClick={async () => { await logoutPin(); setSession(null) }}>⏻ Salir</button>
        </div>
      </header>

      <div className="kitchen-layout">
        <div className="kitchen-col">
          <div className="kitchen-col__header">
            <span className="badge badge-amber" style={{ fontSize: '.88rem', padding: '5px 14px' }}>🔥 EN PREPARACIÓN</span>
            <span className="badge badge-muted">{inKitchen.length}</span>
          </div>
          <div className="kitchen-orders">
            {inKitchen.length === 0
              ? <div className="kitchen-empty">Sin órdenes pendientes</div>
              : inKitchen.map((o) => <KCard key={o.id} order={o} elapsed={elapsed(o.id)} onReady={markReady} />)}
          </div>
        </div>

        <div className="kitchen-col">
          <div className="kitchen-col__header">
            <span className="badge badge-green" style={{ fontSize: '.88rem', padding: '5px 14px' }}>✅ LISTO — ESPERANDO MESERO</span>
            <span className="badge badge-muted">{readyOrders.length}</span>
          </div>
          <div className="kitchen-orders">
            {readyOrders.length === 0
              ? <div className="kitchen-empty">Sin órdenes listas</div>
              : readyOrders.map((o) => <KCard key={o.id} order={o} elapsed={elapsed(o.id)} onReady={markReady} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function KCard({ order, elapsed, onReady }: {
  order: KitchenOrder
  elapsed: number
  onReady: (o: KitchenOrder) => void
}) {
  const timerCls = elapsed < 10 ? 'timer--ok' : elapsed < 20 ? 'timer--warn' : 'timer--urgent'
  const cardCls = order.status === 'ready' ? 'kitchen-card--ready' : elapsed >= 20 ? 'kitchen-card--urgent' : ''
  const isExt = ['delivery', 'takeout'].includes(order.order_type)
  const tableLabel = isExt
    ? (order.order_type === 'delivery' ? `🛵 ${order.delivery_name || 'Delivery'}` : '🥡 Para llevar')
    : `Mesa ${order.restaurant_tables?.number ?? '—'}`

  const items = order.order_items || []
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className={`kitchen-card ${cardCls}`}>
      <div className="kitchen-card__top">
        <div className="kitchen-card__table">{tableLabel}</div>
        <div className="kitchen-card__meta">
          <span className={`kitchen-card__timer ${timerCls}`}>⏱ {elapsed}m</span>
          <span className="kitchen-card__order-type">{itemCount} ítem{itemCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="kitchen-card__items">
        {items.length === 0 ? (
          <div className="kitchen-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '.85rem' }}>
            <span className="kitchen-item__qty" style={{ background: 'var(--bg-4)', color: 'var(--text-muted)' }}>?</span>
            <div className="kitchen-item__info">
              <span className="kitchen-item__name" style={{ fontWeight: 400 }}>Cargando ítems…</span>
            </div>
          </div>
        ) : items.map((i) => {
          const mods = (i.order_item_modifiers || []).map((m) => ({ option_name: m.option_name, price_delta: m.price_delta ?? 0 }))
          return (
            <div key={i.id} className="kitchen-item">
              <span className="kitchen-item__qty">{i.quantity}</span>
              <div className="kitchen-item__info">
                <span className="kitchen-item__name">{i.item_name}</span>
                {mods.length > 0 && <span className="kitchen-item__mod">· {modifiersSummary(mods)}</span>}
                {i.notes && <span className="kitchen-item__note">📝 {i.notes}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {order.notes && <div className="kitchen-card__note">📋 {order.notes}</div>}

      <div className="kitchen-card__actions">
        {order.status === 'in_kitchen' ? (
          <button className="btn btn-primary" onClick={() => onReady(order)}>✅ Marcar Listo</button>
        ) : (
          <div style={{ padding: '6px 0', color: 'var(--orange)', fontSize: '.85rem', fontWeight: 600, textAlign: 'center', flex: 1 }}>
            🍽️ Listo — el mesero confirma la entrega
          </div>
        )}
      </div>
    </div>
  )
}
