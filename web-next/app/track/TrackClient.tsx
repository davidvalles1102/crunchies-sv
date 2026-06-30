'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useToast } from '../components/ToastProvider'
import styles from './track.module.css'

type TrackOrder = {
  id: string
  order_type: 'delivery' | 'takeout'
  delivery_status: string | null
  payment_method: 'cash' | 'nequi'
  total: number
  driver_id: string | null
  order_items: { id: string; quantity: number; item_name: string; item_price: number }[]
  drivers: { full_name: string; phone: string } | null
}

const DELIVERY_STEPS = [
  { key: 'pending',     icon: '🕐', label: 'Recibido',    desc: 'Tu pedido fue registrado en el sistema' },
  { key: 'preparing',   icon: '🔥', label: 'Preparando',  desc: 'El equipo está cocinando tu pedido' },
  { key: 'ready',       icon: '✅', label: 'Listo',       desc: 'Tu pedido está listo' },
  { key: 'on_the_way',  icon: '🛵', label: 'En Camino',   desc: '¡El repartidor ya va hacia ti!' },
  { key: 'delivered',   icon: '📦', label: '¡Entregado!', desc: '¡Buen provecho! Gracias por tu pedido' },
]

const TAKEOUT_STEPS = [
  { key: 'pending',   icon: '🕐', label: 'Recibido',           desc: 'Tu pedido fue registrado en el sistema' },
  { key: 'preparing', icon: '🔥', label: 'Preparando',         desc: 'El equipo está cocinando tu pedido' },
  { key: 'ready',     icon: '✅', label: 'Listo para Recoger', desc: '¡Puedes venir a recoger tu pedido!' },
]

const STATUS_ORDER = ['pending', 'preparing', 'ready', 'on_the_way', 'delivered']

export default function TrackClient() {
  const supabase = createClient()
  const toast = useToast()
  const params = useSearchParams()
  const orderId = params.get('id')

  const [phase, setPhase] = useState<'loading' | 'notfound' | 'ready'>('loading')
  const [order, setOrder] = useState<TrackOrder | null>(null)
  const [fetchedDriver, setFetchedDriver] = useState<{ full_name: string; phone: string } | null>(null)

  const orderRef = useRef<TrackOrder | null>(null)
  useEffect(() => { orderRef.current = order }, [order])

  useEffect(() => {
    ;(async () => {
      if (!orderId) { setPhase('notfound'); return }

      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*), drivers(full_name, phone)')
        .eq('id', orderId)
        .single()

      if (error || !data) { setPhase('notfound'); return }

      setOrder(data as TrackOrder)
      setPhase('ready')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  useEffect(() => {
    if (!orderId) return

    const channel = supabase
      .channel(`track-order-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
        const updated = { ...orderRef.current, ...payload.new, drivers: null } as TrackOrder
        setOrder(updated)

        const steps = updated.order_type === 'delivery' ? DELIVERY_STEPS : TAKEOUT_STEPS
        const step = steps.find((s) => s.key === updated.delivery_status)
        if (step) toast(`${step.icon} ${step.label}`, 'success')
      })
      .subscribe()

    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  useEffect(() => {
    if (!order || order.order_type !== 'delivery' || !order.driver_id || order.drivers) return
    let cancelled = false
    supabase.from('drivers').select('full_name, phone').eq('id', order.driver_id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setFetchedDriver(data) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.order_type, order?.driver_id, order?.drivers])

  const driverInfo = order?.drivers ?? fetchedDriver

  if (phase === 'loading') return null

  if (phase === 'notfound' || !order) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <div style={{ fontSize: '3rem' }}>🔍</div>
        <h2 className="mt-16">Pedido no encontrado</h2>
        <p className="text-secondary mt-8">El enlace puede haber expirado o ser incorrecto.</p>
        <Link href="/order" className="btn btn-primary mt-24">Hacer un Pedido</Link>
      </div>
    )
  }

  const isDelivery = order.order_type === 'delivery'
  const steps = isDelivery ? DELIVERY_STEPS : TAKEOUT_STEPS
  const status = order.delivery_status || 'pending'
  const currentStep = steps.find((s) => s.key === status) ?? steps[0]
  const currentIdx = STATUS_ORDER.indexOf(status)
  const isNequi = order.payment_method === 'nequi'

  const bannerBorder = status === 'delivered' ? 'var(--green)' : status === 'on_the_way' ? 'var(--amber)' : 'var(--border-lit)'
  const bannerBg = status === 'delivered' ? 'rgba(0,220,130,.08)' : status === 'on_the_way' ? 'var(--amber-alpha)' : 'var(--bg-2)'

  return (
    <div>
      <div className={styles['track-header']}>
        <div>
          <p className="text-muted text-sm" style={{ marginBottom: 4 }}>Seguimiento de pedido</p>
          <h2 className={styles['track-order-id']}>Pedido <span className="neon-green">#{order.id.slice(0, 8).toUpperCase()}</span></h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className={styles['track-type-badge']}>{isDelivery ? '🛵 Domicilio' : '🥡 Para Llevar'}</span>
          <div className={styles['track-live']}>
            <div className={styles['track-live-dot']}></div>
            <span>En vivo</span>
          </div>
        </div>
      </div>

      <div className={styles['track-status-banner']} style={{ borderColor: bannerBorder, background: bannerBg }}>
        <span className={styles['track-status-icon']}>{currentStep.icon}</span>
        <div>
          <div className={styles['track-status-label']}>{currentStep.label}</div>
          <div className="text-muted text-sm">{currentStep.desc}</div>
        </div>
      </div>

      <div className={styles['track-stepper']}>
        {steps.map((step) => {
          const stepIdx = STATUS_ORDER.indexOf(step.key)
          const done = stepIdx < currentIdx
          const active = step.key === status
          return (
            <div key={step.key} className={`${styles['track-step']}${done ? ` ${styles.done}` : active ? ` ${styles.active}` : ''}`}>
              <div className={styles['track-step__circle']}>{done ? '✓' : step.icon}</div>
              <div className={styles['track-step__label']}>{step.label}</div>
            </div>
          )
        })}
      </div>

      {isDelivery && order.driver_id && driverInfo && (
        <div className="card" style={{ borderColor: 'var(--green-dim)' }}>
          <h4 className="mb-12">🛵 Tu Repartidor</h4>
          <div className="flex justify-between items-center">
            <span style={{ fontWeight: 600 }}>{driverInfo.full_name}</span>
            <a href={`tel:${driverInfo.phone}`} className="btn btn-outline btn-sm">📞 {driverInfo.phone}</a>
          </div>
        </div>
      )}

      <div className={styles['track-detail-grid']}>
        <div className="card">
          <h4 className="mb-12">Tu Pedido</h4>
          <div className="flex-col gap-6">
            {order.order_items.map((i) => (
              <div key={i.id} className="flex justify-between text-sm">
                <span>{i.quantity}× {i.item_name}</span>
                <span className="text-muted">{fmt.currency(i.item_price * i.quantity)}</span>
              </div>
            ))}
          </div>
          <div className={styles['track-total-row']}>
            <span className="text-muted">Total</span>
            <span className="neon-amber" style={{ fontSize: '1.1rem' }}>{fmt.currency(order.total)}</span>
          </div>
        </div>

        <div className="card">
          <h4 className="mb-12">Pago</h4>
          {isNequi ? (
            <div>
              <div style={{ color: 'var(--green)', fontWeight: 600, marginBottom: 6 }}>📱 Nequi</div>
              <div className={styles['track-nequi-number']}>312 828 2045</div>
              <p className="text-xs text-muted">Recuerda transferir {fmt.currency(order.total)} si aún no lo has hecho.</p>
            </div>
          ) : (
            <div>
              <div style={{ color: 'var(--amber)', fontWeight: 600, marginBottom: 6 }}>💵 Efectivo</div>
              <p className="text-sm text-muted">{isDelivery ? 'Pago al recibir tu pedido.' : 'Pago al recoger en el restaurante.'}</p>
            </div>
          )}
        </div>
      </div>

      <div className="text-center mt-24">
        <Link href="/order" className="btn btn-outline">Hacer otro pedido</Link>
      </div>
    </div>
  )
}
