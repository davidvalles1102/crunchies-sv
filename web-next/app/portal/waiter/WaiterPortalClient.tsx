'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt, calcTotals } from '@/lib/format'
import { getItemModifierGroups, modifiersExtraPrice, modifiersSummary, buildLineKey } from '@/lib/modifiers'
import type { Selection } from '@/lib/modifiers'
import { logoutPin, logEvent } from '@/lib/pin-auth'
import { usePinSession } from '@/lib/usePinSession'
import { useLiveRefetch } from '@/lib/useLiveRefetch'
import { useWakeLock } from '@/lib/useWakeLock'
import PinPad from '../PinPad'
import ModifierModal from '../../order/ModifierModal'
import { useToast } from '../../components/ToastProvider'
import type { Category, OrderMenuItem, ModifierGroup, RestaurantTable } from '@/lib/types'

type WaiterView = 'tables' | 'order' | 'pay'
type TableStatus = Record<string, 'in_kitchen' | 'ready'>

type TicketItem = {
  dbId: string; id: string; name: string; price: number; qty: number
  modifiers: Selection[]; lineKey: string
}
type ActiveOrder = {
  id: string; table_id: string; status: string
  items: TicketItem[]; subtotal: number; tax: number; total: number
}

const TABLE_CARD_CLS: Record<string, string> = {
  available:   'waiter-table-card--available',
  occupied:    'waiter-table-card--occupied',
  reserved:    'waiter-table-card--reserved',
  maintenance: 'waiter-table-card--maintenance',
}

function mapItems(raw: {
  id: string; menu_item_id: string; item_name: string; item_price: number
  quantity: number; order_item_modifiers: { option_name: string; price_delta: number }[]
}[]): TicketItem[] {
  return (raw || []).map((i) => {
    const modifiers: Selection[] = (i.order_item_modifiers || []).map((m) => ({
      option_name: m.option_name, price_delta: Number(m.price_delta),
    }))
    return {
      dbId: i.id, id: i.menu_item_id, name: i.item_name,
      price: Number(i.item_price), qty: i.quantity, modifiers,
      lineKey: buildLineKey(i.menu_item_id, modifiers),
    }
  })
}

export default function WaiterPortalClient() {
  const supabase = createClient()
  const toast = useToast()
  const [session, setSession] = usePinSession('waiter')
  const [view, setView] = useState<WaiterView>('tables')
  const [mobileTab, setMobileTab] = useState<'menu' | 'ticket'>('menu')

  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [tableStatus, setTableStatus] = useState<TableStatus>({})
  const [categories, setCategories] = useState<Category[]>([])
  const [menuItems, setMenuItems] = useState<OrderMenuItem[]>([])
  const [activeCat, setActiveCat] = useState('all')
  const [search, setSearch] = useState('')
  const [taxRate, setTaxRate] = useState(0)

  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null)
  // currentOrder = la comanda ABIERTA (editable). null si no hay comanda abierta.
  const [currentOrder, setCurrentOrder] = useState<ActiveOrder | null>(null)
  // tableOrders = TODAS las comandas activas de la mesa (open + in_kitchen + ready + delivered)
  const [tableOrders, setTableOrders] = useState<ActiveOrder[]>([])
  const [orderNotes, setOrderNotes] = useState('')
  const [modModal, setModModal] = useState<{
    item: { id: string; name: string; price: number }; groups: ModifierGroup[]
  } | null>(null)

  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'transfer'>('cash')
  const [cashIn, setCashIn] = useState('')
  const [paying, setPaying] = useState(false)
  const [readyAlert, setReadyAlert] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!session) return undefined
    loadAll()
    const channel = supabase
      .channel('waiter-portal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadTableStatus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, loadTables)
      .subscribe()
    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // Realtime por mesa: detecta cuando cocina marca una comanda como ready
  useEffect(() => {
    if (!selectedTable) return undefined
    const channel = supabase
      .channel(`waiter-table-${selectedTable.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
        filter: `table_id=eq.${selectedTable.id}`,
      }, (payload) => {
        const { id, status } = payload.new as { id: string; status: string }
        setTableOrders((prev) => prev.map((o) => o.id === id ? { ...o, status } : o))
        if (status === 'ready') {
          setReadyAlert((prev) => new Set([...prev, selectedTable.id]))
        }
      })
      .subscribe()
    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable?.id])

  // Respaldo si el socket de Realtime muere en segundo plano (movil): sin
  // esto, el mesero no se entera de que hay una orden lista para entregar
  // hasta que reabra el portal a mano.
  useLiveRefetch(() => {
    if (!session) return
    loadTableStatus()
    if (selectedTable && selectedTable.status === 'occupied') loadActiveOrders(selectedTable.id)
  }, { pollMs: 5000 })
  useWakeLock(!!session)

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

    if (session?.tenant_id) {
      const { data: settings } = await supabase.from('tenant_settings').select('tax_enabled, tax_rate')
        .eq('tenant_id', session.tenant_id).maybeSingle<{ tax_enabled: boolean; tax_rate: number }>()
      setTaxRate(settings?.tax_enabled ? Number(settings.tax_rate) : 0)
    }
  }

  async function loadTables() {
    const { data } = await supabase.from('restaurant_tables').select('*').order('number')
    setTables((data as RestaurantTable[]) || [])
  }

  async function loadTableStatus() {
    const { data } = await supabase
      .from('orders').select('table_id, status')
      .in('status', ['open', 'in_kitchen', 'ready'])
      .not('table_id', 'is', null)
    const map: TableStatus = {}
    const alerts = new Set<string>()
    ;(data || []).forEach((o: { table_id: string | null; status: string }) => {
      if (!o.table_id) return
      if (!map[o.table_id] || o.status === 'ready') map[o.table_id] = o.status as 'in_kitchen' | 'ready'
      if (o.status === 'ready') alerts.add(o.table_id)
    })
    setTableStatus(map)
    setReadyAlert(alerts)
  }

  // Carga TODAS las comandas activas de la mesa en orden cronológico
  async function loadActiveOrders(tableId: string) {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, order_item_modifiers(*))')
      .eq('table_id', tableId)
      .in('status', ['open', 'in_kitchen', 'ready', 'delivered'])
      .order('created_at', { ascending: true })
    const orders: ActiveOrder[] = (data || []).map((o) => ({
      id: o.id, table_id: tableId, status: o.status,
      items: mapItems(o.order_items), subtotal: o.subtotal ?? 0, tax: o.tax ?? 0, total: o.total ?? 0,
    }))
    setTableOrders(orders)
    setCurrentOrder(orders.find((o) => o.status === 'open') ?? null)
  }

  async function selectTable(table: RestaurantTable) {
    setSelectedTable(table)
    setCurrentOrder(null)
    setTableOrders([])
    setOrderNotes('')
    setCashIn('')
    setMobileTab('menu')
    if (table.status === 'occupied') {
      await loadActiveOrders(table.id)
    } else if (table.status === 'available') {
      await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', table.id)
      setTables((prev) => prev.map((t) => t.id === table.id ? { ...t, status: 'occupied' } : t))
    }
    setView('order')
  }

  async function addItem(item: { id: string; name: string; price: number }, modifiers: Selection[] = []) {
    if (!selectedTable) return
    const lineKey = buildLineKey(item.id, modifiers)
    const unitPrice = item.price + modifiersExtraPrice(modifiers)

    // Siempre opera sobre la comanda ABIERTA. Si no hay, crea una nueva.
    // NUNCA reabre una comanda in_kitchen/ready — esa ya la maneja cocina.
    let order = currentOrder
    if (!order) {
      const { data, error } = await supabase.from('orders').insert({
        table_id: selectedTable.id,
        waiter_id: null,
        order_type: 'dine_in',
        status: 'open',
        tenant_id: session?.tenant_id ?? null,
      }).select().single()
      if (error || !data) { toast(error?.message ?? 'Error al crear la orden', 'error'); return }
      order = { id: data.id, table_id: selectedTable.id, status: 'open', items: [], subtotal: 0, tax: 0, total: 0 }
      if (tableOrders.length === 0) {
        await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', selectedTable.id)
      }
    }

    const existing = order.items.find((i) => i.lineKey === lineKey)
    let newItems: TicketItem[]

    if (existing) {
      const newQty = existing.qty + 1
      await supabase.from('order_items').update({ quantity: newQty }).eq('id', existing.dbId)
      newItems = order.items.map((i) => i.lineKey === lineKey ? { ...i, qty: newQty } : i)
    } else {
      const { data, error } = await supabase.from('order_items').insert({
        order_id: order.id, menu_item_id: item.id,
        item_name: item.name, item_price: unitPrice, quantity: 1,
        tenant_id: session?.tenant_id ?? null,
      }).select().single()
      if (error || !data) { toast(error?.message ?? 'Error al agregar el ítem', 'error'); return }
      if (modifiers.length) {
        await supabase.from('order_item_modifiers').insert(
          modifiers.map((m) => ({ order_item_id: data.id, option_name: m.option_name, price_delta: m.price_delta, tenant_id: session?.tenant_id ?? null }))
        )
      }
      newItems = [...order.items, { dbId: data.id, id: item.id, name: item.name, price: unitPrice, qty: 1, modifiers, lineKey }]
    }

    const subtotal = newItems.reduce((s, i) => s + i.price * i.qty, 0)
    const { tax, total } = calcTotals(subtotal, taxRate)
    await supabase.from('orders').update({ subtotal, tax, total }).eq('id', order.id)
    const updated = { ...order, items: newItems, subtotal, tax, total }
    setCurrentOrder(updated)
    setTableOrders((prev) => {
      const exists = prev.find((o) => o.id === updated.id)
      return exists ? prev.map((o) => o.id === updated.id ? updated : o) : [...prev, updated]
    })
    setMobileTab('ticket')
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
    const { tax, total } = calcTotals(subtotal, taxRate)
    await supabase.from('orders').update({ subtotal, tax, total }).eq('id', currentOrder.id)
    const updated = { ...currentOrder, items: newItems, subtotal, tax, total }
    setCurrentOrder(updated)
    setTableOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o))
  }

  async function sendToKitchen() {
    if (!currentOrder?.items.length) return
    const { error } = await supabase.from('orders')
      .update({ status: 'in_kitchen', notes: orderNotes.trim() || null })
      .eq('id', currentOrder.id)
    if (error) { toast('Error al enviar a cocina', 'error'); return }
    setTableOrders((prev) => prev.map((o) => o.id === currentOrder.id ? { ...o, status: 'in_kitchen' } : o))
    setCurrentOrder(null) // no hay comanda abierta hasta que el mesero agregue más ítems
    logEvent(currentOrder.id, 'sent_to_kitchen', session!.staff_id, { table: selectedTable?.number })
    toast('✓ Pedido enviado a cocina')
    setOrderNotes('')
  }

  async function confirmDelivery(order: ActiveOrder) {
    const { error } = await supabase.from('orders').update({ status: 'delivered' }).eq('id', order.id)
    if (error) { toast('Error al confirmar entrega', 'error'); return }
    const updated = tableOrders.map((o) => o.id === order.id ? { ...o, status: 'delivered' } : o)
    setTableOrders(updated)
    const stillReady = updated.some((o) => o.status === 'ready')
    if (!stillReady) setReadyAlert((prev) => { const n = new Set(prev); n.delete(order.table_id); return n })
    logEvent(order.id, 'delivered', session!.staff_id, { table: selectedTable?.number })
    toast('✓ Entrega confirmada')
  }

  async function processPayment() {
    if (!selectedTable || tableOrders.length === 0) return
    setPaying(true)
    const grandTotal = tableOrders.reduce((s, o) => s + o.total, 0)
    const received = parseFloat(cashIn) || grandTotal

    // Vincula el pago a la caja abierta del tenant si existe (cash_sessions.sql) —
    // si esa migration no corrio en este entorno, la query falla en silencio y
    // se omite la clave, sin romper el cobro.
    let cashSessionId: string | null = null
    if (payMethod === 'cash' && session?.tenant_id) {
      const { data: openSession } = await supabase
        .from('cash_sessions')
        .select('id')
        .eq('tenant_id', session.tenant_id)
        .eq('status', 'open')
        .maybeSingle<{ id: string }>()
      cashSessionId = openSession?.id ?? null
    }

    const paymentPayload: Record<string, unknown> = {
      order_id: tableOrders[0].id,
      amount: grandTotal,
      method: payMethod,
      receipt_number: `REC-${Date.now()}`,
      change_amount: Math.max(0, received - grandTotal),
      tenant_id: session?.tenant_id ?? null,
    }
    if (cashSessionId) paymentPayload.cash_session_id = cashSessionId

    const { error } = await supabase.from('payments').insert(paymentPayload)
    if (error) { toast('Error al procesar el pago', 'error'); setPaying(false); return }

    await Promise.all(tableOrders.map((o) =>
      supabase.from('orders').update({ status: 'paid' }).eq('id', o.id)
    ))
    await supabase.from('restaurant_tables').update({ status: 'available' }).eq('id', selectedTable.id)
    tableOrders.forEach((o) => logEvent(o.id, 'paid', session!.staff_id, { table: selectedTable.number, method: payMethod }))
    logEvent(tableOrders[0].id, 'table_closed', session!.staff_id, { table: selectedTable.number })
    setTables((prev) => prev.map((t) => t.id === selectedTable.id ? { ...t, status: 'available' } : t))
    setReadyAlert((prev) => { const n = new Set(prev); n.delete(selectedTable.id); return n })
    toast(`✓ Mesa ${selectedTable.number} cobrada y cerrada`)
    setTableOrders([])
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
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  const itemCount = currentOrder?.items.reduce((s, i) => s + i.qty, 0) ?? 0
  const grandTotal = tableOrders.reduce((s, o) => s + o.total, 0)
  const grandSubtotal = tableOrders.reduce((s, o) => s + o.subtotal, 0)
  const change = Math.max(0, (parseFloat(cashIn) || 0) - grandTotal)
  const hasPayableItems = tableOrders.some((o) => o.items.length > 0)

  if (!session) return <PinPad portalName="Mesero" icon="🪑" expectedRole="waiter" onSuccess={setSession} />

  // ─── PAY VIEW ──────────────────────────────────────────────────
  if (view === 'pay' && hasPayableItems) {
    return (
      <div className="portal-body">
        <header className="portal-header">
          <div className="portal-header__left">
            <button className="btn btn-ghost btn-sm" onClick={() => setView('order')}>← Volver</button>
            <span className="portal-header__brand">Cobrar — Mesa {selectedTable?.number}</span>
          </div>
          <span className="portal-header__staff">👤 {session.full_name}</span>
        </header>

        <div className="portal-pay-wrap">
          <div className="card">
            <h4 style={{ marginBottom: 10 }}>🧾 Resumen de la mesa</h4>
            {tableOrders.map((o, idx) => (
              <div key={o.id}>
                {tableOrders.length > 1 && (
                  <div className="text-xs text-muted" style={{ margin: `${idx > 0 ? 10 : 0}px 0 4px` }}>
                    Comanda {idx + 1}
                  </div>
                )}
                {o.items.map((i) => (
                  <div key={i.dbId} className="portal-receipt-item text-sm">
                    <span>
                      {i.qty}× {i.name}
                      {i.modifiers?.length ? <><br /><span className="text-xs text-muted">{modifiersSummary(i.modifiers)}</span></> : null}
                    </span>
                    <span>{fmt.currency(i.price * i.qty)}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="portal-receipt-item mt-8"><span>Subtotal</span><span>{fmt.currency(grandSubtotal)}</span></div>
            <div className="portal-receipt-item portal-receipt-total">
              <span>TOTAL</span>
              <span className="neon-green">{fmt.currency(grandTotal)}</span>
            </div>
          </div>

          <div>
            <div className="form-label" style={{ marginBottom: 8 }}>Método de pago</div>
            <div className="portal-pay-methods">
              {(['cash', 'card', 'transfer'] as const).map((m) => (
                <button key={m} className={`portal-pay-method${payMethod === m ? ' active' : ''}`} onClick={() => setPayMethod(m)}>
                  {m === 'cash' ? '💵 Efectivo' : m === 'card' ? '💳 Tarjeta' : '📲 Transferencia'}
                </button>
              ))}
            </div>
          </div>

          {payMethod === 'cash' && (
            <div>
              <label className="form-label" htmlFor="waiter-cash-in" style={{ marginBottom: 6, display: 'block' }}>Efectivo recibido</label>
              <input
                id="waiter-cash-in" type="number" className="form-control" placeholder="0.00" step="0.01"
                style={{ fontSize: '1.3rem', padding: '12px 16px' }}
                value={cashIn} onChange={(e) => setCashIn(e.target.value)} autoFocus
              />
              {parseFloat(cashIn) > 0 && (
                <div className="portal-change mt-8">
                  Cambio: <span className="neon-amber" style={{ fontWeight: 700 }}>{fmt.currency(change)}</span>
                </div>
              )}
            </div>
          )}

          <button
            className="btn btn-primary btn-full"
            style={{ padding: 16, fontSize: '1rem', fontWeight: 700 }}
            disabled={paying || (payMethod === 'cash' && parseFloat(cashIn) < (grandTotal - 0.01))}
            onClick={processPayment}
          >
            {paying ? 'Procesando...' : `✓ Cobrar ${fmt.currency(grandTotal)} y cerrar mesa`}
          </button>
          {payMethod === 'cash' && parseFloat(cashIn) > 0 && parseFloat(cashIn) < grandTotal && (
            <p className="text-xs" style={{ textAlign: 'center', color: 'var(--danger)' }}>El efectivo no cubre el total</p>
          )}
        </div>
      </div>
    )
  }

  // ─── ORDER VIEW ────────────────────────────────────────────────
  if (view === 'order') {
    const inactiveOrders = tableOrders.filter((o) => o.status !== 'open')

    return (
      <div className="portal-body portal-order-shell">
        <header className="portal-header">
          <div className="portal-header__left">
            <button className="btn btn-ghost btn-sm" onClick={() => { setView('tables'); setSelectedTable(null); setCurrentOrder(null); setTableOrders([]) }}>← Mesas</button>
            <span className="portal-header__brand">Mesa {selectedTable?.number}</span>
            {tableOrders.length > 1 && <span className="badge badge-muted text-xs">{tableOrders.length} comandas</span>}
          </div>
          <div className="portal-header__right">
            <span className="portal-header__staff">👤 {session.full_name}</span>
            {hasPayableItems && (
              <button className="btn btn-outline btn-sm" onClick={() => setView('pay')}>💳 Cobrar</button>
            )}
          </div>
        </header>

        <div className="waiter-mob-tabs">
          <button className={`waiter-mob-tab${mobileTab === 'menu' ? ' active' : ''}`} onClick={() => setMobileTab('menu')}>
            🍽️ Menú
          </button>
          <button className={`waiter-mob-tab${mobileTab === 'ticket' ? ' active' : ''}`} onClick={() => setMobileTab('ticket')}>
            🛒 Pedido
            {itemCount > 0 && <span className="waiter-mob-badge">{itemCount}</span>}
          </button>
        </div>

        <div className="waiter-order-layout">
          {/* Menú */}
          <div className={`waiter-menu-panel${mobileTab === 'menu' ? ' mob-show' : ''}`}>
            <div className="waiter-cat-tabs">
              <button className={`portal-cat-tab${activeCat === 'all' ? ' active' : ''}`} onClick={() => setActiveCat('all')}>Todos</button>
              {categories.map((c) => (
                <button key={c.id} className={`portal-cat-tab${activeCat === c.id ? ' active' : ''}`} onClick={() => setActiveCat(c.id)}>
                  {c.icon} {c.name}
                </button>
              ))}
            </div>
            <div className="waiter-search">
              <input type="text" className="form-control" placeholder="🔍 Buscar platillo..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="waiter-items-grid">
              {filteredItems.length === 0 && <div className="waiter-items-empty">Sin resultados para &ldquo;{search}&rdquo;</div>}
              {filteredItems.map((item) => (
                <div key={item.id} className="waiter-item-card" onClick={() => handleItemClick(item)}>
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt={item.name} className="waiter-item-img"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <div className="waiter-item-img-placeholder" />
                  )}
                  <div className="waiter-item-body">
                    <div className="waiter-item-name">{item.name}</div>
                    {item.description && <div className="waiter-item-desc">{item.description}</div>}
                    <div className="waiter-item-price">{fmt.currency(item.price)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ticket */}
          <div className={`waiter-ticket${mobileTab === 'ticket' ? ' mob-show' : ''}`}>

            {/* Zona scrolleable: banners + header + ítems */}
            <div className="waiter-ticket-scroll">

              {/* Comandas no editables (in_kitchen / ready / delivered) */}
              {inactiveOrders.map((o) => (
                <div
                  key={o.id}
                  className={`waiter-comanda-banner${
                    o.status === 'in_kitchen' ? ' waiter-comanda-banner--kitchen'
                    : o.status === 'ready' ? ' waiter-comanda-banner--ready'
                    : ' waiter-comanda-banner--delivered'
                  }`}
                >
                  <div className="waiter-comanda-banner__header">
                    <span>
                      {o.status === 'in_kitchen' ? '🔥 En preparación'
                        : o.status === 'ready' ? '✅ Lista para entregar'
                        : '🍽️ Entregada'}
                    </span>
                    <span className="text-xs text-muted">{fmt.currency(o.total)}</span>
                  </div>
                  <div className="waiter-comanda-banner__items">
                    {o.items.map((i) => (
                      <div key={i.dbId} className="waiter-comanda-item">
                        <span className="waiter-comanda-item__qty">{i.qty}×</span>
                        <span>{i.name}</span>
                      </div>
                    ))}
                  </div>
                  {o.status === 'ready' && (
                    <button className="btn btn-outline btn-full btn-sm" style={{ marginTop: 6 }} onClick={() => confirmDelivery(o)}>
                      🍽️ Confirmar entrega en mesa
                    </button>
                  )}
                </div>
              ))}

              {/* Comanda abierta (editable) */}
              <div className="waiter-ticket-header">
                {currentOrder
                  ? `${itemCount} ítem${itemCount !== 1 ? 's' : ''} — comanda abierta`
                  : inactiveOrders.length > 0
                    ? '+ Nueva comanda para esta mesa'
                    : 'Selecciona platillos del menú'}
              </div>

              <div className="waiter-ticket-items">
                {currentOrder?.items.length ? (
                  currentOrder.items.map((i) => (
                    <div key={i.dbId} className="waiter-ticket-item">
                      <div className="waiter-ticket-qty">
                        <button className="portal-qty-btn minus" onClick={() => changeQty(i.dbId, -1)}>−</button>
                        <span className="portal-qty-num">{i.qty}</span>
                        <button className="portal-qty-btn" onClick={() => changeQty(i.dbId, 1)}>+</button>
                      </div>
                      <div className="waiter-ticket-item__name">
                        {i.name}
                        {i.modifiers?.length ? <div className="text-xs text-muted">{modifiersSummary(i.modifiers)}</div> : null}
                      </div>
                      <div className="waiter-ticket-item__price">{fmt.currency(i.price * i.qty)}</div>
                    </div>
                  ))
                ) : (
                  <div className="waiter-ticket-empty">
                    <span style={{ fontSize: '2rem' }}>🍽️</span>
                    <span className="text-muted text-sm">
                      {inactiveOrders.length > 0 ? 'Toca un platillo para agregar una nueva comanda' : 'Agrega platillos desde el menú'}
                    </span>
                  </div>
                )}
              </div>

            </div>{/* /waiter-ticket-scroll */}

            {currentOrder?.items.length ? (
              <>
                <div className="waiter-ticket-totals">
                  <div className="waiter-ticket-subtotal">
                    <span>Subtotal comanda</span><span>{fmt.currency(currentOrder.subtotal)}</span>
                  </div>
                  {tableOrders.length > 1 && (
                    <div className="waiter-ticket-subtotal" style={{ color: 'var(--text-secondary)' }}>
                      <span>Total mesa ({tableOrders.length} comandas)</span><span>{fmt.currency(grandTotal)}</span>
                    </div>
                  )}
                  <div className="waiter-ticket-total-row">
                    <span>TOTAL MESA</span>
                    <span className="waiter-ticket-total">{fmt.currency(grandTotal)}</span>
                  </div>
                </div>
                <div className="waiter-ticket-actions">
                  <input type="text" className="form-control" placeholder="Nota para cocina (opcional)..." aria-label="Nota para cocina"
                    value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} style={{ fontSize: '.8rem' }} />
                  <button className="btn btn-amber btn-full btn-sm" onClick={sendToKitchen}>
                    👨‍🍳 Enviar a Cocina
                  </button>
                  <button className="btn btn-primary btn-full btn-sm" onClick={() => setView('pay')}>
                    💳 Cobrar {fmt.currency(grandTotal)}
                  </button>
                </div>
              </>
            ) : hasPayableItems ? (
              <div className="waiter-ticket-actions">
                <button className="btn btn-primary btn-full btn-sm" onClick={() => setView('pay')}>
                  💳 Cobrar {fmt.currency(grandTotal)}
                </button>
              </div>
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

  // ─── TABLES VIEW ───────────────────────────────────────────────
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
              🔔 {readyAlert.size} lista{readyAlert.size !== 1 ? 's' : ''}
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={async () => { await logoutPin(); setSession(null) }}>⏻ Salir</button>
        </div>
      </header>

      <div className="portal-legend">
        <span className="portal-legend-item"><span className="portal-legend-dot dot-green" /> Disponible</span>
        <span className="portal-legend-item"><span className="portal-legend-dot dot-muted" /> Ocupada</span>
        <span className="portal-legend-item"><span className="portal-legend-dot dot-amber pulse-legend" /> Lista</span>
      </div>

      <div className="waiter-tables-grid">
        {tables.map((t) => {
          const orderSt = tableStatus[t.id]
          const isReady = readyAlert.has(t.id)
          const cardCls = isReady ? 'waiter-table-card--ready' : TABLE_CARD_CLS[t.status] ?? 'waiter-table-card--occupied'
          const label = isReady ? '✅ Lista'
            : t.status === 'available' ? 'Libre'
            : t.status === 'reserved' ? 'Reservada'
            : t.status === 'maintenance' ? 'Manten.'
            : orderSt === 'in_kitchen' ? '🔥 Cocina'
            : 'Ocupada'
          return (
            <div
              key={t.id}
              className={`waiter-table-card ${cardCls}`}
              onClick={() => t.status !== 'maintenance' ? selectTable(t) : undefined}
            >
              <div className="waiter-table-num">{t.number}</div>
              {t.location && <div className="waiter-table-loc">{t.location}</div>}
              <div className={`waiter-table-label${isReady ? ' label-ready' : ''}`}>{label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
