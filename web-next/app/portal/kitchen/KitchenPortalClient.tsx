'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { modifiersSummary } from '@/lib/modifiers'
import { fmt } from '@/lib/format'
import { getPinSession, logoutPin, type PinSession } from '@/lib/pin-auth'
import PinPad from '../PinPad'
import type { KitchenOrder } from '@/lib/types'

type Action = 'ready' | 'delivered' | 'back'

export default function KitchenPortalClient() {
  const supabase = createClient()
  const [session, setSession] = useState<PinSession | null>(null)
  const [inKitchen, setInKitchen] = useState<KitchenOrder[]>([])
  const [readyOrders, setReadyOrders] = useState<KitchenOrder[]>([])
  const [startTimes, setStartTimes] = useState<Record<string, number>>({})
  const [nowTick, setNowTick] = useState(Date.now())

  useEffect(() => {
    const s = getPinSession()
    if (s?.role === 'kitchen') setSession(s)
  }, [])

  useEffect(() => {
    if (!session) return undefined

    loadOrders()

    const channel = supabase
      .channel('kitchen-portal-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadOrders)
      .subscribe()

    const tick = setInterval(() => setNowTick(Date.now()), 30_000)

    return () => {
      channel.unsubscribe()
      clearInterval(tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  async function loadOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, restaurant_tables(number), order_items(*, order_item_modifiers(*))')
      .in('status', ['in_kitchen', 'ready'])
      .order('created_at')

    const all = (data || []) as KitchenOrder[]
    setStartTimes((prev) => {
      const next = { ...prev }
      let changed = false
      all.forEach((o) => {
        if (!(o.id in next)) { next[o.id] = new Date(o.updated_at || o.created_at).getTime(); changed = true }
      })
      return changed ? next : prev
    })
    setInKitchen(all.filter((o) => o.status === 'in_kitchen'))
    setReadyOrders(all.filter((o) => o.status === 'ready'))
  }

  async function handleAction(action: Action, order: KitchenOrder) {
    const statusMap: Record<Action, string> = { ready: 'ready', delivered: 'delivered', back: 'in_kitchen' }
    const updates: Record<string, unknown> = { status: statusMap[action], updated_at: new Date().toISOString() }
    if (['delivery', 'takeout'].includes(order.order_type)) {
      if (action === 'ready') updates.delivery_status = 'ready'
      if (action === 'back')  updates.delivery_status = 'preparing'
    }
    await supabase.from('orders').update(updates).eq('id', order.id)
    if (action === 'delivered') setStartTimes((prev) => { const n = { ...prev }; delete n[order.id]; return n })
    await loadOrders()
  }

  const elapsed = (id: string) => Math.floor((nowTick - (startTimes[id] ?? nowTick)) / 60000)

  async function handleLogout() {
    await logoutPin()
    setSession(null)
    setInKitchen([])
    setReadyOrders([])
  }

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
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>⏻ Salir</button>
        </div>
      </header>

      <div className="kitchen-layout" style={{ flex: 1 }}>
        <div className="kitchen-col">
          <div className="kitchen-col__header">
            <span className="badge badge-amber" style={{ fontSize: '.9rem', padding: '6px 14px' }}>🔥 EN PREPARACIÓN</span>
            <span className="badge badge-muted">{inKitchen.length}</span>
          </div>
          <div className="kitchen-orders">
            {inKitchen.length === 0
              ? <div className="kitchen-empty">Sin órdenes en preparación</div>
              : inKitchen.map((o) => <KCard key={o.id} order={o} elapsed={elapsed(o.id)} onAction={handleAction} />)}
          </div>
        </div>

        <div className="kitchen-col">
          <div className="kitchen-col__header">
            <span className="badge badge-green" style={{ fontSize: '.9rem', padding: '6px 14px' }}>✅ LISTO PARA SERVIR</span>
            <span className="badge badge-muted">{readyOrders.length}</span>
          </div>
          <div className="kitchen-orders">
            {readyOrders.length === 0
              ? <div className="kitchen-empty">Sin órdenes listas</div>
              : readyOrders.map((o) => <KCard key={o.id} order={o} elapsed={elapsed(o.id)} onAction={handleAction} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function KCard({ order, elapsed, onAction }: { order: KitchenOrder; elapsed: number; onAction: (a: Action, o: KitchenOrder) => void }) {
  const timerCls = elapsed < 10 ? 'timer--ok' : elapsed < 20 ? 'timer--warn' : 'timer--urgent'
  const cardCls  = order.status === 'ready' ? 'kitchen-card--ready' : elapsed >= 20 ? 'kitchen-card--urgent' : ''
  const isExt    = ['delivery', 'takeout'].includes(order.order_type)
  const label    = isExt
    ? `${order.order_type === 'delivery' ? '🛵' : '🥡'} ${order.delivery_name || 'Sin nombre'}`
    : `Mesa ${order.restaurant_tables?.number ?? '—'}`

  return (
    <div className={`kitchen-card ${cardCls}`}>
      <div className="kitchen-card__header">
        <div className="kitchen-card__table">{label}</div>
        <div className={`kitchen-card__timer ${timerCls}`}>⏱ {elapsed}m</div>
      </div>
      <div className="kitchen-card__items">
        {(order.order_items || []).map((i) => (
          <div key={i.id} className="kitchen-item">
            <span className="kitchen-item__qty">{i.quantity}</span>
            <div>
              <div>{i.item_name}</div>
              {i.order_item_modifiers?.length ? (
                <div className="kitchen-item__note">{modifiersSummary(i.order_item_modifiers.map((m) => ({ option_name: m.option_name, price_delta: m.price_delta })))}</div>
              ) : null}
              {i.notes ? <div className="kitchen-item__note">📝 {i.notes}</div> : null}
            </div>
          </div>
        ))}
        {order.notes ? <div className="kitchen-item" style={{ color: 'var(--amber)' }}>📋 {order.notes}</div> : null}
      </div>
      <div className="kitchen-card__actions">
        {order.status === 'in_kitchen' ? (
          <button className="btn btn-primary btn-sm btn-full" onClick={() => onAction('ready', order)}>✅ Marcar Listo</button>
        ) : isExt ? (
          <>
            <div className="text-xs text-muted" style={{ textAlign: 'center', padding: '6px 0' }}>✅ Listo — esperando repartidor</div>
            <button className="btn btn-ghost btn-sm btn-full" onClick={() => onAction('back', order)}>↩ Regresar a cocina</button>
          </>
        ) : (
          <>
            <button className="btn btn-outline btn-sm btn-full" onClick={() => onAction('delivered', order)}>🍽️ Entregado en mesa</button>
            <button className="btn btn-ghost btn-sm" onClick={() => onAction('back', order)}>↩</button>
          </>
        )}
      </div>
    </div>
  )
}
