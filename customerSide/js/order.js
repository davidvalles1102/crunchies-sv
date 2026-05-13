import { supabase, getSession, getProfile, calcTotals, fmt } from '../../shared/supabase-client.js'
import { toast } from './utils.js'

const DELIVERY_FEE = 3000   // COP — costo fijo de domicilio

let menuItems    = []
let categories   = []
let cart         = []
let orderType    = 'takeout'   // 'takeout' | 'delivery'
let paymentMethod = 'cash'     // 'cash' | 'nequi'
let userProfile  = null
let activeCat    = 'all'

// ─── Init ─────────────────────────────────────────────────────────
async function init() {
  const session = await getSession()
  if (session) {
    userProfile = await getProfile(session.user.id)
    if (userProfile.full_name) document.getElementById('custName').value  = userProfile.full_name
    if (userProfile.phone)     document.getElementById('custPhone').value = userProfile.phone
  }

  await loadMenu()
  setupOrderTypeTabs()
  setupPaymentTabs()
  setupSearch()
  renderCart()
}

// ─── Load Menu ────────────────────────────────────────────────────
async function loadMenu() {
  const [{ data: cats }, { data: items }] = await Promise.all([
    supabase.from('categories').select('*').eq('active', true).order('display_order'),
    supabase.from('menu_items').select('*, categories(name, icon)').eq('available', true)
  ])
  categories = cats  || []
  menuItems  = items || []

  buildCatTabs()
  renderGrid()
}

function buildCatTabs() {
  const el = document.getElementById('orderCatTabs')
  el.querySelector('[data-cat="all"]').addEventListener('click', () => { activeCat = 'all'; renderGrid(); setActiveTab(el.querySelector('[data-cat="all"]')) })

  categories.forEach(c => {
    const btn = document.createElement('button')
    btn.className   = 'pos-cat'
    btn.dataset.cat = c.id
    btn.textContent = `${c.icon} ${c.name}`
    btn.addEventListener('click', () => { activeCat = c.id; renderGrid(); setActiveTab(btn) })
    el.appendChild(btn)
  })
}

function setActiveTab(btn) {
  document.querySelectorAll('#orderCatTabs .pos-cat').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
}

function renderGrid() {
  const q = document.getElementById('orderSearch').value.toLowerCase()
  const filtered = menuItems.filter(i =>
    (activeCat === 'all' || i.category_id === activeCat) &&
    (i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
  )

  const grid = document.getElementById('orderItemsGrid')
  if (!filtered.length) {
    grid.innerHTML = '<p class="text-muted text-sm" style="grid-column:1/-1">Sin resultados.</p>'
    return
  }

  grid.innerHTML = filtered.map(item => `
    <div class="order-item-card ${!item.available ? 'order-item-card--unavail' : ''}"
         data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">
      ${item.image_url
        ? `<img class="order-item-img" src="${item.image_url}" alt="${item.name}" loading="lazy">`
        : `<div class="order-item-img">${item.categories?.icon ?? '🍽️'}</div>`
      }
      <div class="order-item-body">
        <div class="order-item-name">${item.name}</div>
        ${item.description ? `<div class="order-item-desc">${item.description}</div>` : ''}
        <div class="order-item-footer">
          <span class="order-item-price">${fmt.currency(item.price)}</span>
          <div class="order-item-add">+</div>
        </div>
      </div>
    </div>
  `).join('')

  grid.querySelectorAll('.order-item-card').forEach(card => {
    card.addEventListener('click', () => addToCart({
      id:    card.dataset.id,
      name:  card.dataset.name,
      price: parseFloat(card.dataset.price)
    }))
  })
}

function setupSearch() {
  document.getElementById('orderSearch').addEventListener('input', () => renderGrid())
}

// ─── Order Type ───────────────────────────────────────────────────
function setupOrderTypeTabs() {
  document.querySelectorAll('.order-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      orderType = btn.dataset.type
      document.querySelectorAll('.order-type-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      updateFormForType()
      renderCart()
    })
  })
  updateFormForType()
}

function updateFormForType() {
  const isDelivery = orderType === 'delivery'
  document.getElementById('formTitle').textContent        = isDelivery ? 'Datos de entrega' : 'Datos para recoger'
  document.getElementById('addressGroup').classList.toggle('hidden', !isDelivery)
  document.getElementById('pickupTimeGroup').classList.toggle('hidden', isDelivery)
  document.getElementById('deliveryFeeRow').style.display = isDelivery ? '' : 'none'
  document.getElementById('deliveryFee').textContent      = fmt.currency(DELIVERY_FEE)
  updatePaymentNotice()
}

// ─── Payment Method ───────────────────────────────────────────────
function setupPaymentTabs() {
  document.querySelectorAll('.payment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      paymentMethod = btn.dataset.method
      document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById('cashInfo').classList.toggle('hidden',   paymentMethod !== 'cash')
      document.getElementById('nequiInfo').classList.toggle('hidden',  paymentMethod !== 'nequi')
      updatePaymentNotice()
    })
  })
}

function updatePaymentNotice() {
  const isDelivery = orderType === 'delivery'
  if (paymentMethod === 'cash') {
    document.getElementById('paymentNoticeText').textContent = isDelivery
      ? 'Pago en efectivo al recibir tu pedido'
      : 'Pago en efectivo al recoger tu orden'
  }
}

// ─── Cart ─────────────────────────────────────────────────────────
function addToCart(item) {
  const ex = cart.find(i => i.id === item.id)
  if (ex) ex.qty++
  else cart.push({ ...item, qty: 1 })
  renderCart()
  toast(`${item.name} agregado`, 'success', 1500)
}

function changeQty(id, delta) {
  const it = cart.find(i => i.id === id)
  if (!it) return
  it.qty += delta
  if (it.qty <= 0) cart = cart.filter(i => i.id !== id)
  renderCart()
}

function renderCart() {
  const itemsEl  = document.getElementById('cartItems')
  const countEl  = document.getElementById('cartCount')
  const totalQty = cart.reduce((s, i) => s + i.qty, 0)

  countEl.textContent = `${totalQty} item${totalQty !== 1 ? 's' : ''}`

  if (!cart.length) {
    itemsEl.innerHTML = `<div class="cart-empty"><div style="font-size:2.5rem">🛒</div><p class="text-muted text-sm mt-8">Agrega platillos para empezar</p></div>`
    document.getElementById('placeOrderBtn').disabled = true
  } else {
    itemsEl.innerHTML = cart.map(i => `
      <div class="cart-item">
        <span class="cart-item__name">${i.name}</span>
        <div class="cart-item__qty">
          <button class="qty-btn minus" onclick="cartQty('${i.id}',-1)">−</button>
          <span class="qty-num">${i.qty}</span>
          <button class="qty-btn" onclick="cartQty('${i.id}',1)">+</button>
        </div>
        <span class="cart-item__price">${fmt.currency(i.price * i.qty)}</span>
        <span class="cart-item__del" onclick="cartQty('${i.id}',-${i.qty})">✕</span>
      </div>
    `).join('')
    document.getElementById('placeOrderBtn').disabled = false
  }

  const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const { tax, total } = calcTotals(subtotal)
  const grandTotal  = total + (orderType === 'delivery' ? DELIVERY_FEE : 0)

  document.getElementById('cartSubtotal').textContent = fmt.currency(subtotal)
  document.getElementById('cartTax').textContent      = fmt.currency(tax)
  document.getElementById('cartTotal').textContent    = fmt.currency(grandTotal)
}

window.cartQty = (id, delta) => { changeQty(id, delta) }

// ─── Place Order ──────────────────────────────────────────────────
document.getElementById('placeOrderBtn').addEventListener('click', placeOrder)

async function placeOrder() {
  const name    = document.getElementById('custName').value.trim()
  const phone   = document.getElementById('custPhone').value.trim()
  const address = document.getElementById('custAddress').value.trim()
  const notes   = document.getElementById('orderNotes').value.trim()
  const msgEl   = document.getElementById('orderMsg')
  msgEl.classList.add('hidden')

  if (!name || !phone) {
    msgEl.textContent = 'Nombre y teléfono son requeridos.'
    msgEl.className   = 'alert alert-error'
    msgEl.classList.remove('hidden')
    return
  }
  if (orderType === 'delivery' && !address) {
    msgEl.textContent = 'La dirección de entrega es requerida.'
    msgEl.className   = 'alert alert-error'
    msgEl.classList.remove('hidden')
    return
  }

  const btn = document.getElementById('placeOrderBtn')
  btn.disabled    = true
  btn.textContent = 'Enviando pedido...'

  const subtotal   = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const { tax, total } = calcTotals(subtotal)
  const grandTotal = total + (orderType === 'delivery' ? DELIVERY_FEE : 0)

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      customer_id:      userProfile?.id ?? null,
      order_type:       orderType,
      delivery_name:    name,
      delivery_phone:   phone,
      delivery_address: orderType === 'delivery' ? address : null,
      notes,
      status:           'open',
      delivery_status:  'pending',
      payment_method:   paymentMethod,
      subtotal,
      tax,
      total: grandTotal
    })
    .select()
    .single()

  if (orderErr) {
    msgEl.textContent = 'Error al enviar el pedido. Intenta de nuevo.'
    msgEl.className   = 'alert alert-error'
    msgEl.classList.remove('hidden')
    btn.disabled    = false
    btn.textContent = 'Hacer Pedido'
    return
  }

  const itemsPayload = cart.map(i => ({
    order_id:     order.id,
    menu_item_id: i.id,
    item_name:    i.name,
    item_price:   i.price,
    quantity:     i.qty
  }))
  await supabase.from('order_items').insert(itemsPayload)

  showSuccessModal(order, grandTotal)
  cart = []
  renderCart()
  btn.textContent = 'Hacer Pedido'
}

function showSuccessModal(order, total) {
  const isDelivery  = order.order_type === 'delivery'
  const isNequi     = order.payment_method === 'nequi'
  const pickupMin   = document.getElementById('pickupTime')?.value ?? 30

  document.getElementById('successTitle').textContent = isDelivery ? '¡Pedido enviado!' : '¡Pedido registrado!'
  document.getElementById('successMsg').textContent   = isDelivery
    ? 'Tu pedido está siendo preparado. El repartidor saldrá pronto.'
    : `Tu pedido estará listo para recoger en aproximadamente ${pickupMin} minutos.`

  const paymentLine = isNequi
    ? `<div style="background:rgba(0,220,130,.08);border:1px solid var(--green-dim);border-radius:var(--r-md);padding:10px 14px;margin-top:8px">
         <div style="font-weight:600;color:var(--green);margin-bottom:4px">📱 Pago por Nequi</div>
         <div style="font-size:.82rem;color:var(--text-secondary)">Transfiere <strong>${fmt.currency(total)}</strong> al número <strong>312 828 2045</strong> si aún no lo has hecho.</div>
       </div>`
    : `<div style="color:var(--text-muted);font-size:.78rem;margin-top:4px">💵 Pago en efectivo ${isDelivery ? 'al recibir' : 'al recoger'}</div>`

  document.getElementById('successDetails').innerHTML = `
    <div class="flex-col gap-8 text-sm">
      <div class="flex justify-between"><span class="text-muted">Nombre</span><span style="font-weight:600">${order.delivery_name}</span></div>
      <div class="flex justify-between"><span class="text-muted">Teléfono</span><span>${order.delivery_phone}</span></div>
      ${isDelivery ? `<div class="flex justify-between"><span class="text-muted">Dirección</span><span style="text-align:right;max-width:200px">${order.delivery_address}</span></div>` : ''}
      <div class="flex justify-between" style="padding-top:8px;border-top:1px solid var(--border)">
        <span class="text-muted">Total</span>
        <span class="neon-amber" style="font-weight:700;font-size:1.1rem">${fmt.currency(total)}</span>
      </div>
      ${paymentLine}
    </div>`

  // Set the track link
  document.getElementById('trackOrderLink').href = `track.html?id=${order.id}`

  document.getElementById('successModal').classList.remove('hidden')
}

init()
