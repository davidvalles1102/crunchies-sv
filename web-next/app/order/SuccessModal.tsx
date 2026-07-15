'use client'

import Link from 'next/link'
import { fmt } from '@/lib/format'

type OrderInfo = {
  id: string
  delivery_name: string
  delivery_phone: string
  delivery_address: string | null
  order_type: string
  payment_method: string
}

export default function SuccessModal({
  order,
  total,
  pickupMin,
  onClose,
}: {
  order: OrderInfo
  total: number
  pickupMin: string
  onClose: () => void
}) {
  const isDelivery = order.order_type === 'delivery'
  const isCard = order.payment_method === 'card'

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 440, textAlign: 'center' }}>
        <div className="modal-body" style={{ padding: '40px 32px' }}>
          <div style={{ fontSize: '3.5rem' }}>🎉</div>
          <h2 className="neon-green mt-16">{isDelivery ? '¡Pedido enviado!' : '¡Pedido registrado!'}</h2>
          <p className="text-secondary mt-8">
            {isDelivery
              ? 'Tu pedido está siendo preparado. El repartidor saldrá pronto.'
              : `Tu pedido estará listo para recoger en aproximadamente ${pickupMin} minutos.`}
          </p>

          <div className="card mt-24" style={{ textAlign: 'left', borderColor: 'var(--orange-dim)' }}>
            <div className="flex-col gap-8 text-sm">
              <div className="flex justify-between"><span className="text-muted">Nombre</span><span style={{ fontWeight: 600 }}>{order.delivery_name}</span></div>
              <div className="flex justify-between"><span className="text-muted">Teléfono</span><span>{order.delivery_phone}</span></div>
              {isDelivery && (
                <div className="flex justify-between"><span className="text-muted">Dirección</span><span style={{ textAlign: 'right', maxWidth: 200 }}>{order.delivery_address}</span></div>
              )}
              <div className="flex justify-between" style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <span className="text-muted">Total</span>
                <span className="neon-amber" style={{ fontWeight: 700, fontSize: '1.1rem' }}>{fmt.currency(total)}</span>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', marginTop: 4 }}>
                {isCard ? '💳 Pago con tarjeta' : '💵 Pago en efectivo'} {isDelivery ? 'al recibir' : 'al recoger'}
              </div>
            </div>
          </div>

          <Link href={`/track?id=${order.id}`} className="btn btn-outline btn-full mt-16">📍 Seguir mi Pedido en tiempo real</Link>
          <Link href="/" className="btn btn-primary btn-full btn-lg mt-8" onClick={onClose}>Volver al Menú</Link>
        </div>
      </div>
    </div>
  )
}
