'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt, calcTotals } from '@/lib/format'
import { getItemModifierGroups, modifiersExtraPrice, modifiersSummary, buildLineKey } from '@/lib/modifiers'
import type { Selection } from '@/lib/modifiers'
import type { Category, OrderMenuItem, ModifierGroup, RestaurantTable } from '@/lib/types'
import { useAdmin, useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'
import ModifierModal from '../../../order/ModifierModal'
import { buildReceiptPDF } from './receipt-pdf'
import type { TicketItem, CurrentOrder, ReceiptData } from './types'

const POINT_VALUE = 0.01
const MAX_REDEEM_PERCENT = 0.5

const ORDER_STATUS_BANNER: Record<string, { text: string; cls: string }> = {
  in_kitchen: { text: '🟡 EN COCINA — preparando...', cls: 'status--kitchen' },
  ready: { text: '✅ LISTA — llevar a la mesa', cls: 'status--ready' },
  delivered: { text: '🍽️ ENTREGADA', cls: 'status--delivered' },
}

type OrderType = 'dine_in' | 'takeout' | 'delivery'

type RawOrderItemModifier = { option_name: string; price_delta: number }
type RawOrderItem = {
  id: string
  menu_item_id: string
  item_name: string
  item_price: number
  quantity: number
  notes: string | null
  order_item_modifiers: RawOrderItemModifier[]
}

function mapItems(rawItems: RawOrderItem[] | null): TicketItem[] {
  return (rawItems || []).map((i) => {
    const modifiers: Selection[] = (i.order_item_modifiers || []).map((m) => ({ option_name: m.option_name, price_delta: Number(m.price_delta) }))
    return {
      dbId: i.id,
      id: i.menu_item_id,
      name: i.item_name,
      price: Number(i.item_price),
      qty: i.quantity,
      notes: i.notes || '',
      modifiers,
      lineKey: buildLineKey(i.menu_item_id, modifiers),
    }
  })
}

export default function OrdersClient() {
  useRequireRole(['admin', 'waiter'])
  const { profile } = useAdmin()
  const supabase = createClient()
  const toast = useToast()

  const [categories, setCategories] = useState<Category[]>([])
  const [menuItems, setMenuItems] = useState<OrderMenuItem[]>([])
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [activeCat, setActiveCat] = useState('all')
  const [search, setSearch] = useState('')

  const [orderType, setOrderType] = useState<OrderType>('dine_in')
  const [selectedTableId, setSelectedTableId] = useState('')
  const [currentOrder, setCurrentOrder] = useState<CurrentOrder | null>(null)
  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [custAddress, setCustAddress] = useState('')
  const [orderNotes, setOrderNotes] = useState('')

  const [modalState, setModalState] = useState<{ item: { id: string; name: string; price: number }; groups: ModifierGroup[] } | null>(null)
  const [mobSheetOpen, setMobSheetOpen] = useState(false)

  const [payModalOpen, setPayModalOpen] = useState(false)
  const [selectedPayMethod, setSelectedPayMethod] = useState<'cash' | 'card' | 'transfer'>('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [payCustomerSearch, setPayCustomerSearch] = useState('')
  const [customerSuggestions, setCustomerSuggestions] = useState<{ id: string; full_name: string; loyalty_points: number }[]>([])
  const [linkedCustomer, setLinkedCustomer] = useState<{ id: string; name: string; points: number } | null>(null)
  const [pointsToRedeem, setPointsToRedeemRaw] = useState(0)
  const [paying, setPaying] = useState(false)

  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [lastReceiptData, setLastReceiptData] = useState<ReceiptData | null>(null)
  const [waModalOpen, setWaModalOpen] = useState(false)
  const [waPhone, setWaPhone] = useState('')

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null

  useEffect(() => {
    document.body.classList.add('pos-body')
    return () => { document.body.classList.remove('pos-body') }
  }, [])

  useEffect(() => {
    ;(async () => {
      const [{ data: tablesData }, [{ data: cats }, { data: items }]] = await Promise.all([
        supabase.from('restaurant_tables').select('*').order('number'),
        Promise.all([
          supabase.from('categories').select('*').eq('active', true).order('display_order'),
          supabase.from('menu_items').select('*').eq('available', true),
        ]),
      ])
      setTables((tablesData as RestaurantTable[]) || [])
      setCategories((cats as Category[]) || [])
      setMenuItems((items as OrderMenuItem[]) || [])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const orderId = currentOrder?.id
    if (!orderId) return undefined

    const channel = supabase
      .channel(`pos-order-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
        const newStatus = (payload.new as { status?: string })?.status
        if (!newStatus) return
        setCurrentOrder((prev) => (prev && prev.id === orderId ? { ...prev, status: newStatus } : prev))
        if (newStatus === 'ready') toast('✅ ¡Orden lista! Llevar a la mesa', 'success')
      })
      .subscribe()

    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrder?.id])

  const switchOrderType = (type: OrderType) => {
    setOrderType(type)
    setCurrentOrder(null)
    setSelectedTableId('')
  }

  const markTableOccupied = async (tableId: string) => {
    const t = tables.find((x) => x.id === tableId)
    if (!t || t.status === 'occupied') return
    await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', tableId)
    setTables((prev) => prev.map((x) => (x.id === tableId ? { ...x, status: 'occupied' } : x)))
  }

  const onTableChange = async (id: string) => {
    setSelectedTableId(id)
    setCurrentOrder(null)
    if (!id) return
    const table = tables.find((t) => t.id === id)

    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, order_item_modifiers(*))')
      .eq('table_id', id)
      .in('status', ['open', 'in_kitchen', 'ready', 'delivered'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (data?.length) {
      const o = data[0]
      setCurrentOrder({ id: o.id, table_id: id, status: o.status, items: mapItems(o.order_items), subtotal: o.subtotal ?? 0, tax: o.tax ?? 0, total: o.total ?? 0 })
      await markTableOccupied(id)
      toast(`Mesa ${table?.number}: orden activa cargada ✓`, 'success')
    } else {
      toast(`Mesa ${table?.number}: sin orden activa. Presiona "+ Nueva Orden" para comenzar.`, 'warning')
    }
  }

  const createNewOrder = async () => {
    if (orderType === 'dine_in' && !selectedTableId) { toast('Selecciona una mesa', 'warning'); return }
    if (orderType !== 'dine_in' && !custName.trim()) { toast('Ingresa el nombre del cliente', 'warning'); return }
    if (currentOrder) { toast('Ya hay una orden activa. Agrega platillos del menú.', 'warning'); return }

    const { data, error } = await supabase.from('orders').insert({
      table_id: orderType === 'dine_in' ? selectedTableId || null : null,
      waiter_id: profile.id,
      order_type: orderType,
      delivery_name: custName.trim() || null,
      delivery_phone: custPhone.trim() || null,
      delivery_address: orderType === 'delivery' ? (custAddress.trim() || null) : null,
      delivery_status: orderType !== 'dine_in' ? 'pending' : null,
      status: 'open',
    }).select().single()

    if (error) { toast('Error al crear orden', 'error'); return }
    setCurrentOrder({ id: data.id, table_id: orderType === 'dine_in' ? selectedTableId || null : null, status: 'open', items: [], subtotal: 0, tax: 0, total: 0 })
    if (orderType === 'dine_in' && selectedTableId) await markTableOccupied(selectedTableId)
    const toastMsg = orderType === 'dine_in' ? `Orden nueva — Mesa ${selectedTable?.number}` : orderType === 'takeout' ? 'Orden Para Llevar creada' : 'Orden Domicilio creada'
    toast(toastMsg)
  }

  const addItemToTicket = async (item: { id: string; name: string; price: number }, modifiers: Selection[] = []) => {
    if (!currentOrder) return
    const lineKey = buildLineKey(item.id, modifiers)
    const existing = currentOrder.items.find((i) => i.lineKey === lineKey)
    let newItems: TicketItem[]

    if (existing) {
      const newQty = existing.qty + 1
      await supabase.from('order_items').update({ quantity: newQty }).eq('id', existing.dbId)
      newItems = currentOrder.items.map((i) => (i.lineKey === lineKey ? { ...i, qty: newQty } : i))
    } else {
      const unitPrice = item.price + modifiersExtraPrice(modifiers)
      const { data } = await supabase.from('order_items').insert({
        order_id: currentOrder.id,
        menu_item_id: item.id,
        item_name: item.name,
        item_price: unitPrice,
        quantity: 1,
      }).select().single()

      if (modifiers.length && data) {
        await supabase.from('order_item_modifiers').insert(
          modifiers.map((m) => ({ order_item_id: data.id, option_name: m.option_name, price_delta: m.price_delta }))
        )
      }

      newItems = [...currentOrder.items, { dbId: data.id, id: item.id, name: item.name, price: unitPrice, qty: 1, notes: '', modifiers, lineKey }]
    }

    const subtotal = newItems.reduce((s, i) => s + i.price * i.qty, 0)
    const { tax, total } = calcTotals(subtotal)
    const reopenKitchen = currentOrder.status === 'ready' || currentOrder.status === 'delivered'
    const update: Record<string, unknown> = { subtotal, tax, total }
    if (reopenKitchen) update.status = 'in_kitchen'
    await supabase.from('orders').update(update).eq('id', currentOrder.id)
    setCurrentOrder({ ...currentOrder, status: reopenKitchen ? 'in_kitchen' : currentOrder.status, items: newItems, subtotal, tax, total })
    if (reopenKitchen) toast('Platillo agregado — orden reenviada a cocina 👨‍🍳', 'success')
  }

  const changeQty = async (dbId: string, delta: number) => {
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
      newItems = currentOrder.items.map((i) => (i.dbId === dbId ? { ...i, qty: newQty } : i))
    }

    const subtotal = newItems.reduce((s, i) => s + i.price * i.qty, 0)
    const { tax, total } = calcTotals(subtotal)
    const reopenKitchen = delta > 0 && (currentOrder.status === 'ready' || currentOrder.status === 'delivered')
    const update: Record<string, unknown> = { subtotal, tax, total }
    if (reopenKitchen) update.status = 'in_kitchen'
    await supabase.from('orders').update(update).eq('id', currentOrder.id)
    setCurrentOrder({ ...currentOrder, status: reopenKitchen ? 'in_kitchen' : currentOrder.status, items: newItems, subtotal, tax, total })
    if (reopenKitchen) toast('Cantidad aumentada — orden reenviada a cocina 👨‍🍳', 'success')
  }

  const handleItemClick = async (item: OrderMenuItem) => {
    if (!currentOrder) { toast(orderType === 'dine_in' ? 'Selecciona una mesa primero' : 'Crea una orden primero', 'warning'); return }
    const cartItem = { id: item.id, name: item.name, price: Number(item.price) }
    const groups = await getItemModifierGroups(item.id)
    if (groups.length) {
      setModalState({ item: cartItem, groups })
    } else {
      await addItemToTicket(cartItem)
    }
  }

  const sendToKitchen = async () => {
    if (!currentOrder) return
    const update: Record<string, unknown> = { status: 'in_kitchen', notes: orderNotes.trim() }
    if (orderType !== 'dine_in') update.delivery_status = 'pending'
    const { error } = await supabase.from('orders').update(update).eq('id', currentOrder.id)
    if (error) { toast('Error al enviar a cocina', 'error'); return }
    setCurrentOrder({ ...currentOrder, status: 'in_kitchen' })
    toast('Orden enviada a cocina 👨‍🍳', 'success')
  }

  const clearTicket = async () => {
    if (!confirm('¿Limpiar la orden actual?')) return

    const tableToCheck = (orderType === 'dine_in' && selectedTable) ? selectedTable : null

    setCurrentOrder(null)
    setSelectedTableId('')
    setCustName('')
    setCustPhone('')
    setCustAddress('')
    setOrderNotes('')

    if (tableToCheck) {
      const { data: active } = await supabase
        .from('orders')
        .select('id')
        .eq('table_id', tableToCheck.id)
        .in('status', ['open', 'in_kitchen', 'ready', 'delivered'])
        .limit(1)

      if (!active?.length) {
        await supabase.from('restaurant_tables').update({ status: 'available' }).eq('id', tableToCheck.id)
        setTables((prev) => prev.map((t) => (t.id === tableToCheck.id ? { ...t, status: 'available' } : t)))
        toast(`Mesa ${tableToCheck.number} liberada ✓`)
      }
    }
  }

  // ─── Pay modal ──────────────────────────────────────────────────
  const maxRedeemablePoints = () => {
    if (!linkedCustomer || !currentOrder) return 0
    const capByOrder = Math.floor((currentOrder.total * MAX_REDEEM_PERCENT) / POINT_VALUE)
    return Math.max(0, Math.min(linkedCustomer.points, capByOrder))
  }

  const effectiveTotal = () => {
    const discount = pointsToRedeem * POINT_VALUE
    return Math.max(0, (currentOrder?.total || 0) - discount)
  }

  const setPointsToRedeem = (pts: number) => {
    const max = maxRedeemablePoints()
    setPointsToRedeemRaw(Math.max(0, Math.min(pts || 0, max)))
  }

  const openPayModal = () => {
    if (!currentOrder?.items.length) return
    setPointsToRedeemRaw(0)
    setCashReceived('')
    setPayCustomerSearch('')
    setCustomerSuggestions([])
    setLinkedCustomer(null)
    setPayModalOpen(true)
  }

  const searchCustomers = async (q: string) => {
    setPayCustomerSearch(q)
    if (q.trim().length < 2) { setCustomerSuggestions([]); return }
    const { data } = await supabase.from('profiles').select('id, full_name, loyalty_points').eq('role', 'customer').ilike('full_name', `%${q.trim()}%`).limit(5)
    setCustomerSuggestions((data as { id: string; full_name: string; loyalty_points: number }[]) || [])
  }

  const selectCustomer = (c: { id: string; full_name: string; loyalty_points: number }) => {
    setLinkedCustomer({ id: c.id, name: c.full_name, points: c.loyalty_points })
    setPayCustomerSearch(c.full_name)
    setCustomerSuggestions([])
    setPointsToRedeemRaw(0)
  }

  const processPayment = async () => {
    if (!currentOrder) return
    setPaying(true)

    const chargeTotal = effectiveTotal()
    const received = parseFloat(cashReceived) || chargeTotal
    const change = Math.max(0, received - chargeTotal)
    const receipt = `REC-${Date.now()}`
    const redeemedPts = pointsToRedeem
    const redeemedValue = redeemedPts * POINT_VALUE

    const { error: payErr } = await supabase.from('payments').insert({
      order_id: currentOrder.id,
      processed_by: profile.id,
      amount: chargeTotal,
      method: selectedPayMethod,
      receipt_number: receipt,
      change_amount: change,
    })

    if (payErr) { toast('Error al procesar pago', 'error'); setPaying(false); return }

    await supabase.from('orders').update({ status: 'paid' }).eq('id', currentOrder.id)
    if (orderType === 'dine_in' && selectedTable) {
      await supabase.from('restaurant_tables').update({ status: 'available' }).eq('id', selectedTable.id)
      setTables((prev) => prev.map((t) => (t.id === selectedTable.id ? { ...t, status: 'available' } : t)))
    }

    let earnedPts = 0
    if (linkedCustomer) {
      let newBalance = linkedCustomer.points
      if (redeemedPts > 0) {
        await supabase.from('loyalty_transactions').insert({ customer_id: linkedCustomer.id, order_id: currentOrder.id, points: redeemedPts, type: 'redeemed' })
        newBalance -= redeemedPts
      }
      earnedPts = Math.floor(chargeTotal)
      if (earnedPts > 0) {
        await supabase.from('loyalty_transactions').insert({ customer_id: linkedCustomer.id, order_id: currentOrder.id, points: earnedPts, type: 'earned' })
        newBalance += earnedPts
      }
      await supabase.from('profiles').update({ loyalty_points: Math.max(0, newBalance) }).eq('id', linkedCustomer.id)
    }

    setPayModalOpen(false)
    setLastReceiptData({
      receiptNo: receipt,
      change,
      cashIn: parseFloat(cashReceived) || 0,
      items: currentOrder.items.map((i) => ({ ...i })),
      subtotal: currentOrder.subtotal,
      tax: currentOrder.tax,
      total: currentOrder.total,
      chargeTotal,
      redeemedPts,
      redeemedValue,
      earnedPts,
      customerName: linkedCustomer?.name ?? null,
      method: selectedPayMethod,
      orderType,
      tableNum: selectedTable?.number ?? null,
      custPhone: custPhone.trim() || null,
      date: new Date(),
    })
    setReceiptModalOpen(true)
    toast('Pago procesado ✓', 'success')

    setCurrentOrder(null)
    setSelectedTableId('')
    setLinkedCustomer(null)
    setPointsToRedeemRaw(0)
    setPaying(false)
  }

  const downloadPDF = () => {
    if (!lastReceiptData) return
    const doc = buildReceiptPDF(lastReceiptData)
    doc.save(`recibo-${lastReceiptData.receiptNo}.pdf`)
  }

  const openWhatsAppModal = () => {
    if (!lastReceiptData) return
    setWaPhone(lastReceiptData.custPhone ?? '')
    setWaModalOpen(true)
  }

  const confirmWhatsApp = () => {
    const raw = waPhone.trim().replace(/[\s\-()+]/g, '')
    if (!raw) { toast('Ingresa un número de WhatsApp', 'warning'); return }
    if (lastReceiptData) {
      const doc = buildReceiptPDF(lastReceiptData)
      doc.save(`recibo-${lastReceiptData.receiptNo}.pdf`)
      toast('PDF descargado — adjúntalo en WhatsApp 📎', 'success')
    }
    window.open(`https://wa.me/${raw}`, '_blank')
    setWaModalOpen(false)
  }

  const filteredItems = menuItems.filter((i) =>
    (activeCat === 'all' || i.category_id === activeCat) &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || (i.description || '').toLowerCase().includes(search.toLowerCase()))
  )

  const hasItems = !!currentOrder?.items.length
  const mobCartCount = currentOrder?.items.reduce((s, i) => s + i.qty, 0) ?? 0
  const chargeTotal = effectiveTotal()
  const changeAmount = Math.max(0, (parseFloat(cashReceived) || 0) - chargeTotal)

  return (
    <>
      <Topbar title="Terminal POS">
        <div className="pos-order-type-tabs">
          <button className={`pos-order-type-btn${orderType === 'dine_in' ? ' active' : ''}`} onClick={() => switchOrderType('dine_in')}>🪑 Mesa</button>
          <button className={`pos-order-type-btn${orderType === 'takeout' ? ' active' : ''}`} onClick={() => switchOrderType('takeout')}>🥡 Para Llevar</button>
          <button className={`pos-order-type-btn${orderType === 'delivery' ? ' active' : ''}`} onClick={() => switchOrderType('delivery')}>🛵 Domicilio</button>
        </div>
        {orderType === 'dine_in' && (
          <div className="table-picker">
            <label className="form-label" style={{ whiteSpace: 'nowrap' }}>Mesa:</label>
            <select className="form-control" style={{ width: 140 }} value={selectedTableId} onChange={(e) => onTableChange(e.target.value)}>
              <option value="">Seleccionar...</option>
              {tables.map((t) => {
                const suffix = t.status === 'occupied' ? ' — 🔴 Ocupada' : t.status === 'reserved' ? ' — 🟡 Reservada' : t.status === 'maintenance' ? ' — ⛔ Mantenimiento' : ''
                return <option key={t.id} value={t.id}>Mesa {t.number} ({t.location}){suffix}</option>
              })}
            </select>
          </div>
        )}
        <button className="btn btn-outline btn-sm" disabled={!!currentOrder} onClick={createNewOrder}>
          {currentOrder ? '✓ Orden cargada' : '+ Nueva Orden'}
        </button>
      </Topbar>

      <div className="pos-layout">
        <div className="pos-menu-panel">
          <div className="pos-cat-tabs">
            <button className={`pos-cat${activeCat === 'all' ? ' active' : ''}`} onClick={() => setActiveCat('all')}>Todos</button>
            {categories.map((c) => (
              <button key={c.id} className={`pos-cat${activeCat === c.id ? ' active' : ''}`} onClick={() => setActiveCat(c.id)}>{c.icon} {c.name}</button>
            ))}
          </div>
          <div className="pos-search-wrap">
            <input type="text" className="form-control" placeholder="Buscar platillo..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="pos-items-grid">
            {filteredItems.length === 0 ? (
              <p className="text-muted text-sm" style={{ gridColumn: '1/-1' }}>Sin resultados.</p>
            ) : (
              filteredItems.map((item) => (
                <div key={item.id} className="pos-item-card" onClick={() => handleItemClick(item)}>
                  <div className="pos-item-name">{item.name}</div>
                  <div className="pos-item-price">{fmt.currency(item.price)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`pos-ticket-panel${mobSheetOpen ? ' mob-open' : ''}`}>
          <div className="ticket-mob-handle" onClick={() => setMobSheetOpen(false)}>
            <div className="ticket-mob-handle__bar" />
            <span className="text-xs text-muted">Cerrar ✕</span>
          </div>
          <div className="ticket-header">
            <div className="ticket-info">
              <div className="ticket-table">{orderType === 'dine_in' ? (selectedTable ? `Mesa ${selectedTable.number}` : 'Mesa —') : orderType === 'takeout' ? '🥡 Para Llevar' : '🛵 Domicilio'}</div>
              <div className="ticket-waiter text-sm text-muted">{profile.full_name || '—'}</div>
            </div>
            <div className="ticket-order-id text-xs text-muted">{currentOrder ? `#${currentOrder.id.slice(0, 8)}` : ''}</div>
          </div>

          {currentOrder && ORDER_STATUS_BANNER[currentOrder.status] && (
            <div className={`order-status-banner ${ORDER_STATUS_BANNER[currentOrder.status].cls}`}>
              {ORDER_STATUS_BANNER[currentOrder.status].text}
            </div>
          )}

          {orderType !== 'dine_in' && (
            <div className="pos-customer-fields">
              <input type="text" className="form-control" placeholder="Nombre del cliente *" value={custName} onChange={(e) => setCustName(e.target.value)} />
              <input type="tel" className="form-control" placeholder="Teléfono *" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
              {orderType === 'delivery' && (
                <input type="text" className="form-control" placeholder="Dirección de entrega *" value={custAddress} onChange={(e) => setCustAddress(e.target.value)} />
              )}
            </div>
          )}

          <div className="ticket-items">
            {!currentOrder?.items.length ? (
              <div className="ticket-empty">
                <div style={{ fontSize: '2.5rem' }}>🧾</div>
                <p className="text-muted text-sm mt-8">Agrega platillos de la izquierda</p>
              </div>
            ) : (
              currentOrder.items.map((i) => (
                <div key={i.dbId} className="ticket-item">
                  <span className="ticket-item__name">
                    {i.name}
                    {i.modifiers?.length ? <div className="text-xs text-muted">{modifiersSummary(i.modifiers)}</div> : null}
                  </span>
                  <div className="ticket-item__qty">
                    <button className="qty-btn minus" onClick={() => changeQty(i.dbId, -1)}>−</button>
                    <span className="qty-num">{i.qty}</span>
                    <button className="qty-btn" onClick={() => changeQty(i.dbId, 1)}>+</button>
                  </div>
                  <span className="ticket-item__price">{fmt.currency(i.price * i.qty)}</span>
                  <span className="ticket-item__del" onClick={() => changeQty(i.dbId, -i.qty)}>✕</span>
                </div>
              ))
            )}
          </div>

          <div className="ticket-notes-wrap">
            <input type="text" className="form-control" placeholder="Nota para la cocina..." value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
          </div>

          <div className="ticket-totals">
            <div className="total-row"><span>Subtotal</span><span>{fmt.currency(currentOrder?.subtotal ?? 0)}</span></div>
            <div className="total-row"><span>IVA (8%)</span><span>{fmt.currency(currentOrder?.tax ?? 0)}</span></div>
            <div className="total-row total-row--final"><span>TOTAL</span><span className="neon-green">{fmt.currency(currentOrder?.total ?? 0)}</span></div>
          </div>

          <div className="ticket-actions">
            <button className="btn btn-amber btn-full" disabled={!hasItems} onClick={sendToKitchen}>👨‍🍳 Enviar a Cocina</button>
            <button className="btn btn-primary btn-full" disabled={!hasItems} onClick={openPayModal}>💳 Procesar Pago</button>
            <button className="btn btn-outline btn-full btn-sm" onClick={clearTicket}>🗑️ Limpiar Orden</button>
          </div>
        </div>
      </div>

      {modalState && (
        <ModifierModal
          item={modalState.item}
          groups={modalState.groups}
          onConfirm={(selections) => { addItemToTicket(modalState.item, selections); setModalState(null) }}
          onCancel={() => setModalState(null)}
        />
      )}

      {/* Pay modal */}
      <div className={`modal-backdrop${payModalOpen ? '' : ' hidden'}`}>
        <div className="modal">
          <div className="modal-header">
            <h3>Procesar Pago</h3>
            <button className="modal-close" onClick={() => setPayModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="pay-summary">
              <div className="pay-total-label">Total a cobrar</div>
              <div className="pay-total-amount neon-green">{fmt.currency(chargeTotal)}</div>
            </div>
            <div className="form-group mt-16">
              <label className="form-label">Método de pago</label>
              <div className="pay-methods">
                <button className={`pay-method${selectedPayMethod === 'cash' ? ' active' : ''}`} onClick={() => setSelectedPayMethod('cash')}>💵 Efectivo</button>
                <button className={`pay-method${selectedPayMethod === 'card' ? ' active' : ''}`} onClick={() => setSelectedPayMethod('card')}>💳 Tarjeta</button>
                <button className={`pay-method${selectedPayMethod === 'transfer' ? ' active' : ''}`} onClick={() => setSelectedPayMethod('transfer')}>📲 Transferencia</button>
              </div>
            </div>
            {selectedPayMethod === 'cash' && (
              <div>
                <div className="form-group mt-16">
                  <label className="form-label">Efectivo recibido</label>
                  <input type="number" className="form-control" placeholder="0.00" step="0.01" min="0" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} />
                </div>
                <div className="change-display mt-8">Cambio: <span className="neon-amber">{fmt.currency(changeAmount)}</span></div>
              </div>
            )}
            <div className="form-group mt-16" style={{ position: 'relative' }}>
              <label className="form-label">Cliente (opcional)</label>
              <input type="text" className="form-control" placeholder="Nombre o correo para puntos de lealtad..." value={payCustomerSearch} onChange={(e) => searchCustomers(e.target.value)} />
              {customerSuggestions.length > 0 && (
                <div className="suggestions-list" style={{ display: 'block' }}>
                  {customerSuggestions.map((c) => (
                    <div key={c.id} className="suggestion-item" onClick={() => selectCustomer(c)}>{c.full_name} — {c.loyalty_points} pts</div>
                  ))}
                </div>
              )}
            </div>

            {linkedCustomer && (
              <div className="form-group mt-16" style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12 }}>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Saldo: <strong>{linkedCustomer.points}</strong> pts ({fmt.currency(linkedCustomer.points * POINT_VALUE)})</span>
                  <button className="btn btn-outline btn-sm" onClick={() => setPointsToRedeem(maxRedeemablePoints())}>Usar máximo (50%)</button>
                </div>
                <div className="flex gap-8 mt-8">
                  <input type="number" className="form-control" placeholder="Puntos a canjear" min="0" step="1" value={pointsToRedeem || ''} onChange={(e) => setPointsToRedeem(parseInt(e.target.value) || 0)} />
                </div>
                <div className="text-sm mt-8">
                  {pointsToRedeem > 0 ? `Descuento: -${fmt.currency(pointsToRedeem * POINT_VALUE)} → Total: ${fmt.currency(effectiveTotal())}` : ''}
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={() => setPayModalOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" disabled={paying} onClick={processPayment}>✓ Confirmar Pago</button>
          </div>
        </div>
      </div>

      {/* Receipt modal */}
      <div className={`modal-backdrop${receiptModalOpen ? '' : ' hidden'}`}>
        <div className="modal">
          <div className="modal-header">
            <h3>Recibo</h3>
            <button className="modal-close" onClick={() => setReceiptModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            {lastReceiptData && (
              <div className="receipt">
                <div className="receipt__logo">CRUNCHIES</div>
                <div className="receipt__address">Su restaurante favorito<br />{fmt.datetime(new Date().toISOString())}</div>
                <hr className="receipt__divider" />
                <div>
                  {lastReceiptData.orderType === 'dine_in' ? `Mesa: ${lastReceiptData.tableNum ?? '—'}` : lastReceiptData.orderType === 'takeout' ? '🥡 Para Llevar' : '🛵 Domicilio'} | Mesero: {profile.full_name}
                </div>
                <div>Recibo: {lastReceiptData.receiptNo}</div>
                <hr className="receipt__divider" />
                {lastReceiptData.items.map((i) => (
                  <div key={i.dbId} className="receipt__item">
                    <span>{i.qty}x {i.name}{i.modifiers?.length ? <><br /><span style={{ fontSize: '.8em', opacity: .7 }}>{modifiersSummary(i.modifiers)}</span></> : null}</span>
                    <span>{fmt.currency(i.price * i.qty)}</span>
                  </div>
                ))}
                <hr className="receipt__divider" />
                <div className="receipt__item"><span>Subtotal</span><span>{fmt.currency(lastReceiptData.subtotal)}</span></div>
                <div className="receipt__item"><span>IVA 8%</span><span>{fmt.currency(lastReceiptData.tax)}</span></div>
                {lastReceiptData.redeemedPts > 0 && (
                  <div className="receipt__item"><span>Puntos canjeados (-{lastReceiptData.redeemedPts} pts)</span><span>-{fmt.currency(lastReceiptData.redeemedValue)}</span></div>
                )}
                <div className="receipt__item receipt__total"><span>TOTAL</span><span>{fmt.currency(lastReceiptData.chargeTotal)}</span></div>
                {lastReceiptData.method === 'cash' ? (
                  <>
                    <div className="receipt__item"><span>Efectivo</span><span>{fmt.currency(lastReceiptData.cashIn)}</span></div>
                    <div className="receipt__item"><span>Cambio</span><span>{fmt.currency(lastReceiptData.change)}</span></div>
                  </>
                ) : (
                  <div className="receipt__item"><span>Método</span><span>{lastReceiptData.method}</span></div>
                )}
                {lastReceiptData.customerName && (
                  <div style={{ marginTop: 6 }}>Puntos otorgados: +{lastReceiptData.earnedPts} pts a {lastReceiptData.customerName}</div>
                )}
                <hr className="receipt__divider" />
                <div className="receipt__thanks">¡Gracias por su visita!<br />Vuelva pronto 🌟</div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={() => setReceiptModalOpen(false)}>Cerrar</button>
            <button className="btn btn-whatsapp" onClick={openWhatsAppModal}>📱 WhatsApp</button>
            <button className="btn btn-primary" onClick={downloadPDF}>🖨️ Imprimir</button>
          </div>
        </div>
      </div>

      {/* WhatsApp modal */}
      <div className={`modal-backdrop${waModalOpen ? '' : ' hidden'}`}>
        <div className="modal" style={{ maxWidth: 380 }}>
          <div className="modal-header">
            <h3>📱 Enviar por WhatsApp</h3>
            <button className="modal-close" onClick={() => setWaModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <p className="text-sm text-muted" style={{ marginBottom: 14 }}>WhatsApp se abrirá con la factura lista para enviar. Solo presiona ▶ en WhatsApp.</p>
            <div className="form-group">
              <label className="form-label">Número del cliente</label>
              <input
                type="tel" className="form-control" placeholder="Ej: 573001234567"
                value={waPhone} onChange={(e) => setWaPhone(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmWhatsApp() }}
              />
              <div className="text-xs text-muted" style={{ marginTop: 4 }}>Sin espacios ni guiones · incluye código de país (57 Colombia, 503 El Salvador)</div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={() => setWaModalOpen(false)}>Cancelar</button>
            <button className="btn btn-whatsapp" onClick={confirmWhatsApp}>Abrir WhatsApp ▶</button>
          </div>
        </div>
      </div>

      <div className={`mob-backdrop${mobSheetOpen ? ' visible' : ''}`} onClick={() => setMobSheetOpen(false)} />
      <button className="mob-cart-fab" onClick={() => setMobSheetOpen(true)}>
        🧾&nbsp;Ticket <span className="mob-cart-fab__count">{mobCartCount}</span>
      </button>
    </>
  )
}
