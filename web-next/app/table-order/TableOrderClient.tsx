'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getSession, getProfile } from '@/lib/supabase/auth'
import { fmt, calcTotals } from '@/lib/format'
import { getItemModifierGroups, modifiersExtraPrice, modifiersSummary, buildLineKey } from '@/lib/modifiers'
import type { Selection } from '@/lib/modifiers'
import type { Category, ModifierGroup } from '@/lib/types'
import { useToast } from '../components/ToastProvider'
import ModifierModal from '../order/ModifierModal'
import './table-order.css'

const STAFF_ROLES = ['admin', 'waiter', 'kitchen']

type PlainMenuItem = {
  id: string
  category_id: string | null
  name: string
  description: string | null
  price: number
  image_url: string | null
  available: boolean
}

type CartLine = {
  id: string
  name: string
  price: number
  modifiers: Selection[]
  lineKey: string
  qty: number
}

type TrackedOrder = {
  id: string
  shortId: string
  status: string
  items: { name: string; qty: number; modifiers: Selection[] }[]
  total: number
  notes: string | null
}

const TRACKER_STATUS: Record<string, { cls: string; icon: string; text: string }> = {
  in_kitchen: { cls: 'tracker-status--kitchen', icon: '🍳', text: 'En cocina...' },
  ready:      { cls: 'tracker-status--ready',   icon: '✅', text: '¡Listo! El mesero viene en camino' },
  delivered:  { cls: 'tracker-status--done',    icon: '🍽️', text: 'Entregado en tu mesa' },
  paid:       { cls: 'tracker-status--done',    icon: '✓',  text: 'Completado' },
}

function CartItems({ cart, onChangeQty }: { cart: CartLine[]; onChangeQty: (lineKey: string, delta: number) => void }) {
  if (!cart.length) return <p className="text-muted text-sm" style={{ padding: '12px 0' }}>Sin productos.</p>
  return (
    <>
      {cart.map((c) => (
        <div key={c.lineKey} className="cart-item">
          <span className="cart-item__name">
            {c.name}
            {c.modifiers.length > 0 && <div className="text-xs text-muted">{modifiersSummary(c.modifiers)}</div>}
          </span>
          <div className="cart-item__qty">
            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => onChangeQty(c.lineKey, -1)}>−</button>
            <span>{c.qty}</span>
            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => onChangeQty(c.lineKey, 1)}>+</button>
          </div>
          <span className="cart-item__price">{fmt.currency(c.price * c.qty)}</span>
        </div>
      ))}
    </>
  )
}

export default function TableOrderClient() {
  const supabase = createClient()
  const toast = useToast()
  const params = useSearchParams()
  const tableId = params.get('table')

  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading')
  const [errorMsg, setErrorMsg] = useState('Código QR inválido.')
  const [tableInfo, setTableInfo] = useState<{ number: number; location: string } | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [greetName, setGreetName] = useState('')

  const [categories, setCategories] = useState<Category[]>([])
  const [menuItems, setMenuItems] = useState<PlainMenuItem[]>([])
  const [activeCat, setActiveCat] = useState('all')
  const [search, setSearch] = useState('')

  const [cart, setCart] = useState<CartLine[]>([])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderMsg, setOrderMsg] = useState('')

  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [trackerOpen, setTrackerOpen] = useState(false)
  const [successOrderNum, setSuccessOrderNum] = useState<string | null>(null)

  const [myOrders, setMyOrders] = useState<TrackedOrder[]>([])
  const [modalState, setModalState] = useState<{ item: { id: string; name: string; price: number }; groups: ModifierGroup[] } | null>(null)

  const myOrdersRef = useRef<TrackedOrder[]>([])
  useEffect(() => { myOrdersRef.current = myOrders }, [myOrders])

  useEffect(() => {
    ;(async () => {
      if (!tableId) { setErrorMsg('Código QR inválido. No se encontró la mesa.'); setPhase('error'); return }

      const session = await getSession()
      if (session) {
        const p = await getProfile(session.user.id)
        if (p && !STAFF_ROLES.includes(p.role)) {
          setCustomerId(p.id)
          if (p.full_name) setGreetName(p.full_name)
        }
      }

      const { data: tbl } = await supabase.from('restaurant_tables').select('*').eq('id', tableId).maybeSingle()
      if (!tbl) { setErrorMsg('Mesa no encontrada. Escanea el código QR correcto.'); setPhase('error'); return }

      setTableInfo({ number: tbl.number, location: tbl.location })
      if (tbl.status !== 'occupied') {
        await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', tableId)
      }

      const [{ data: cats }, { data: items }] = await Promise.all([
        supabase.from('categories').select('*').eq('active', true).order('display_order'),
        supabase.from('menu_items').select('*').eq('available', true).order('name'),
      ])
      setCategories((cats as Category[]) ?? [])
      setMenuItems((items as PlainMenuItem[]) ?? [])

      setPhase('ready')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId])

  useEffect(() => {
    if (!tableId) return
    const channel = supabase
      .channel(`table-tracker-${tableId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `table_id=eq.${tableId}` }, (payload) => {
        const order = myOrdersRef.current.find((o) => o.id === payload.new.id)
        if (!order) return
        const prevStatus = order.status
        const newStatus = payload.new.status as string
        setMyOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: newStatus } : o))
        if (prevStatus !== 'ready' && newStatus === 'ready') {
          toast('¡Tu pedido está listo! 🍽️ El mesero lo traerá pronto', 'success')
        }
      })
      .subscribe()

    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId])

  const filteredItems = menuItems.filter((i) => {
    const q = search.toLowerCase()
    return (activeCat === 'all' || i.category_id === activeCat) &&
      (i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
  })

  const addToCart = useCallback((item: { id: string; name: string; price: number }, modifiers: Selection[] = []) => {
    const lineKey = buildLineKey(item.id, modifiers)
    setCart((prev) => {
      const ex = prev.find((c) => c.lineKey === lineKey)
      if (ex) return prev.map((c) => c.lineKey === lineKey ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { id: item.id, name: item.name, price: item.price + modifiersExtraPrice(modifiers), modifiers, lineKey, qty: 1 }]
    })
    toast(`${item.name} agregado`, 'success')
  }, [toast])

  const changeQty = useCallback((lineKey: string, delta: number) => {
    setCart((prev) => prev.map((c) => c.lineKey === lineKey ? { ...c, qty: c.qty + delta } : c).filter((c) => c.qty > 0))
  }, [])

  const handleItemClick = async (item: PlainMenuItem) => {
    const cartItem = { id: item.id, name: item.name, price: Number(item.price) }
    const groups = await getItemModifierGroups(item.id)
    if (groups.length) {
      setModalState({ item: cartItem, groups })
    } else {
      addToCart(cartItem)
    }
  }

  const cartCount = cart.reduce((s, c) => s + c.qty, 0)
  const { subtotal, tax, total } = calcTotals(cart.reduce((s, c) => s + c.price * c.qty, 0))

  const submitOrder = async () => {
    if (!cart.length || !tableId) return
    setSubmitting(true)
    setOrderMsg('')

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        table_id: tableId,
        customer_id: customerId,
        order_type: 'dine_in',
        status: 'in_kitchen',
        notes: notes.trim() || null,
        subtotal, tax, total,
      })
      .select()
      .single()

    if (orderErr || !order) {
      setOrderMsg('Error al enviar el pedido. Intenta de nuevo.')
      setSubmitting(false)
      return
    }

    const { data: insertedItems } = await supabase.from('order_items').insert(
      cart.map((c) => ({ order_id: order.id, menu_item_id: c.id, item_name: c.name, item_price: c.price, quantity: c.qty }))
    ).select()

    const modifierRows: { order_item_id: string; option_name: string; price_delta: number }[] = []
    ;(insertedItems || []).forEach((row, idx) => {
      (cart[idx].modifiers || []).forEach((m) => {
        modifierRows.push({ order_item_id: row.id, option_name: m.option_name, price_delta: m.price_delta })
      })
    })
    if (modifierRows.length) await supabase.from('order_item_modifiers').insert(modifierRows)

    setMyOrders((prev) => [...prev, {
      id: order.id,
      shortId: order.id.slice(0, 8).toUpperCase(),
      status: 'in_kitchen',
      items: cart.map((c) => ({ name: c.name, qty: c.qty, modifiers: c.modifiers })),
      total,
      notes: notes.trim() || null,
    }])

    setMobileCartOpen(false)
    setSuccessOrderNum(order.id.slice(0, 8).toUpperCase())
    setCart([])
    setNotes('')
    setSubmitting(false)
  }

  if (phase === 'loading') {
    return (
      <div className="full-screen">
        <div className="neon-green" style={{ fontFamily: 'var(--font-d)', fontSize: '2rem', letterSpacing: '.08em' }}>CRUNCHIES</div>
        <p className="text-secondary">Cargando tu mesa...</p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="full-screen">
        <div style={{ fontSize: '3rem' }}>⚠️</div>
        <h2 style={{ fontFamily: 'var(--font-d)' }}>Oops</h2>
        <p className="text-secondary">{errorMsg}</p>
        <Link href="/" className="btn btn-outline">Ir al inicio</Link>
      </div>
    )
  }

  const readyCount = myOrders.filter((o) => o.status === 'ready').length

  return (
    <div>
      <div className="table-banner">
        <div className="table-banner__left">
          <span className="table-banner__mesa">Mesa {tableInfo?.number}</span>
          <span className="table-banner__loc">{tableInfo?.location}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {myOrders.length > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '.78rem', padding: '5px 12px', whiteSpace: 'nowrap' }}
              onClick={() => setTrackerOpen(true)}
            >
              {readyCount > 0
                ? <>🔔 <strong style={{ color: 'var(--green)' }}>{readyCount} listo{readyCount > 1 ? 's' : ''}</strong></>
                : `📋 Mis pedidos (${myOrders.length})`}
            </button>
          )}
          <span className="table-banner__user">{greetName ? `Hola, ${greetName}` : ''}</span>
        </div>
      </div>

      <div className="table-order-layout">
        <div className="order-menu-panel">
          <div className="order-panel-header">
            <h2>¿Qué van a pedir?</h2>
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

          <p style={{ fontSize: '.71rem', color: 'var(--text-secondary)', opacity: .65, padding: '0 16px 4px', margin: 0 }}>
            📸 Imágenes de referencia — la presentación puede variar.
          </p>

          <div className="order-items-grid">
            {filteredItems.length === 0 ? (
              <p className="text-muted text-sm" style={{ gridColumn: '1/-1', padding: 20 }}>Sin resultados.</p>
            ) : (
              filteredItems.map((item) => {
                const cartQty = cart.filter((c) => c.id === item.id).reduce((s, c) => s + c.qty, 0)
                return (
                  <div key={item.id} className={`order-item-card${cartQty ? ' in-cart' : ''}`} onClick={() => handleItemClick(item)}>
                    <div className="order-item-img">
                      {item.image_url
                        ? // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span>🍽️</span>}
                    </div>
                    <div className="order-item-body">
                      <div className="order-item-name">{item.name}</div>
                      {item.description && <div className="order-item-desc">{item.description}</div>}
                      <div className="order-item-footer">
                        <span className="order-item-price">{fmt.currency(item.price)}</span>
                        <span className={`order-item-add${cartQty ? ' in-cart' : ''}`}>{cartQty ? `✓ ${cartQty}` : '+'}</span>
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
            <h3>Tu Orden — <span className="neon-green">Mesa {tableInfo?.number}</span></h3>
            <span className="badge badge-green">{cartCount} items</span>
          </div>

          <div className="cart-items">
            {cart.length === 0 ? (
              <div className="cart-empty">
                <div style={{ fontSize: '2.5rem' }}>🧾</div>
                <p className="text-muted text-sm mt-8">Agrega platillos para empezar</p>
              </div>
            ) : (
              <CartItems cart={cart} onChangeQty={changeQty} />
            )}
          </div>

          <div className="cart-totals">
            <div className="total-row"><span>Subtotal</span><span>{fmt.currency(subtotal)}</span></div>
            <div className="total-row"><span>IVA (8%)</span><span>{fmt.currency(tax)}</span></div>
            <div className="total-row total-row--final"><span>TOTAL</span><span className="neon-green">{fmt.currency(total)}</span></div>
          </div>

          <div className="cart-customer-form">
            <div className="form-group">
              <label className="form-label">Notas para cocina</label>
              <input type="text" className="form-control" placeholder="Sin cebolla, extra picante..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="cart-actions">
            {orderMsg && <div className="alert alert-error">{orderMsg}</div>}
            <button className="btn btn-primary btn-full btn-lg" disabled={!cart.length || submitting} onClick={submitOrder}>
              {submitting ? 'Enviando...' : 'Enviar Pedido a Cocina'}
            </button>
          </div>
        </div>
      </div>

      <div className={`mobile-cart-bar${cartCount ? ' visible' : ''}`} onClick={() => setMobileCartOpen(true)}>
        <span>{cartCount} {cartCount === 1 ? 'item' : 'items'}</span>
        <span>Ver pedido →</span>
        <span>{fmt.currency(total)}</span>
      </div>

      <div className={`mobile-cart-backdrop${mobileCartOpen ? ' visible' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setMobileCartOpen(false) }}>
        <div className="mobile-cart-sheet">
          <div className="mobile-cart-header">
            <h3>Tu Pedido</h3>
            <button onClick={() => setMobileCartOpen(false)}>✕</button>
          </div>

          <div>
            <CartItems cart={cart} onChangeQty={changeQty} />
          </div>

          <div className="cart-totals" style={{ borderTop: 'none', padding: 0 }}>
            <div className="total-row"><span>Subtotal</span><span>{fmt.currency(subtotal)}</span></div>
            <div className="total-row"><span>IVA (8%)</span><span>{fmt.currency(tax)}</span></div>
            <div className="total-row total-row--final"><span>TOTAL</span><span className="neon-green">{fmt.currency(total)}</span></div>
          </div>

          <div className="form-group">
            <label className="form-label">Notas para cocina</label>
            <input type="text" className="form-control" placeholder="Sin cebolla, extra picante..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {orderMsg && <div className="alert alert-error">{orderMsg}</div>}
          <button className="btn btn-primary btn-full btn-lg" disabled={!cart.length || submitting} onClick={submitOrder}>
            {submitting ? 'Enviando...' : 'Enviar Pedido a Cocina'}
          </button>
        </div>
      </div>

      {successOrderNum && (
        <div className="success-screen">
          <div className="success-icon">✓</div>
          <div className="neon-green" style={{ fontFamily: 'var(--font-d)', fontSize: '1.8rem' }}>¡Pedido Enviado!</div>
          <p className="success-order-num">#{successOrderNum}</p>
          <p className="text-secondary" style={{ maxWidth: 280 }}>Tu pedido está en camino a la cocina. El mesero lo traerá pronto a tu mesa.</p>
          <button className="btn btn-primary btn-lg" onClick={() => setSuccessOrderNum(null)}>Seguir Ordenando</button>
        </div>
      )}

      <div className={`mobile-cart-backdrop${trackerOpen ? ' visible' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setTrackerOpen(false) }}>
        <div className="mobile-cart-sheet" style={{ maxHeight: '80vh' }}>
          <div className="mobile-cart-header">
            <h3>📋 Mis Pedidos</h3>
            <button onClick={() => setTrackerOpen(false)}>✕</button>
          </div>
          <div>
            {myOrders.length === 0 ? (
              <p className="text-muted text-sm" style={{ padding: '12px 0' }}>Sin pedidos aún.</p>
            ) : (
              [...myOrders].reverse().map((o) => {
                const s = TRACKER_STATUS[o.status] ?? { cls: 'tracker-status--kitchen', icon: '⏳', text: o.status }
                return (
                  <div key={o.id} className={`tracker-order-card${o.status === 'ready' ? ' tracker-order-card--ready' : ''}`}>
                    <div className="tracker-order-header">
                      <span className="tracker-order-num">#{o.shortId}</span>
                      <span className={`tracker-status ${s.cls}`}>{s.icon} {s.text}</span>
                    </div>
                    <div className="tracker-items">
                      {o.items.map((i, idx) => (
                        <div key={idx}>{i.qty}× {i.name}{i.modifiers.length > 0 ? ` (${modifiersSummary(i.modifiers)})` : ''}</div>
                      ))}
                    </div>
                    <div className="tracker-footer">
                      {o.notes ? <span style={{ color: 'var(--text-secondary)' }}>📝 {o.notes}</span> : <span></span>}
                      <span className="tracker-total">{fmt.currency(o.total)}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
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
    </div>
  )
}
