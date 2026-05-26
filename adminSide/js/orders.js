import { supabase, calcTotals, fmt } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'

let profile      = null
let categories   = []
let menuItems    = []
let tables       = []
let currentOrder = null   // { id, table_id, items: [] }
let selectedTable= null
let activeCat    = 'all'
let selectedPayMethod = 'cash'
let linkedCustomer    = null
let orderType         = 'dine_in'   // 'dine_in' | 'takeout' | 'delivery'
let lastReceiptData   = null        // snapshot para WhatsApp

async function init() {
  const ctx = await initAdminShell(['admin', 'waiter'])
  if (!ctx) return
  profile = ctx.profile

  await Promise.all([loadTables(), loadMenu()])
  setupOrderTypeTabs()
  setupTicket()
  setupPayModal()
  setupMobileTicket()
}

function setupOrderTypeTabs() {
  document.querySelectorAll('.pos-order-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      orderType = btn.dataset.type
      document.querySelectorAll('.pos-order-type-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      const tableWrap   = document.getElementById('tablePickerWrap')
      const custFields  = document.getElementById('posCustomerFields')
      const addrField   = document.getElementById('posCustAddress')

      tableWrap.style.display  = orderType === 'dine_in' ? '' : 'none'
      custFields.classList.toggle('hidden', orderType === 'dine_in')
      addrField.classList.toggle('hidden', orderType !== 'delivery')

      // Reset current order when type changes
      currentOrder  = null
      selectedTable = null
      renderTicket()
    })
  })
}

// ─── Tables ───────────────────────────────────────────────────────
async function loadTables() {
  const { data } = await supabase.from('restaurant_tables').select('*').order('number')
  tables = data || []
  renderTablePicker()
}

function renderTablePicker() {
  const sel = document.getElementById('tablePicker')
  const currentVal = sel.value
  sel.innerHTML = '<option value="">Seleccionar...</option>'
  tables.forEach(t => {
    const opt = document.createElement('option')
    opt.value = t.id
    const statusSuffix = t.status === 'occupied'    ? ' — 🔴 Ocupada'
                       : t.status === 'reserved'    ? ' — 🟡 Reservada'
                       : t.status === 'maintenance' ? ' — ⛔ Mantenimiento'
                       : ''
    opt.textContent = `Mesa ${t.number} (${t.location})${statusSuffix}`
    sel.appendChild(opt)
  })
  if (currentVal) sel.value = currentVal
}

// ─── Menu ─────────────────────────────────────────────────────────
async function loadMenu() {
  const [{ data: cats }, { data: items }] = await Promise.all([
    supabase.from('categories').select('*').eq('active', true).order('display_order'),
    supabase.from('menu_items').select('*').eq('available', true)
  ])
  categories = cats || []
  menuItems  = items || []

  const tabsEl = document.getElementById('posCatTabs')
  categories.forEach(cat => {
    const btn = document.createElement('button')
    btn.className = 'pos-cat'
    btn.dataset.cat = cat.id
    btn.textContent = `${cat.icon} ${cat.name}`
    btn.addEventListener('click', () => { activeCat = cat.id; renderMenuGrid(); setActiveTab(btn) })
    tabsEl.appendChild(btn)
  })

  document.querySelector('.pos-cat[data-cat="all"]').addEventListener('click', (e) => {
    activeCat = 'all'; renderMenuGrid(); setActiveTab(e.currentTarget)
  })

  document.getElementById('posSearch').addEventListener('input', () => renderMenuGrid())

  renderMenuGrid()
}

function setActiveTab(btn) {
  document.querySelectorAll('.pos-cat').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
}

function renderMenuGrid() {
  const q = document.getElementById('posSearch').value.toLowerCase()
  const filtered = menuItems.filter(i =>
    (activeCat === 'all' || i.category_id === activeCat) &&
    (i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
  )

  const grid = document.getElementById('posItemsGrid')
  if (!filtered.length) {
    grid.innerHTML = '<p class="text-muted text-sm" style="grid-column:1/-1">Sin resultados.</p>'
    return
  }

  grid.innerHTML = filtered.map(item => `
    <div class="pos-item-card ${!item.available ? 'pos-item-card--unavail' : ''}"
         data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">
      <div class="pos-item-name">${item.name}</div>
      <div class="pos-item-price">${fmt.currency(item.price)}</div>
    </div>
  `).join('')

  grid.querySelectorAll('.pos-item-card').forEach(card => {
    card.addEventListener('click', () => {
      if (!currentOrder) { toast(orderType === 'dine_in' ? 'Selecciona una mesa primero' : 'Crea una orden primero', 'warning'); return }
      addItemToTicket({
        id:    card.dataset.id,
        name:  card.dataset.name,
        price: parseFloat(card.dataset.price)
      })
    })
  })
}

// ─── Ticket ───────────────────────────────────────────────────────
function setupTicket() {
  document.getElementById('tablePicker').addEventListener('change', async (e) => {
    selectedTable = tables.find(t => t.id === e.target.value) || null
    if (!selectedTable) return
    await loadOrCreateOrder()
  })

  document.getElementById('newOrderBtn').addEventListener('click', async () => {
    if (orderType === 'dine_in' && !selectedTable) { toast('Selecciona una mesa', 'warning'); return }
    if (orderType !== 'dine_in') {
      const name = document.getElementById('posCustName').value.trim()
      if (!name) { toast('Ingresa el nombre del cliente', 'warning'); return }
    }
    currentOrder = null
    await loadOrCreateOrder(true)
  })

  document.getElementById('sendKitchenBtn').addEventListener('click', sendToKitchen)
  document.getElementById('payBtn').addEventListener('click', openPayModal)
  document.getElementById('clearTicketBtn').addEventListener('click', clearTicket)
}

async function loadOrCreateOrder(forceNew = false) {
  if (!forceNew) {
    // Solo buscar — nunca crear automáticamente al seleccionar una mesa
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('table_id', selectedTable.id)
      .in('status', ['open', 'in_kitchen', 'ready', 'delivered'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) { toast('Error al cargar la orden', 'error'); return }

    if (data?.length) {
      const o = data[0]
      currentOrder = {
        id:       o.id,
        table_id: selectedTable.id,
        items:    mapItems(o.order_items),
        subtotal: o.subtotal ?? 0,
        tax:      o.tax      ?? 0,
        total:    o.total    ?? 0
      }
      await markTableOccupied(selectedTable.id)
      renderTicket()
      return
    }

    // Ninguna orden activa — mostrar ticket vacío sin crear nada
    currentOrder = null
    renderTicket()
    toast(`Mesa ${selectedTable.number}: sin orden activa. Usa "+ Nueva Orden" para crear una.`, 'warning')
    return
  }

  // ── Solo se llega aquí desde el botón "+ Nueva Orden" ────────────
  const custName    = document.getElementById('posCustName')?.value.trim()    || null
  const custPhone   = document.getElementById('posCustPhone')?.value.trim()   || null
  const custAddress = document.getElementById('posCustAddress')?.value.trim() || null

  const { data, error } = await supabase.from('orders').insert({
    table_id:         orderType === 'dine_in' ? selectedTable?.id : null,
    waiter_id:        profile.id,
    order_type:       orderType,
    delivery_name:    custName,
    delivery_phone:   custPhone,
    delivery_address: orderType === 'delivery' ? custAddress : null,
    delivery_status:  orderType !== 'dine_in' ? 'pending' : null,
    status:           'open'
  }).select().single()

  if (error) { toast('Error al crear orden', 'error'); return }
  currentOrder = { id: data.id, table_id: selectedTable?.id ?? null, items: [] }
  if (orderType === 'dine_in' && selectedTable) await markTableOccupied(selectedTable.id)
  renderTicket()
  const toastMsg = orderType === 'dine_in' ? `Orden nueva — Mesa ${selectedTable.number}` : orderType === 'takeout' ? 'Orden Para Llevar creada' : 'Orden Domicilio creada'
  toast(toastMsg)
}

async function markTableOccupied(tableId) {
  const t = tables.find(x => x.id === tableId)
  if (!t || t.status === 'occupied') return
  await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', tableId)
  t.status = 'occupied'
  renderTablePicker()
  document.getElementById('tablePicker').value = tableId
}

function mapItems(rawItems) {
  return (rawItems || []).map(i => ({
    dbId:  i.id,
    id:    i.menu_item_id,
    name:  i.item_name,
    price: parseFloat(i.item_price),
    qty:   i.quantity,
    notes: i.notes || ''
  }))
}

async function addItemToTicket(item) {
  const existing = currentOrder.items.find(i => i.id === item.id)
  if (existing) {
    existing.qty++
    await supabase.from('order_items').update({ quantity: existing.qty }).eq('id', existing.dbId)
  } else {
    const { data } = await supabase.from('order_items').insert({
      order_id:     currentOrder.id,
      menu_item_id: item.id,
      item_name:    item.name,
      item_price:   item.price,
      quantity:     1
    }).select().single()
    currentOrder.items.push({ dbId: data.id, ...item, qty: 1, notes: '' })
  }
  await recalcOrder()
  renderTicket()
}

async function changeQty(dbId, delta) {
  const it = currentOrder.items.find(i => i.dbId === dbId)
  if (!it) return
  it.qty += delta
  if (it.qty <= 0) {
    await supabase.from('order_items').delete().eq('id', dbId)
    currentOrder.items = currentOrder.items.filter(i => i.dbId !== dbId)
  } else {
    await supabase.from('order_items').update({ quantity: it.qty }).eq('id', dbId)
  }
  await recalcOrder()
  renderTicket()
}

async function recalcOrder() {
  const subtotal = currentOrder.items.reduce((s, i) => s + i.price * i.qty, 0)
  const { tax, total } = calcTotals(subtotal)
  await supabase.from('orders').update({ subtotal, tax, total }).eq('id', currentOrder.id)
  currentOrder.subtotal = subtotal
  currentOrder.tax      = tax
  currentOrder.total    = total
}

function renderTicket() {
  const table  = selectedTable
  const typeLabels = { dine_in: table ? `Mesa ${table.number}` : 'Mesa —', takeout: '🥡 Para Llevar', delivery: '🛵 Domicilio' }
  document.getElementById('ticketTable').textContent   = typeLabels[orderType]
  document.getElementById('ticketWaiter').textContent  = profile.full_name || '—'
  document.getElementById('ticketOrderId').textContent = currentOrder ? `#${currentOrder.id.slice(0,8)}` : ''

  const itemsEl = document.getElementById('ticketItems')
  if (!currentOrder?.items.length) {
    itemsEl.innerHTML = `<div class="ticket-empty"><div style="font-size:2.5rem">🧾</div><p class="text-muted text-sm mt-8">Agrega platillos de la izquierda</p></div>`
  } else {
    itemsEl.innerHTML = currentOrder.items.map(i => `
      <div class="ticket-item">
        <span class="ticket-item__name">${i.name}</span>
        <div class="ticket-item__qty">
          <button class="qty-btn minus" onclick="changeQty('${i.dbId}', -1)">−</button>
          <span class="qty-num">${i.qty}</span>
          <button class="qty-btn" onclick="changeQty('${i.dbId}', 1)">+</button>
        </div>
        <span class="ticket-item__price">${fmt.currency(i.price * i.qty)}</span>
        <span class="ticket-item__del" onclick="changeQty('${i.dbId}', -${i.qty})">✕</span>
      </div>
    `).join('')
  }

  const sub = currentOrder?.subtotal ?? 0
  const tax = currentOrder?.tax      ?? 0
  const tot = currentOrder?.total    ?? 0
  document.getElementById('subtotal').textContent = fmt.currency(sub)
  document.getElementById('tax').textContent      = fmt.currency(tax)
  document.getElementById('total').textContent    = fmt.currency(tot)

  const hasItems = !!currentOrder?.items.length
  document.getElementById('sendKitchenBtn').disabled = !hasItems
  document.getElementById('payBtn').disabled         = !hasItems

  updateMobFab()
}

async function sendToKitchen() {
  if (!currentOrder) return
  const notes = document.getElementById('orderNotes').value.trim()
  const update = { status: 'in_kitchen', notes }
  if (orderType !== 'dine_in') update.delivery_status = 'preparing'
  const { error } = await supabase.from('orders').update(update).eq('id', currentOrder.id)
  if (error) { toast('Error al enviar a cocina', 'error'); return }
  toast('Orden enviada a cocina 👨‍🍳', 'success')
  document.getElementById('sendKitchenBtn').disabled = true
}

function clearTicket() {
  if (!confirm('¿Limpiar la orden actual?')) return
  currentOrder = null
  selectedTable = null
  document.getElementById('tablePicker').value = ''
  document.getElementById('posCustName').value    = ''
  document.getElementById('posCustPhone').value   = ''
  document.getElementById('posCustAddress').value = ''
  document.getElementById('orderNotes').value     = ''
  renderTicket()
}

// ─── Mobile Ticket Sheet ─────────────────────────────────────────
function setupMobileTicket() {
  const fab      = document.getElementById('mobCartFab')
  const backdrop = document.getElementById('mobBackdrop')
  const panel    = document.querySelector('.pos-ticket-panel')
  const handle   = document.getElementById('ticketMobHandle')
  if (!fab || !panel) return

  const openSheet  = () => { panel.classList.add('mob-open');    backdrop.classList.add('visible') }
  const closeSheet = () => { panel.classList.remove('mob-open'); backdrop.classList.remove('visible') }

  fab.addEventListener('click', openSheet)
  backdrop.addEventListener('click', closeSheet)
  handle?.addEventListener('click', closeSheet)
}

function updateMobFab() {
  const countEl = document.getElementById('mobCartCount')
  if (!countEl) return
  const n = currentOrder?.items.reduce((s, i) => s + i.qty, 0) ?? 0
  countEl.textContent = n
}

// ─── Pay Modal ────────────────────────────────────────────────────
function setupPayModal() {
  document.getElementById('payBtn').addEventListener('click', openPayModal)
  document.getElementById('payModalClose').addEventListener('click', () => document.getElementById('payModal').classList.add('hidden'))
  document.getElementById('payCancel').addEventListener('click',      () => document.getElementById('payModal').classList.add('hidden'))
  document.getElementById('receiptClose').addEventListener('click',   () => document.getElementById('receiptModal').classList.add('hidden'))
  document.getElementById('receiptClose2').addEventListener('click',  () => document.getElementById('receiptModal').classList.add('hidden'))

  // WhatsApp modal
  document.getElementById('waModalClose').addEventListener('click', () => document.getElementById('waModal').classList.add('hidden'))
  document.getElementById('waCancel').addEventListener('click',     () => document.getElementById('waModal').classList.add('hidden'))
  document.getElementById('waConfirm').addEventListener('click',    confirmWhatsApp)
  document.getElementById('waPhone').addEventListener('keydown', e => { if (e.key === 'Enter') confirmWhatsApp() })

  document.querySelectorAll('.pay-method').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-method').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      selectedPayMethod = btn.dataset.method
      document.getElementById('cashSection').style.display = selectedPayMethod === 'cash' ? '' : 'none'
    })
  })

  document.getElementById('cashReceived').addEventListener('input', updateChange)
  document.getElementById('confirmPayBtn').addEventListener('click', processPayment)

  // Customer search
  document.getElementById('payCustomerSearch').addEventListener('input', searchCustomers)
}

function openPayModal() {
  if (!currentOrder?.items.length) return
  document.getElementById('payTotalAmount').textContent = fmt.currency(currentOrder.total)
  document.getElementById('payModal').classList.remove('hidden')
  document.getElementById('cashReceived').value = ''
  document.getElementById('changeAmount').textContent = '$0.00'
}

function updateChange() {
  const received = parseFloat(document.getElementById('cashReceived').value) || 0
  const change   = Math.max(0, received - (currentOrder?.total || 0))
  document.getElementById('changeAmount').textContent = fmt.currency(change)
}

async function searchCustomers() {
  const q = document.getElementById('payCustomerSearch').value.trim()
  const suggestEl = document.getElementById('customerSuggestions')
  if (q.length < 2) { suggestEl.style.display = 'none'; return }

  const { data } = await supabase.from('profiles')
    .select('id, full_name, loyalty_points')
    .eq('role', 'customer')
    .ilike('full_name', `%${q}%`)
    .limit(5)

  if (!data?.length) { suggestEl.style.display = 'none'; return }

  suggestEl.style.display = 'block'
  suggestEl.innerHTML = data.map(c => `
    <div class="suggestion-item" data-id="${c.id}" data-name="${c.full_name}" data-points="${c.loyalty_points}">
      ${c.full_name} — ${c.loyalty_points} pts
    </div>
  `).join('')

  suggestEl.querySelectorAll('.suggestion-item').forEach(el => {
    el.addEventListener('click', () => {
      linkedCustomer = { id: el.dataset.id, name: el.dataset.name, points: parseInt(el.dataset.points) }
      document.getElementById('payCustomerSearch').value = el.dataset.name
      suggestEl.style.display = 'none'
    })
  })
}

async function processPayment() {
  if (!currentOrder) return
  const btn = document.getElementById('confirmPayBtn')
  btn.disabled = true

  const received = parseFloat(document.getElementById('cashReceived').value) || currentOrder.total
  const change   = Math.max(0, received - currentOrder.total)
  const receipt  = `REC-${Date.now()}`

  const { error: payErr } = await supabase.from('payments').insert({
    order_id:      currentOrder.id,
    processed_by:  profile.id,
    amount:        currentOrder.total,
    method:        selectedPayMethod,
    receipt_number:receipt,
    change_amount: change
  })

  if (payErr) { toast('Error al procesar pago', 'error'); btn.disabled = false; return }

  await supabase.from('orders').update({ status: 'paid' }).eq('id', currentOrder.id)
  if (orderType === 'dine_in' && selectedTable) {
    await supabase.from('restaurant_tables').update({ status: 'available' }).eq('id', selectedTable.id)
    const t = tables.find(x => x.id === selectedTable.id)
    if (t) t.status = 'available'
  }

  // Award loyalty points (1 pt per $1 spent)
  if (linkedCustomer) {
    const pts = Math.floor(currentOrder.total)
    await supabase.from('loyalty_transactions').insert({ customer_id: linkedCustomer.id, order_id: currentOrder.id, points: pts, type: 'earned' })
    await supabase.from('profiles').update({ loyalty_points: linkedCustomer.points + pts }).eq('id', linkedCustomer.id)
  }

  document.getElementById('payModal').classList.add('hidden')
  renderReceipt(receipt, change)
  toast('Pago procesado ✓', 'success')

  currentOrder  = null
  selectedTable = null
  linkedCustomer= null
  document.getElementById('tablePicker').value = ''
  renderTablePicker()
  renderTicket()
  btn.disabled = false
}

function renderReceipt(receiptNo, change) {
  const items = currentOrder?.items ?? []

  // ── Guardar snapshot para WhatsApp ───────────────────────────────
  lastReceiptData = {
    receiptNo,
    change,
    cashIn:   parseFloat(document.getElementById('cashReceived').value) || 0,
    items:    items.map(i => ({ ...i })),
    subtotal: currentOrder?.subtotal ?? 0,
    tax:      currentOrder?.tax      ?? 0,
    total:    currentOrder?.total    ?? 0,
    method:   selectedPayMethod,
    orderType,
    tableNum: selectedTable?.number  ?? null,
    custPhone: document.getElementById('posCustPhone')?.value.trim() || null,
    date:     new Date()
  }

  document.getElementById('receiptContent').innerHTML = `
    <div class="receipt">
      <div class="receipt__logo">Neón y Sabor Mi Rancho</div>
      <div class="receipt__address">Su restaurante favorito<br>${fmt.datetime(new Date())}</div>
      <hr class="receipt__divider">
      <div>${orderType === 'dine_in' ? `Mesa: ${selectedTable?.number ?? '—'}` : orderType === 'takeout' ? '🥡 Para Llevar' : '🛵 Domicilio'} | Mesero: ${profile.full_name}</div>
      <div>Recibo: ${receiptNo}</div>
      <hr class="receipt__divider">
      ${items.map(i => `<div class="receipt__item"><span>${i.qty}x ${i.name}</span><span>${fmt.currency(i.price * i.qty)}</span></div>`).join('')}
      <hr class="receipt__divider">
      <div class="receipt__item"><span>Subtotal</span><span>${fmt.currency(currentOrder?.subtotal ?? 0)}</span></div>
      <div class="receipt__item"><span>IVA 8%</span><span>${fmt.currency(currentOrder?.tax ?? 0)}</span></div>
      <div class="receipt__item receipt__total"><span>TOTAL</span><span>${fmt.currency(currentOrder?.total ?? 0)}</span></div>
      ${selectedPayMethod === 'cash' ? `
        <div class="receipt__item"><span>Efectivo</span><span>${fmt.currency(parseFloat(document.getElementById('cashReceived').value)||0)}</span></div>
        <div class="receipt__item"><span>Cambio</span><span>${fmt.currency(change)}</span></div>
      ` : `<div class="receipt__item"><span>Método</span><span>${selectedPayMethod}</span></div>`}
      ${linkedCustomer ? `<div style="margin-top:6px">Puntos otorgados: +${Math.floor(currentOrder?.total??0)} pts a ${linkedCustomer.name}</div>` : ''}
      <hr class="receipt__divider">
      <div class="receipt__thanks">¡Gracias por su visita!<br>Vuelva pronto 🌟</div>
    </div>`
  document.getElementById('receiptModal').classList.remove('hidden')
}

// ─── PDF Receipt ──────────────────────────────────────────────────
function buildReceiptPDF(data) {
  if (!window.jspdf) return null
  const { jsPDF } = window.jspdf

  // Dynamic height based on number of items (with text-wrap estimate)
  const itemsH = data.items.reduce((h, i) => h + Math.ceil(i.name.length / 26) * 5.2, 0)
  const pageH  = Math.max(170, 118 + itemsH)

  const doc = new jsPDF({ unit: 'mm', format: [80, pageH] })
  const W = 80
  let y = 0

  // ── helpers ──────────────────────────────────────────────────
  const fnt = (size, style = 'normal', r = 30, g = 30, b = 30) => {
    doc.setFontSize(size); doc.setFont('helvetica', style); doc.setTextColor(r, g, b)
  }
  const ctr = (text, size, bold = false) => {
    fnt(size, bold ? 'bold' : 'normal')
    doc.text(text, W / 2, y, { align: 'center' })
    y += size * 0.35 + 1.5
  }
  const hr = (light = false) => {
    doc.setDrawColor(light ? 220 : 170, light ? 220 : 170, light ? 220 : 170)
    doc.line(5, y, W - 5, y); y += 4
  }
  const row2 = (left, right, size = 8.5, bold = false) => {
    fnt(size, bold ? 'bold' : 'normal', bold ? 20 : 60, bold ? 20 : 60, bold ? 20 : 60)
    doc.text(String(left),  5,     y)
    doc.text(String(right), W - 5, y, { align: 'right' })
    y += size * 0.38 + 1.5
  }

  // ── Top green bar ─────────────────────────────────────────────
  doc.setFillColor(37, 211, 102)
  doc.rect(0, 0, W, 3.5, 'F')
  y = 11

  // ── Restaurant name ───────────────────────────────────────────
  fnt(15, 'bold', 20, 20, 20)
  ctr('NEÓN Y SABOR', 15, true)
  fnt(8.5, 'normal', 100, 100, 100)
  ctr('MI RANCHO', 8.5)
  y += 1; hr()

  // ── Meta ──────────────────────────────────────────────────────
  const locLabel = data.orderType === 'dine_in'
    ? `Mesa ${data.tableNum ?? '—'}`
    : data.orderType === 'takeout' ? 'Para Llevar' : 'Domicilio'
  row2('Recibo:',  data.receiptNo,           8)
  row2('Fecha:',   fmt.datetime(data.date),  8)
  row2('Pedido:',  locLabel,                 8)
  y += 1; hr()

  // ── Items ─────────────────────────────────────────────────────
  fnt(7.5, 'bold', 90, 90, 90)
  doc.text('DESCRIPCIÓN', 5, y)
  doc.text('VALOR',       W - 5, y, { align: 'right' })
  y += 5; hr(true)

  data.items.forEach(item => {
    const label = `${item.qty}× ${item.name}`
    const price = fmt.currency(item.price * item.qty)
    fnt(8.5, 'normal', 30, 30, 30)
    const lines = doc.splitTextToSize(label, 50)
    lines.forEach((ln, idx) => {
      doc.text(ln, idx === 0 ? 5 : 8, y)
      if (idx === 0) { fnt(8.5, 'bold', 30, 30, 30); doc.text(price, W - 5, y, { align: 'right' }) }
      y += 5
    })
  })
  y += 1; hr()

  // ── Totals ────────────────────────────────────────────────────
  row2('Subtotal', fmt.currency(data.subtotal), 8.5)
  row2('IVA (8%)', fmt.currency(data.tax),      8.5)
  y += 1
  doc.setFillColor(245, 245, 245); doc.rect(3, y - 3.5, W - 6, 9.5, 'F')
  row2('TOTAL', fmt.currency(data.total), 12, true)
  y += 2; hr()

  // ── Payment ───────────────────────────────────────────────────
  const mLabel = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', points: 'Puntos' }
  row2('Método de pago:', mLabel[data.method] ?? data.method, 8.5)
  if (data.method === 'cash' && data.change > 0) {
    row2('Efectivo recibido:', fmt.currency(data.cashIn), 8)
    row2('Cambio:',            fmt.currency(data.change), 8)
  }
  hr()

  // ── Footer ────────────────────────────────────────────────────
  y += 2
  fnt(10, 'bold', 30, 30, 30); ctr('¡Gracias por su visita!', 10, true)
  fnt(7.5, 'normal', 150, 150, 150); ctr('neon-y-sabor.vercel.app', 7.5)

  // ── Bottom green bar ──────────────────────────────────────────
  doc.setFillColor(37, 211, 102)
  doc.rect(0, pageH - 3.5, W, 3.5, 'F')

  return doc
}

window.downloadPDF = function () {
  if (!lastReceiptData) return
  const doc = buildReceiptPDF(lastReceiptData)
  if (doc) doc.save(`recibo-${lastReceiptData.receiptNo}.pdf`)
}

// ─── WhatsApp ─────────────────────────────────────────────────────
function openWhatsAppModal() {
  if (!lastReceiptData) return
  // Pre-llenar con el teléfono del cliente si existe (takeout / delivery)
  document.getElementById('waPhone').value = lastReceiptData.custPhone ?? ''
  document.getElementById('waModal').classList.remove('hidden')
  document.getElementById('waPhone').focus()
}

function buildWhatsAppText(d) {
  const methodLabels = { cash: 'Efectivo 💵', card: 'Tarjeta 💳', transfer: 'Transferencia 📲', points: 'Puntos ⭐' }
  const locationLine = d.orderType === 'dine_in'
    ? `Mesa: ${d.tableNum ?? '—'}`
    : d.orderType === 'takeout' ? '🥡 Para Llevar' : '🛵 Domicilio'

  const itemLines = d.items
    .map(i => `${i.qty}x ${i.name}  ${fmt.currency(i.price * i.qty)}`)
    .join('\n')

  const cashLine = d.method === 'cash' && d.change > 0
    ? `\nCambio: ${fmt.currency(d.change)}`
    : ''

  return [
    `🍽️ *Neón y Sabor Mi Rancho*`,
    `Recibo: ${d.receiptNo}`,
    `📅 ${fmt.datetime(d.date)}`,
    locationLine,
    `─────────────────────`,
    itemLines,
    `─────────────────────`,
    `Subtotal: ${fmt.currency(d.subtotal)}`,
    `IVA 8%:   ${fmt.currency(d.tax)}`,
    `*TOTAL: ${fmt.currency(d.total)}*`,
    `Método: ${methodLabels[d.method] ?? d.method}${cashLine}`,
    `─────────────────────`,
    `¡Gracias por su visita! 🌟`
  ].join('\n')
}

function confirmWhatsApp() {
  const raw = document.getElementById('waPhone').value.trim().replace(/[\s\-\(\)+]/g, '')
  if (!raw) {
    toast('Ingresa un número de WhatsApp', 'warning')
    document.getElementById('waPhone').focus()
    return
  }
  // Generar y descargar PDF automáticamente
  const doc = buildReceiptPDF(lastReceiptData)
  if (doc) {
    doc.save(`recibo-${lastReceiptData.receiptNo}.pdf`)
    toast('PDF descargado — adjúntalo en WhatsApp 📎', 'success')
  }
  window.open(`https://wa.me/${raw}`, '_blank')
  document.getElementById('waModal').classList.add('hidden')
}

// Expose for inline onclick
window.changeQty         = changeQty
window.openWhatsAppModal = openWhatsAppModal
window.downloadPDF       = window.downloadPDF  // already set above

init()
