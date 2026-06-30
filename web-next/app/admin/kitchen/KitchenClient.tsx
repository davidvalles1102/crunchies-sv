'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getSession } from '@/lib/supabase/auth'
import { modifiersSummary } from '@/lib/modifiers'
import { fmt } from '@/lib/format'
import type { KitchenOrder } from '@/lib/types'
import { useToast } from '../../components/ToastProvider'
import LiveClock from '../components/LiveClock'

type Action = 'ready' | 'delivered' | 'back'

export default function KitchenClient() {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()

  const [ready, setReady] = useState(false)
  const [inKitchen, setInKitchen] = useState<KitchenOrder[]>([])
  const [readyOrders, setReadyOrders] = useState<KitchenOrder[]>([])
  const [history, setHistory] = useState<KitchenOrder[]>([])
  const [historyCollapsed, setHistoryCollapsed] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [startTimes, setStartTimes] = useState<Record<string, number>>({})
  const [nowTick, setNowTick] = useState(0)

  // Kitchen display — no role gate, but requires authenticated staff
  useEffect(() => {
    ;(async () => {
      const session = await getSession()
      if (!session) { router.replace('/admin/login'); return }
      setReady(true)
    })()
  }, [router])

  async function loadOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select('*, restaurant_tables(number), order_items(*, order_item_modifiers(*))')
      .in('status', ['in_kitchen', 'ready'])
      .order('created_at')

    if (error) { toast('Error al cargar pedidos: ' + error.message, 'error'); return }

    const all = (data || []) as KitchenOrder[]

    setStartTimes((prev) => {
      let changed = false
      const next = { ...prev }
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
  }

  async function loadHistory() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('orders')
      .select('*, restaurant_tables(number), order_items(*, order_item_modifiers(*))')
      .eq('status', 'delivered')
      .gte('updated_at', `${today}T00:00:00`)
      .order('updated_at', { ascending: false })
      .limit(25)

    setHistory((data || []) as KitchenOrder[])
  }

  async function handleAction(action: Action, order: KitchenOrder) {
    const statusMap: Record<Action, string> = { ready: 'ready', delivered: 'delivered', back: 'in_kitchen' }
    const updates: Record<string, unknown> = { status: statusMap[action], updated_at: new Date().toISOString() }

    if (['delivery', 'takeout'].includes(order.order_type)) {
      if (action === 'ready') updates.delivery_status = 'ready'
      if (action === 'back') updates.delivery_status = 'preparing'
    }

    const { error } = await supabase.from('orders').update(updates).eq('id', order.id)

    if (error) { toast('Error al actualizar', 'error'); return }
    if (action === 'delivered') {
      setStartTimes((prev) => {
        const next = { ...prev }
        delete next[order.id]
        return next
      })
      await loadHistory()
    }
    await loadOrders()
  }

  useEffect(() => {
    if (!ready) return undefined

    ;(async () => {
      await loadOrders()
      await loadHistory()
    })()

    const channel = supabase
      .channel('kitchen-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadOrders()
        loadHistory()
      })
      .subscribe()

    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  useEffect(() => {
    if (!ready) return undefined
    ;(async () => {
      setNowTick(Date.now())
    })()
    const id = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [ready])

  if (!ready) return null

  const elapsedMinutes = (orderId: string) => {
    const start = startTimes[orderId]
    if (!start) return 0
    return Math.floor((nowTick - start) / 60000)
  }

  const toggleRow = (orderId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  return (
    <div className="admin-body kitchen-body">
      <header className="kitchen-topbar">
        <div className="kitchen-brand">CRUNCHIES — COCINA</div>
        <div className="kitchen-topbar__right">
          <LiveClock />
          <Link href="/admin/dashboard" className="btn btn-ghost btn-sm">← Panel</Link>
        </div>
      </header>

      <div className="kitchen-layout">
        <div className="kitchen-col">
          <div className="kitchen-col__header">
            <span className="badge badge-amber" style={{ fontSize: '.9rem', padding: '6px 14px' }}>🔥 EN PREPARACIÓN</span>
            <span className="badge badge-muted">{inKitchen.length}</span>
          </div>
          <div className="kitchen-orders">
            {inKitchen.length === 0
              ? <div className="kitchen-empty">Sin órdenes en preparación</div>
              : inKitchen.map((o) => (
                <KitchenCard key={o.id} order={o} elapsed={elapsedMinutes(o.id)} onAction={handleAction} />
              ))}
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
              : readyOrders.map((o) => (
                <KitchenCard key={o.id} order={o} elapsed={elapsedMinutes(o.id)} onAction={handleAction} />
              ))}
          </div>
        </div>
      </div>

      <div className="kitchen-history">
        <div className="kitchen-history__header" onClick={() => setHistoryCollapsed((c) => !c)}>
          <span className="kitchen-history__title">📋 Historial de hoy</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge badge-muted">{history.length}</span>
            <button className="btn btn-ghost btn-sm" style={{ pointerEvents: 'none' }}>{historyCollapsed ? '▼' : '▲'}</button>
          </div>
        </div>
        <div className={`kitchen-history__body${historyCollapsed ? ' collapsed' : ''}`}>
          {history.length === 0
            ? <div className="kitchen-empty" style={{ padding: 20 }}>Sin órdenes entregadas hoy</div>
            : history.map((o) => {
              const isExternal = ['delivery', 'takeout'].includes(o.order_type)
              const label = isExternal
                ? `${o.order_type === 'delivery' ? '🛵' : '🥡'} ${o.delivery_name || 'Sin nombre'}`
                : `🍽️ Mesa ${o.restaurant_tables?.number ?? '—'}`
              const items = o.order_items || []
              const itemsText = items.map((i) => `${i.quantity}× ${i.item_name}`).join(', ')
              const totalQty = items.reduce((s, i) => s + i.quantity, 0)
              const open = expandedRows.has(o.id)

              return (
                <div key={o.id} className={`history-row${open ? ' open' : ''}`} onClick={() => toggleRow(o.id)}>
                  <div className="history-row__summary">
                    <div className="history-row__label">{label}</div>
                    <div className="history-row__items">{itemsText || '—'}</div>
                    <span className="history-row__count">{totalQty} items</span>
                    <div className="history-row__time">{fmt.time(o.updated_at)}</div>
                    <span className="history-row__chevron">▼</span>
                  </div>
                  <div className={`history-row__detail${open ? ' open' : ''}`}>
                    <div className="history-detail-grid">
                      {items.map((i) => (
                        <div key={i.id} className="history-detail-item">
                          <span className="history-detail-item__qty">{i.quantity}×</span>
                          <span>
                            {i.item_name}
                            {i.order_item_modifiers?.length ? (
                              <span className="text-muted text-xs"> ({modifiersSummary(i.order_item_modifiers.map((m) => ({ option_name: m.option_name, price_delta: m.price_delta })))})</span>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                    {o.notes ? <div className="history-detail-note">📋 {o.notes}</div> : null}
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}

function KitchenCard({ order, elapsed, onAction }: { order: KitchenOrder; elapsed: number; onAction: (action: Action, order: KitchenOrder) => void }) {
  const timerCls = elapsed < 10 ? 'timer--ok' : elapsed < 20 ? 'timer--warn' : 'timer--urgent'
  const cardCls = order.status === 'ready' ? 'kitchen-card--ready' : (elapsed >= 20 ? 'kitchen-card--urgent' : '')
  const items = order.order_items || []
  const isExternal = ['delivery', 'takeout'].includes(order.order_type)

  const headerLabel = isExternal
    ? `${order.order_type === 'delivery' ? '🛵' : '🥡'} ${order.delivery_name || 'Sin nombre'}`
    : `Mesa ${order.restaurant_tables?.number ?? '—'}`

  return (
    <div className={`kitchen-card ${cardCls}`}>
      <div className="kitchen-card__header">
        <div className="kitchen-card__table">{headerLabel}</div>
        <div className={`kitchen-card__timer ${timerCls}`}>⏱ {elapsed}m</div>
      </div>
      <div className="kitchen-card__items">
        {items.map((i) => (
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
        ) : isExternal ? (
          <>
            <div className="text-xs text-muted" style={{ textAlign: 'center', padding: '6px 0' }}>✅ Listo — esperando al repartidor</div>
            <button className="btn btn-ghost btn-sm btn-full" onClick={() => onAction('back', order)}>↩ Regresar a cocina</button>
          </>
        ) : (
          <>
            <button className="btn btn-outline btn-sm btn-full" onClick={() => onAction('delivered', order)}>🍽️ Entregado en mesa</button>
            <button className="btn btn-ghost btn-sm" title="Regresar a cocina" onClick={() => onAction('back', order)}>↩</button>
          </>
        )}
      </div>
    </div>
  )
}
