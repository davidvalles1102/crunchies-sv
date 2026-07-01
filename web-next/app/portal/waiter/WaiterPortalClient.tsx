'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt, calcTotals } from '@/lib/format'
import { getItemModifierGroups, modifiersExtraPrice, modifiersSummary, buildLineKey } from '@/lib/modifiers'
import type { Selection } from '@/lib/modifiers'
import { getPinSession, logoutPin, logEvent, type PinSession } from '@/lib/pin-auth'
import PinPad from '../PinPad'
import ModifierModal from '../../order/ModifierModal'
import type { Category, OrderMenuItem, ModifierGroup, RestaurantTable } from '@/lib/types'

type WaiterView = 'tables' | 'order' | 'pay'
type TableStatus = Record<string, 'in_kitchen' | 'ready'>

type TicketItem = {
  dbId: string; id: string; name: string; price: number; qty: number
  modifiers: Selection[]; lineKey: string
}
type ActiveOrder = { id: string; table_id: string; status: string; items: TicketItem[]; subtotal: number; tax: number; total: number }

const ROLE_BADGE: Record<string, string> = {
  available: 'waiter-table-card--available',
  occupied: 'waiter-table-card--occupied',
  reserved: 'waiter-table-card--reserved',
  maintenance: 'waiter-table-card--maintenance',
}

function mapItems(raw: { id: string; menu_item_id: string; item_name: string; item_price: number; quantity: number; order_item_modifiers: { option_name: string; price_delta: number }[] }[]): TicketItem[] {
  return (raw || []).map((i) => {
    const modifiers: Selection[] = (i.order_item_modifiers || []).map((m) => ({ option_name: m.option_name, price_delta: Number(m.price_delta) }))
    return { dbId: i.id, id: i.menu_item_id, name: i.item_name, price: Number(i.item_price), qty: i.quantity, modifiers, lineKey: buildLineKey(i.menu_item_id, modifiers) }
  })
}

export default function WaiterPortalClient() {
  const supabase = createClient()
  const [session, setSession] = useState<PinSession | null>(null)
  const [view, setView] = useState<WaiterView>('tables')

  // Data
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [tableStatus, setTableStatus] = useState<TableStatus>({})
  const [categories, setCategories] = useState<Category[]>([])
  const [menuItems, setMenuItems] = useState<OrderMenuItem[]>([])
  const [activeCat, setActiveCat] = useState('all')
  const [search, setSearch] = useState('')

  // Order
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null)
  const [currentOrder, setCurrentOrder] = useState<ActiveOrder | null>(null)
  const [orderNotes, setOrderNotes] = useState('')
  const [modModal, setModModal] = useState<{ item: { id: string; name: string; price: number }; groups: ModifierGroup[] } | null>(null)

  // Pay
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'transfer'>('cash')
  const [cashIn, setCashIn] = useState('')
  const [paying, setPaying] = useState(false)

  // Realtime alert for ready orders
  const [readyAlert, setReadyAlert] = useState<Set<string>>(new Set()) // table_ids with ready orders

  useEffect(() => {
    const s = getPinSession()
    if (s?.role === 'waiter') setSession(s)
  }, [])

  useEffect(() => {
    if (!session) return undefined

    loadAll()

    const channel = supabase
      .channel('waiter-portal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadTableStatus()
        // Update active order status if viewing order view
        if (currentOrder) loadActiveOrder(currentOrder.table_id)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, loadTables)
      .subscribe()

    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // Re-subscribe when currentOrder changes (for status banner)
  useEffect(() => {
    if (!currentOrder) return undefined
    const channel = supabase
      .channel(`waiter-order-${currentOrder.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${currentOrder.id}` }, (payload) => {
        const newStatus = (payload.new as { status?: string })?.status
        if (!newStatus) return
        setCurrentOrder((prev) => prev ? { ...prev, status: newStatus } : prev)
        if (newStatus === 'ready' && currentOrder.table_id) {
          setReadyAlert((prev) => new Set([...prev, currentOrder.table_id]))
        }
      })
      .subscribe()
    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrder?.id])

  async function loadAll() {
    const [{ data: tablesData }, { data: cats }, { data: items }] = await Promise.all([
      supabase.from('restaurant_tables').select('*').order('number'),
      supabase.from('categories').select('*').eq('active', true).order('display_order'),
      supabase.from('menu_items').select('*').eq('available', true),
    ])
    setTables((tablesData as RestaurantTable[]) || [])
    setCategories((cats as Category[]) || [])
    setMenuItems((items as OrderMenuItem[]) || [])
    await loadTableStatus()
  }

  async function loadTables() {
    const { data } = await supabase.from('restaurant_tables').select('*').order('number')
    setTables((data as RestaurantTable[]) || [])
  }

  async function loadTableStatus() {
    const { data } = await supabase
      .from('orders')
      .select('table_id, status')
      .in('status', ['in_kitchen', 'ready', 'open'])
      .not('table_id', 'is', null)

    const map: TableStatus = {}
    const alerts = new Set<string>()
    ;(data || []).forEach((o: { table_id: string | null; status: string }) => {
      if (!o.table_id) return
      // ready trumps in_kitchen
      if (!map[o.table_id] || o.status === 'ready') map[o.table_id] = o.status as 'in_kitchen' | 'ready'
      if (o.status === 'ready') alerts.add(o.table_id)
    })
    setTableStatus(map)
    setReadyAlert(alerts)
  }

  async function loadActiveOrder(tableId: string) {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, order_item_modifiers(*))')
      .eq('table_id', tableId)
      .in('status', ['open', 'in_kitchen', 'ready', 'delivered'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (data?.length) {
      const o = data[0]
      setCurrentOrder({ id: o.id, table_id: tableId, status: o.status, items: mapItems(o.order_items), subtotal: o.subtotal ?? 0, tax: o.tax ?? 0, total: o.total ?? 0 })
    } else {
      setCurrentOrder(null)
    }
  }

  async function selectTable(table: RestaurantTable) {
    setSelectedTable(table)
    setCurrentOrder(null)
    setOrderNotes('')
    setCashIn('')
    await loadActiveOrder(table.id)
    // Mark table occupied if available
    if (table.status === 'available') {
      await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', table.id)
      setTables((prev) => prev.map((t) => t.id === table.id ? { ...t, status: 'occupied' } : t))
    }
    setView('order')
  }

  async function addItem(item: { id: string; name: string; price: number }, modifiers: Selection[] = []) {
    if (!selectedTable) return
    const lineKey = buildLineKey(item.id, modifiers)
    const unitPrice = item.price + modifiersExtraPrice(modifiers)

    let order = currentOrder
    // Auto-create order on first item
    if (!order) {
      const { data, error } = await supabase.from('orders').insert({
        table_id: selectedTable.id,
        waiter_id: null,
        order_type: 'dine_in',
        status: 'open',
      }).select().single()
      if (error || !data) return
      order = { id: data.id, table_id: selectedTable.id, status: 'open', items: [], subtotal: 0, tax: 0, total: 0 }
      await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', selectedTable.id)
    }

    const existing = order.items.find((i) => i.lineKey === lineKey)
    let newItems: TicketItem[]

    if (existing) {
      const newQty = existing.qty + 1
      await supabase.from('order_items').update({ quantity: newQty }).eq('id', existing.dbId)
      newItems = order.items.map((i) => i.lineKey === lineKey ? { ...i, qty: newQty } : i)
    } else {
      const { data } = await supabase.from('order_items').insert({
        order_id: order.id,
        menu_item_id: item.id,
        item_name: item.name,
        item_price: unitPrice,
        quantity: 1,
      }).select().single()
      if (!data) return
      if (modifiers.length) {
        await supabase.from('order_item_modifiers').insert(
          modifiers.map((m) => ({ order_item_id: data.id, option_name: m.option_name, price_delta: m.price_delta }))
        )
      }
      newItems = [...order.items, { dbId: data.id, id: item.id, name: item.name, price: unitPrice, qty: 1, modifiers, lineKey }]
    }

    const subtotal = newItems.reduce((s, i) => s + i.price * i.qty, 0)
    const { tax, total } = calcTotals(subtotal)
    const reopen = order.status === 'ready' || order.status === 'delivered'
    const update: Record<string, unknown> = { subtotal, tax, total }
    if (reopen) update.status = 'in_kitchen'
    await supabase.from('orders').update(update).eq('id', order.id)
    setCurrentOrder({ ...order, status: reopen ? 'in_kitchen' : order.status, items: newItems, subtotal, tax, total })
  }

  async function changeQty(dbId: string, delta: number) {
    if (!currentOrder) return
    const it = currentOrder.items.find((i) => i.dbId === dbId)
    if (!it) return
    const newQty = it.qty + delta
    let newItems: TicketItem[]
    if (newQty <= 0) {
      await supabase.from('order_items').delete().eq('id', dbId)
      newItems = currentOrder.items.filter((i) => i.dbId !== dbId)
    } else {
      await supabase.from('order_items').update({ quantity: newQty }).eq('id', dbId)
      newItems = currentOrder.items.map((i) => i.dbId === dbId ? { ...i, qty: newQty } : i)
    }
    const subtotal = newItems.reduce((s, i) => s + i.price * i.qty, 0)
    const { tax, total } = calcTotals(subtotal)
    await supabase.from('orders').update({ subtotal, tax, total }).eq('id', currentOrder.id)
    setCurrentOrder({ ...currentOrder, items: newItems, subtotal, tax, total })
  }

  async function sendToKitchen() {
    if (!currentOrder?.items.length) return
    await supabase.from('orders').update({ status: 'in_kitchen', notes: orderNotes.trim() || null }).eq('id', currentOrder.id)
    setCurrentOrder({ ...currentOrder, status: 'in_kitchen' })
    logEvent(currentOrder.id, 'sent_to_kitchen', session!.staff_id, { table: selectedTable?.number })
    setOrderNotes('')
  }

  async function processPayment() {
    if (!currentOrder || !selectedTable) return
    setPaying(true)
    const received = parseFloat(cashIn) || currentOrder.total
    const receipt = `REC-${Date.now()}`

    await supabase.from('payments').insert({
      order_id: currentOrder.id,
      amount: currentOrder.total,
      method: payMethod,
      receipt_number: receipt,
      change_amount: Math.max(0, received - currentOrder.total),
    })
    await supabase.from('orders').update({ status: 'paid' }).eq('id', currentOrder.id)
    await supabase.from('restaurant_tables').update({ status: 'available' }).eq('id', selectedTable.id)

    logEvent(currentOrder.id, 'paid', session!.staff_id, { table: selectedTable.number, total: currentOrder.total, method: payMethod })
    logEvent(currentOrder.id, 'table_closed', session!.staff_id, { table: selectedTable.number })

    setTables((prev) => prev.map((t) => t.id === selectedTable.id ? { ...t, status: 'available' } : t))
    setReadyAlert((prev) => { const n = new Set(prev); n.delete(selectedTable.id); return n })
    setCurrentOrder(null)
    setSelectedTable(null)
    setPaying(false)
    setCashIn('')
    await loadTableStatus()
    setView('tables')
  }

  async function handleItemClick(item: OrderMenuItem) {
    const cartItem = { id: item.id, name: item.name, price: Number(item.price) }
    const groups = await getItemModifierGroups(item.id)
    if (groups.length) setModModal({ item: cartItem, groups })
    else await addItem(cartItem)
  }

  const filteredItems = menuItems.filter((i) =>
    (activeCat === 'all' || i.category_id === activeCat) &&
    (i.name.toLowerCase().includes(search.toLowerCase()))
  )

  const change = Math.max(0, (parseFloat(cashIn) || 0) - (currentOrder?.total ?? 0))

  if (!session) {
    return <PinPad portalName="Mesero" icon="🪑" expectedRole="waiter" onSuccess={setSession} />
  }

  // ─── PAY VIEW ───────────────────────────────────────────────────
  if (view === 'pay' && currentOrder) {
    return (
      <div className="portal-body">
        <header className="portal-header">
          <div className="portal-header__left">
            <button className="btn btn-ghost btn-sm" onClick={() => setView('order')}>← Volver</button>
            <span className="portal-header__brand">Cobrar — Mesa {selectedTable?.number}</span>
          </div>
          <span className="portal-header__staff">👤 {session.full_name}</span>
        </header>

        <div style={{ maxWidth: 480, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Order summary */}
          <div className="card">
            <h4 style={{ marginBottom: 10 }}>🧾 Resumen de la orden</h4>
            {currentOrder.items.map((i) => (
              <div key={i.dbId} className="receipt__item text-sm" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{i.qty}× {i.name}{i.modifiers?.length ? <><br /><span className="text-xs text-muted">{modifiersSummary(i.modifiers)}</span></> : null}</span>
                <span>{fmt.currency(i.price * i.qty)}</span>
              </div>
            ))}
            <div className="receipt__item" style={{ marginTop: 8 }}><span>Subtotal</span><span>{fmt.currency(currentOrder.subtotal)}</span></div>
            <div className="receipt__item"><span>IVA 8%</span><span>{fmt.currency(currentOrder.tax)}</span></div>
            <div className="receipt__item receipt__total" style={{ fontWeight: 700, fontSize: '1.2rem', marginTop: 6 }}>
              <span>TOTAL</span><span className="neon-green">{fmt.currency(currentOrder.total)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <div className="form-label" style={{ marginBottom: 8 }}>Método de pago</div>
            <div className="pay-methods">
              <button className={`pay-method${payMethod === 'cash' ? ' active' : ''}`} onClick={() => setPayMethod('cash')}>💵 Efectivo</button>
              <button className={`pay-method${payMethod === 'card' ? ' active' : ''}`} onClick={() => setPayMethod('card')}>💳 Tarjeta</button>
              <button className={`pay-method${payMethod === 'transfer' ? ' active' : ''}`} onClick={() => setPayMethod('transfer')}>📲 Transferencia</button>
            </div>
          </div>

          {payMethod === 'cash' && (
            <div>
              <div className="form-label" style={{ marginBottom: 6 }}>Efectivo recibido</div>
              <input
                type="number" className="form-control" placeholder="0.00" step="0.01"
                value={cashIn} onChange={(e) => setCashIn(e.target.value)}
                style={{ fontSize: '1.3rem', padding: '12px 16px' }}
                autoFocus
              />
              {parseFloat(cashIn) > 0 && (
                <div className="change-display mt-8" style={{ fontSize: '1.1rem' }}>
                  Cambio: <span className="neon-amber" style={{ fontWeight: 700 }}>{fmt.currency(change)}</span>
                </div>
              )}
            </div>
          )}

          <button
            className="btn btn-primary btn-full"
            style={{ padding: '16px', fontSize: '1rem', fontWeight: 700 }}
            disabled={paying || (payMethod === 'cash' && parseFloat(cashIn) < (currentOrder.total - 0.01))}
            onClick={processPayment}
          >
            {paying ? 'Procesando...' : `✓ Cobrar ${fmt.currency(currentOrder.total)} y cerrar mesa`}
          </button>
          {payMethod === 'cash' && parseFloat(cashIn) > 0 && parseFloat(cashIn) < currentOrder.total && (
            <p className="text-xs text-muted" style={{ textAlign: 'center', color: '#ef4444' }}>
              El efectivo ingresado no cubre el total
            </p>
          )}
        </div>
      </div>
    )
  }

  // ─── ORDER VIEW ─────────────────────────────────────────────────
  if (view === 'order') {
    const statusBanners: Record<string, { text: string; cls: string }> = {
      in_kitchen: { text: '🟡 EN COCINA — preparando...', cls: 'status--kitchen' },
      ready: { text: '✅ LISTA — llevar a la mesa', cls: 'status--ready' },
      delivered: { text: '🍽️ ENTREGADA', cls: 'status--delivered' },
    }
    const banner = currentOrder ? statusBanners[currentOrder.status] : null

    return (
      <div className="portal-body" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <header className="portal-header">
          <div className="portal-header__left">
            <button className="btn btn-ghost btn-sm" onClick={() => { setView('tables'); setSelectedTable(null); setCurrentOrder(null) }}>← Mesas</button>
            <span className="portal-header__brand">Mesa {selectedTable?.number}</span>
            {currentOrder && <span className="badge badge-muted text-xs">#{currentOrder.id.slice(0,6)}</span>}
          </div>
          <div className="portal-header__right">
            <span className="portal-header__staff">👤 {session.full_name}</span>
            {currentOrder?.items.length ? (
              <button className="btn btn-outline btn-sm" onClick={() => setView('pay')}>💳 Cobrar</button>
            ) : null}
          </div>
        </header>

        {banner && (
          <div className={`order-status-banner ${banner.cls}`}>{banner.text}</div>
        )}

        <div className="waiter-order-layout" style={{ flex: 1, overflow: 'hidden' }}>
          {/* Menu panel */}
          <div className="waiter-menu-panel">
            <div className="waiter-cat-tabs">
              <button className={`pos-cat${activeCat === 'all' ? ' active' : ''}`} onClick={() => setActiveCat('all')}>Todos</button>
              {categories.map((c) => (
                <button key={c.id} className={`pos-cat${activeCat === c.id ? ' active' : ''}`} onClick={() => setActiveCat(c.id)}>{c.icon} {c.name}</button>
              ))}
            </div>
            <div style={{ padding: '6px 12px' }}>
              <input type="text" className="form-control" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="waiter-items-grid">
              {filteredItems.map((item) => (
                <div key={item.id} className="waiter-item-card" onClick={() => handleItemClick(item)}>
                  <div className="waiter-item-name">{item.name}</div>
                  <div className="waiter-item-price">{fmt.currency(item.price)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Ticket panel */}
          <div className="waiter-ticket">
            <div className="waiter-ticket-header">
              {currentOrder?.items.length ? `${currentOrder.items.reduce((s, i) => s + i.qty, 0)} items` : 'Agrega platillos'}
            </div>
            <div className="waiter-ticket-items">
              {(currentOrder?.items || []).map((i) => (
                <div key={i.dbId} className="waiter-ticket-item">
                  <div className="ticket-item__qty">
                    <button className="qty-btn minus" onClick={() => changeQty(i.dbId, -1)}>−</button>
                    <span className="qty-num">{i.qty}</span>
                    <button className="qty-btn" onClick={() => changeQty(i.dbId, 1)}>+</button>
                  </div>
                  <div className="waiter-ticket-item__name">
                    {i.name}
                    {i.modifiers?.length ? <div className="text-xs text-muted">{modifiersSummary(i.modifiers)}</div> : null}
                  </div>
                  <div className="waiter-ticket-item__price">{fmt.currency(i.price * i.qty)}</div>
                </div>
              ))}
            </div>
            {currentOrder?.items.length ? (
              <>
                <div className="waiter-ticket-totals">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: 'var(--text-muted)' }}>
                    <span>Subtotal</span><span>{fmt.currency(currentOrder.subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontWeight: 600 }}>TOTAL</span>
                    <span className="waiter-ticket-total">{fmt.currency(currentOrder.total)}</span>
                  </div>
                </div>
                <div className="waiter-ticket-actions">
                  <div>
                    <input type="text" className="form-control" placeholder="Nota para cocina..." value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} style={{ fontSize: '.8rem' }} />
                  </div>
                  <button className="btn btn-amber btn-full btn-sm" onClick={sendToKitchen}
                    disabled={currentOrder.status === 'in_kitchen'}>
                    {currentOrder.status === 'in_kitchen' ? '🔥 En cocina...' : '👨‍🍳 Enviar a Cocina'}
                  </button>
                  <button className="btn btn-primary btn-full btn-sm" onClick={() => setView('pay')}>
                    💳 Cobrar {fmt.currency(currentOrder.total)}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {modModal && (
          <ModifierModal
            item={modModal.item}
            groups={modModal.groups}
            onConfirm={(sel) => { addItem(modModal.item, sel); setModModal(null) }}
            onCancel={() => setModModal(null)}
          />
        )}
      </div>
    )
  }

  // ─── TABLES VIEW ────────────────────────────────────────────────
  return (
    <div className="portal-body">
      <header className="portal-header">
        <div className="portal-header__left">
          <span className="portal-header__brand">CRUNCHIES — MESERO</span>
          <span className="portal-header__staff">👤 {session.full_name}</span>
        </div>
        <div className="portal-header__right">
          {readyAlert.size > 0 && (
            <span className="badge badge-amber" style={{ animation: 'pulse-table 2s infinite' }}>
              🔔 {readyAlert.size} listo{readyAlert.size > 1 ? 's' : ''}
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={async () => { await logoutPin(); setSession(null) }}>⏻ Salir</button>
        </div>
      </header>

      <div style={{ padding: '8px 16px' }}>
        <div style={{ display: 'flex', gap: 12, fontSize: '.78rem', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} /> Disponible</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--border-lit)', display: 'inline-block' }} /> Ocupada</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} /> Lista para entregar</span>
        </div>
      </div>

      <div className="waiter-tables-grid">
        {tables.map((t) => {
          const orderStatus = tableStatus[t.id]
          const isReady = readyAlert.has(t.id)
          const cardCls = isReady ? 'waiter-table-card--ready' : ROLE_BADGE[t.status] ?? 'waiter-table-card--occupied'
          const statusLabel = isReady ? '✅ LISTO' : t.status === 'available' ? 'Libre' : t.status === 'reserved' ? 'Reservada' : t.status === 'maintenance' ? 'Mantenim.' : orderStatus === 'in_kitchen' ? '🔥 Cocina' : 'Ocupada'

          return (
            <div
              key={t.id}
              className={`waiter-table-card ${cardCls}`}
              onClick={() => t.status !== 'maintenance' ? selectTable(t) : undefined}
            >
              <div className="waiter-table-num">{t.number}</div>
              <div className="waiter-table-loc">{t.location}</div>
              {isReady
                ? <div className="waiter-table-badge">✅ LISTO</div>
                : <div className="waiter-table-status text-xs" style={{ opacity: .7 }}>{statusLabel}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
