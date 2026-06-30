'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCustomerSession, getProfile } from '@/lib/supabase/auth'
import { fmt, calcTotals } from '@/lib/format'
import { getItemModifierGroups, modifiersExtraPrice, modifiersSummary, buildLineKey } from '@/lib/modifiers'
import type { Selection } from '@/lib/modifiers'
import type { Category, OrderMenuItem, ModifierGroup, DeliveryZone } from '@/lib/types'
import { useToast } from '../components/ToastProvider'
import ModifierModal from './ModifierModal'
import SuccessModal from './SuccessModal'
import './order.css'

type CartLine = {
  id: string
  name: string
  price: number
  modifiers: Selection[]
  lineKey: string
  qty: number
}

export default function OrderClient({
  categories,
  items,
  zones,
}: {
  categories: Category[]
  items: OrderMenuItem[]
  zones: DeliveryZone[]
}) {
  const supabase = createClient()
  const toast = useToast()

  const [customerId, setCustomerId] = useState<string | null>(null)
  const [activeCat, setActiveCat] = useState('all')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [orderType, setOrderType] = useState<'takeout' | 'delivery'>('takeout')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'nequi'>('cash')
  const [selectedZoneId, setSelectedZoneId] = useState('')

  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [custAddress, setCustAddress] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [pickupTime, setPickupTime] = useState('30')

  const [modalState, setModalState] = useState<{ item: { id: string; name: string; price: number }; groups: ModifierGroup[] } | null>(null)
  const [successOrder, setSuccessOrder] = useState<{ id: string; delivery_name: string; delivery_phone: string; delivery_address: string | null; order_type: string; payment_method: string } | null>(null)
  const [successTotal, setSuccessTotal] = useState(0)

  const [placing, setPlacing] = useState(false)
  const [orderMsg, setOrderMsg] = useState<{ text: string; type: 'error' } | null>(null)

  useEffect(() => {
    getCustomerSession().then(async (session) => {
      if (!session) return
      const profile = await getProfile(session.user.id)
      setCustomerId(profile?.id ?? null)
      if (profile?.full_name) setCustName(profile.full_name)
      if (profile?.phone) setCustPhone(profile.phone)
    })
  }, [])

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || null
  const deliveryFee = orderType === 'delivery' ? (selectedZone?.fee ?? 0) : 0

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter((i) =>
      (activeCat === 'all' || i.category_id === activeCat) &&
      (i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
    )
  }, [items, activeCat, search])

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const { tax, total } = calcTotals(subtotal)
  const grandTotal = total + deliveryFee

  const addToCart = (item: { id: string; name: string; price: number }, modifiers: Selection[] = []) => {
    const lineKey = buildLineKey(item.id, modifiers)
    setCart((prev) => {
      const ex = prev.find((i) => i.lineKey === lineKey)
      if (ex) return prev.map((i) => i.lineKey === lineKey ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { id: item.id, name: item.name, price: item.price + modifiersExtraPrice(modifiers), modifiers, lineKey, qty: 1 }]
    })
    toast(`${item.name} agregado`, 'success')
  }

  const changeQty = (lineKey: string, delta: number) => {
    setCart((prev) => {
      const next = prev.map((i) => i.lineKey === lineKey ? { ...i, qty: i.qty + delta } : i)
      return next.filter((i) => i.qty > 0)
    })
  }

  const handleItemClick = async (item: OrderMenuItem) => {
    const cartItem = { id: item.id, name: item.name, price: Number(item.price) }
    const groups = await getItemModifierGroups(item.id)
    if (groups.length) {
      setModalState({ item: cartItem, groups })
    } else {
      addToCart(cartItem)
    }
  }

  const placeOrder = async () => {
    setOrderMsg(null)

    if (!custName.trim() || !custPhone.trim()) {
      setOrderMsg({ text: 'Nombre y teléfono son requeridos.', type: 'error' })
      return
    }
    if (orderType === 'delivery' && !custAddress.trim()) {
      setOrderMsg({ text: 'La dirección de entrega es requerida.', type: 'error' })
      return
    }
    if (orderType === 'delivery' && !selectedZone) {
      setOrderMsg({ text: 'Selecciona tu zona de entrega.', type: 'error' })
      return
    }

    setPlacing(true)

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_id: customerId,
        order_type: orderType,
        delivery_name: custName.trim(),
        delivery_phone: custPhone.trim(),
        delivery_address: orderType === 'delivery' ? custAddress.trim() : null,
        delivery_zone_id: orderType === 'delivery' ? selectedZone?.id ?? null : null,
        delivery_fee: deliveryFee,
        notes: orderNotes.trim(),
        status: 'open',
        delivery_status: 'pending',
        payment_method: paymentMethod,
        subtotal,
        tax,
        total: grandTotal,
      })
      .select()
      .single()

    if (orderErr || !order) {
      setOrderMsg({ text: 'Error al enviar el pedido. Intenta de nuevo.', type: 'error' })
      setPlacing(false)
      return
    }

    const itemsPayload = cart.map((i) => ({
      order_id: order.id,
      menu_item_id: i.id,
      item_name: i.name,
      item_price: i.price,
      quantity: i.qty,
    }))
    const { data: insertedItems } = await supabase.from('order_items').insert(itemsPayload).select()

    const modifierRows: { order_item_id: string; option_name: string; price_delta: number }[] = []
    ;(insertedItems || []).forEach((row, idx) => {
      (cart[idx].modifiers || []).forEach((m) => {
        modifierRows.push({ order_item_id: row.id, option_name: m.option_name, price_delta: m.price_delta })
      })
    })
    if (modifierRows.length) await supabase.from('order_item_modifiers').insert(modifierRows)

    setSuccessTotal(grandTotal)
    setSuccessOrder(order)
    setCart([])
    setPlacing(false)
  }

  return (
    <div className="order-layout">
      <div className="order-menu-panel">
        <div className="order-panel-header">
          <h2>¿Qué vas a pedir?</h2>
          <div className="order-type-tabs">
            <button className={`order-type-btn${orderType === 'takeout' ? ' active' : ''}`} onClick={() => setOrderType('takeout')}>🥡 Para Llevar</button>
            <button className={`order-type-btn${orderType === 'delivery' ? ' active' : ''}`} onClick={() => setOrderType('delivery')}>🛵 Domicilio</button>
          </div>
        </div>

        <div className="order-cat-tabs">
          <button className={`pos-cat${activeCat === 'all' ? ' active' : ''}`} onClick={() => setActiveCat('all')}>Todos</button>
          {categories.map((c) => (
            <button key={c.id} className={`pos-cat${activeCat === c.id ? ' active' : ''}`} onClick={() => setActiveCat(c.id)}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        <div style={{ padding: '8px 16px' }}>
          <input type="text" className="form-control" placeholder="Buscar platillo..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="order-items-grid">
          {filteredItems.length === 0 ? (
            <p className="text-muted text-sm" style={{ gridColumn: '1/-1' }}>Sin resultados.</p>
          ) : (
            filteredItems.map((item) => {
              const icon = item.categories?.icon ?? '🍽️'
              return (
                <div
                  key={item.id}
                  className={`order-item-card${!item.available ? ' order-item-card--unavail' : ''}`}
                  onClick={() => handleItemClick(item)}
                >
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="order-item-img" src={item.image_url} alt={item.name} loading="lazy"
                      onError={(e) => {
                        const img = e.currentTarget
                        img.style.display = 'none'
                        const sibling = img.nextElementSibling as HTMLElement | null
                        if (sibling) sibling.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <div className="order-item-img" style={{ display: item.image_url ? 'none' : 'flex' }}>{icon}</div>
                  <div className="order-item-body">
                    <div className="order-item-name">{item.name}</div>
                    {item.description && <div className="order-item-desc">{item.description}</div>}
                    <div className="order-item-footer">
                      <span className="order-item-price">{fmt.currency(item.price)}</span>
                      <div className="order-item-add">+</div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="order-cart-panel">
        <div className="cart-header">
          <h3>Tu Orden</h3>
          <span className="badge badge-green">{cart.reduce((s, i) => s + i.qty, 0)} items</span>
        </div>

        <div className="cart-items">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <div style={{ fontSize: '2.5rem' }}>🛒</div>
              <p className="text-muted text-sm mt-8">Agrega platillos para empezar</p>
            </div>
          ) : (
            cart.map((i) => (
              <div key={i.lineKey} className="cart-item">
                <span className="cart-item__name">
                  {i.name}
                  {i.modifiers.length > 0 && <div className="text-xs text-muted">{modifiersSummary(i.modifiers)}</div>}
                </span>
                <div className="cart-item__qty">
                  <button className="qty-btn minus" onClick={() => changeQty(i.lineKey, -1)}>−</button>
                  <span className="qty-num">{i.qty}</span>
                  <button className="qty-btn" onClick={() => changeQty(i.lineKey, 1)}>+</button>
                </div>
                <span className="cart-item__price">{fmt.currency(i.price * i.qty)}</span>
                <span className="cart-item__del" onClick={() => changeQty(i.lineKey, -i.qty)}>✕</span>
              </div>
            ))
          )}
        </div>

        <div className="cart-totals">
          <div className="total-row"><span>Subtotal</span><span>{fmt.currency(subtotal)}</span></div>
          <div className="total-row"><span>IVA (8%)</span><span>{fmt.currency(tax)}</span></div>
          {orderType === 'delivery' && (
            <div className="total-row"><span>Costo de envío</span><span className="neon-amber">{fmt.currency(deliveryFee)}</span></div>
          )}
          <div className="total-row total-row--final"><span>TOTAL</span><span className="neon-green">{fmt.currency(grandTotal)}</span></div>
        </div>

        <div className="cart-customer-form">
          <h4>{orderType === 'delivery' ? 'Datos de entrega' : 'Datos para recoger'}</h4>
          <div className="flex-col gap-12 mt-12">
            <div className="form-group">
              <label className="form-label">Nombre completo *</label>
              <input type="text" className="form-control" placeholder="Tu nombre" value={custName} onChange={(e) => setCustName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Teléfono *</label>
              <input type="tel" className="form-control" placeholder="+503 0000-0000" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
            </div>

            {orderType === 'takeout' && (
              <div className="form-group">
                <label className="form-label">Hora de recogida</label>
                <select className="form-control" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)}>
                  <option value="20">En ~20 min</option>
                  <option value="30">En ~30 min</option>
                  <option value="45">En ~45 min</option>
                  <option value="60">En ~1 hora</option>
                </select>
              </div>
            )}

            {orderType === 'delivery' && (
              <>
                <div className="form-group">
                  <label className="form-label">Zona de entrega *</label>
                  <select className="form-control" value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)}>
                    <option value="">Selecciona tu zona...</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>{z.name} — {fmt.currency(z.fee)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección de entrega *</label>
                  <textarea className="form-control" rows={2} placeholder="Calle, número, colonia, referencias..." value={custAddress} onChange={(e) => setCustAddress(e.target.value)} />
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Notas especiales</label>
              <input type="text" className="form-control" placeholder="Sin cebolla, extra picante..." value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="cart-payment-selector">
          <div className="payment-type-tabs">
            <button className={`payment-btn${paymentMethod === 'cash' ? ' active' : ''}`} onClick={() => setPaymentMethod('cash')}>💵 Efectivo</button>
            <button className={`payment-btn${paymentMethod === 'nequi' ? ' active' : ''}`} onClick={() => setPaymentMethod('nequi')}>📱 Nequi</button>
          </div>
          {paymentMethod === 'cash' ? (
            <div className="cart-payment-cash">
              <span>💵</span>
              <span>{orderType === 'delivery' ? 'Pago en efectivo al recibir tu pedido' : 'Pago en efectivo al recoger tu orden'}</span>
            </div>
          ) : (
            <div className="nequi-info">
              <div className="nequi-header">
                <span style={{ fontSize: '1.3rem' }}>📱</span>
                <strong className="neon-green">Transferir por Nequi</strong>
              </div>
              <div className="nequi-number">312 828 2045</div>
              <p className="text-xs text-muted mt-6">
                Transfiere el total al número de arriba antes de enviar tu pedido.
                El restaurante verificará el pago.
              </p>
            </div>
          )}
        </div>

        <div className="cart-actions">
          {orderMsg && <div className="alert alert-error">{orderMsg.text}</div>}
          <button className="btn btn-primary btn-full btn-lg" disabled={cart.length === 0 || placing} onClick={placeOrder}>
            {placing ? 'Enviando pedido...' : 'Hacer Pedido'}
          </button>
        </div>
      </div>

      {modalState && (
        <ModifierModal
          item={modalState.item}
          groups={modalState.groups}
          onConfirm={(selections) => { addToCart(modalState.item, selections); setModalState(null) }}
          onCancel={() => setModalState(null)}
        />
      )}

      {successOrder && (
        <SuccessModal
          order={successOrder}
          total={successTotal}
          pickupMin={pickupTime}
          onClose={() => setSuccessOrder(null)}
        />
      )}
    </div>
  )
}
