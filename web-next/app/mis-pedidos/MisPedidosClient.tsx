'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCustomerSession, getProfile } from '@/lib/supabase/auth'
import { fmt } from '@/lib/format'
import type { RealtimeChannel } from '@supabase/supabase-js'

type OrderItem = { id: string; quantity: number; item_name: string }
type Driver = { full_name: string; phone: string }
type Order = {
  id: string
  order_type: 'delivery' | 'takeout'
  delivery_status: string | null
  total: number
  created_at: string
  order_items: OrderItem[]
  drivers: Driver | null
}

const STATUS_CFG: Record<string, { label: string; cls: string; icon: string; active: boolean }> = {
  pending:    { label: 'Pendiente',  cls: 'badge-amber', icon: '🕐', active: true },
  preparing:  { label: 'Preparando', cls: 'badge-info',  icon: '🔥', active: true },
  ready:      { label: 'Listo',      cls: 'badge-green', icon: '✅', active: true },
  on_the_way: { label: 'En Camino',  cls: 'badge-green', icon: '🛵', active: true },
  delivered:  { label: 'Entregado',  cls: 'badge-muted', icon: '📦', active: false },
}

function MiniStepper({ order }: { order: Order }) {
  const isDelivery = order.order_type === 'delivery'
  const steps = isDelivery
    ? ['pending', 'preparing', 'ready', 'on_the_way', 'delivered']
    : ['pending', 'preparing', 'ready']
  const currentIdx = steps.indexOf(order.delivery_status || 'pending')

  return (
    <div className="mini-stepper">
      {steps.map((key, i) => {
        const cfg = STATUS_CFG[key]
        const done = i < currentIdx
        const cur = i === currentIdx
        return (
          <div key={key} className={`mini-step${done ? ' done' : cur ? ' active' : ''}`}>
            <div className="mini-step__dot">{done ? '✓' : cfg.icon}</div>
            <div className="mini-step__label">{cfg.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function OrderCard({ order }: { order: Order }) {
  const ds = order.delivery_status || 'pending'
  const cfg = STATUS_CFG[ds] ?? STATUS_CFG.pending
  const isDelivery = order.order_type === 'delivery'
  const items = order.order_items || []
  const isActive = cfg.active !== false

  const itemsText = items.length
    ? items.slice(0, 3).map((i) => `${i.quantity}× ${i.item_name}`).join(' · ')
      + (items.length > 3 ? ` +${items.length - 3} más` : '')
    : 'Sin items'

  return (
    <div className={`mis-pedidos-card${isActive ? ' mis-pedidos-card--active' : ''}`}>
      <div className="mis-pedidos-card__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.1rem' }}>{isDelivery ? '🛵' : '🥡'}</span>
          <span style={{ fontWeight: 600 }}>{isDelivery ? 'Domicilio' : 'Para Llevar'}</span>
          <span className="text-muted text-xs">#{order.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <span className={`badge ${cfg.cls}`}>{cfg.icon} {cfg.label}</span>
      </div>

      <div className="mis-pedidos-card__items">{itemsText}</div>

      {isDelivery && isActive && order.drivers && (
        <div className="text-xs mt-8" style={{ color: 'var(--green)' }}>
          🛵 {order.drivers.full_name} — <a href={`tel:${order.drivers.phone}`} style={{ color: 'inherit' }}>{order.drivers.phone}</a>
        </div>
      )}

      <div className="mis-pedidos-card__footer">
        <span className="text-xs text-muted">{fmt.datetime(order.created_at)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="neon-amber" style={{ fontWeight: 700 }}>{fmt.currency(order.total)}</span>
          <Link href={`/track?id=${order.id}`} className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline'}`}>
            {isActive ? '📍 Seguir en vivo' : 'Ver detalle'}
          </Link>
        </div>
      </div>

      {isActive && (
        <div className="mis-pedidos-card__progress">
          <MiniStepper order={order} />
        </div>
      )}
    </div>
  )
}

export default function MisPedidosClient() {
  const supabase = createClient()
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'results' | 'empty'>('idle')
  const [orders, setOrders] = useState<Order[]>([])
  const [live, setLive] = useState(false)

  const currentPhoneRef = useRef('')
  const channelRef = useRef<RealtimeChannel | null>(null)
  const searchOrdersRef = useRef<(phone: string) => Promise<void>>(async () => {})

  const searchOrders = useCallback(async (searchPhone: string) => {
    setStatus('loading')
    currentPhoneRef.current = searchPhone

    const since = new Date()
    since.setDate(since.getDate() - 7)

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*), drivers(full_name, phone)')
      .eq('delivery_phone', searchPhone)
      .in('order_type', ['delivery', 'takeout'])
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(15)

    if (error || !data?.length) {
      setOrders([])
      setStatus('empty')
      return
    }

    setOrders(data as Order[])
    setStatus('results')

    channelRef.current?.unsubscribe()
    setLive(true)
    channelRef.current = supabase
      .channel('mis-pedidos-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        if (currentPhoneRef.current) searchOrdersRef.current(currentPhoneRef.current)
      })
      .subscribe()
  }, [supabase])

  useEffect(() => {
    searchOrdersRef.current = searchOrders
  }, [searchOrders])

  useEffect(() => {
    ;(async () => {
      const session = await getCustomerSession()
      if (!session) return
      const profile = await getProfile(session.user.id)
      if (profile?.phone) {
        setPhone(profile.phone)
        await searchOrders(profile.phone)
      }
    })()

    return () => {
      channelRef.current?.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone.trim()) return
    searchOrders(phone.trim())
  }

  const active = orders.filter((o) => STATUS_CFG[o.delivery_status ?? 'pending']?.active !== false)
  const finished = orders.filter((o) => STATUS_CFG[o.delivery_status ?? 'pending']?.active === false)

  return (
    <div className="mis-pedidos-layout">
      <div className="mis-pedidos-header">
        <div>
          <h2 className="mis-pedidos-title">📦 Mis Pedidos</h2>
          <p className="text-muted text-sm mt-4">Consulta el estado de tus órdenes de domicilio o para llevar</p>
        </div>
        <div className="track-live">
          <div className="track-live-dot" style={{ opacity: live ? 1 : 0.4 }}></div>
          <span>En vivo</span>
        </div>
      </div>

      <div className="card mis-pedidos-search-card">
        <form className="mis-pedidos-search-form" onSubmit={handleSubmit}>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <label className="form-label">Número de teléfono con el que hiciste el pedido</label>
            <input
              type="tel" className="form-control" placeholder="Ej. 312 828 2045" autoComplete="tel"
              value={phone} onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>🔍 Buscar</button>
        </form>
      </div>

      <div className="mis-pedidos-results">
        {status === 'idle' && (
          <div className="mis-pedidos-empty">
            <div style={{ fontSize: '2.5rem' }}>📱</div>
            <p className="text-muted text-sm mt-8">Ingresa tu número para ver tus pedidos</p>
          </div>
        )}

        {status === 'loading' && (
          <p className="text-muted text-sm" style={{ textAlign: 'center', padding: 32 }}>Buscando...</p>
        )}

        {status === 'empty' && (
          <div className="mis-pedidos-empty">
            <div style={{ fontSize: '2.5rem' }}>🔍</div>
            <p className="text-muted text-sm mt-8">No se encontraron pedidos con ese número en los últimos 7 días.</p>
            <Link href="/order" className="btn btn-primary mt-16">Hacer un Pedido</Link>
          </div>
        )}

        {status === 'results' && (
          <>
            {active.length > 0 && (
              <>
                <h4 className="mis-pedidos-section-title">Activos</h4>
                {active.map((o) => <OrderCard key={o.id} order={o} />)}
              </>
            )}
            {finished.length > 0 && (
              <>
                <h4 className="mis-pedidos-section-title mt-24">Entregados</h4>
                {finished.map((o) => <OrderCard key={o.id} order={o} />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
