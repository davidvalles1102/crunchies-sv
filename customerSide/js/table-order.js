import { supabase, getSession, getProfile, calcTotals, fmt } from '../../shared/supabase-client.js'
import { toast } from './utils.js'

const params  = new URLSearchParams(location.search)
const tableId = params.get('table')

let profile   = null
let tableInfo = null
let menuItems = []
let activeCat = 'all'
let cart      = []   // [{ id, name, price, qty }]

// ─── Boot ─────────────────────────────────────────────────────────
async function init() {
  if (!tableId) { showError('Código QR inválido. No se encontró la mesa.'); return }

  const session = await getSession()
  if (!session) {
    const next = encodeURIComponent('/customerSide/table-order.html?table=' + tableId)
    window.location.href = 'auth.html?next=' + next
    return
  }

  profile = await getProfile(session.user.id)
  if (!profile) {
    const meta = session.user.user_metadata ?? {}
    const { data } = await supabase.from('profiles').upsert({
      id: session.user.id, full_name: meta.full_name || '', phone: meta.phone || '',
      role: 'customer', loyalty_points: 0
    }, { onConflict: 'id' }).select().maybeSingle()
    profile = data ?? { id: session.user.id, full_name: meta.full_name || '' }
  }

  const { data: tbl } = await supabase
    .from('restaurant_tables').select('*').eq('id', tableId).maybeSingle()

  if (!tbl) { showError('Mesa no encontrada. Escanea el código QR correcto.'); return }

  tableInfo = tbl
  document.getElementById('tableName').textContent       = `Mesa ${tbl.number}`
  document.getElementById('desktopTableName').textContent = `Mesa ${tbl.number}`
  document.getElementById('tableLocation').textContent   = tbl.location
  document.getElementById('userGreet').textContent       = `Hola, ${profile.full_name || 'Cliente'}`

  // Mark table occupied as soon as customer scans and loads the menu
  if (tbl.status !== 'occupied') {
    await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', tableId)
  }

  await loadMenu()
  showMain()
  setupEvents()
}

function showError(msg) {
  document.getElementById('loadingScreen').classList.add('hidden')
  document.getElementById('errorMsg').textContent = msg
  document.getElementById('errorScreen').classList.remove('hidden')
}

function showMain() {
  document.getElementById('loadingScreen').classList.add('hidden')
  document.getElementById('mainContent').classList.remove('hidden')
}

// ─── Menu ─────────────────────────────────────────────────────────
async function loadMenu() {
  const [{ data: cats }, { data: items }] = await Promise.all([
    supabase.from('categories').select('*').eq('active', true).order('display_order'),
    supabase.from('menu_items').select('*').eq('available', true).order('name')
  ])

  const tabs = document.getElementById('catTabs')
  ;(cats || []).forEach(cat => {
    const btn = document.createElement('button')
    btn.className = 'pos-cat'
    btn.dataset.cat = cat.id
    btn.textContent = `${cat.icon} ${cat.name}`
    btn.addEventListener('click', () => { activeCat = cat.id; renderGrid(); setActiveTab(btn) })
    tabs.appendChild(btn)
  })
  tabs.querySelector('[data-cat="all"]').addEventListener('click', (e) => {
    activeCat = 'all'; renderGrid(); setActiveTab(e.currentTarget)
  })

  menuItems = items || []
  renderGrid()
}

function setActiveTab(active) {
  document.querySelectorAll('#catTabs .pos-cat').forEach(b => b.classList.remove('active'))
  active.classList.add('active')
}

function renderGrid() {
  const q = document.getElementById('menuSearch').value.toLowerCase()
  const filtered = menuItems.filter(i =>
    (activeCat === 'all' || i.category_id === activeCat) &&
    (i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
  )

  const grid = document.getElementById('menuGrid')
  if (!filtered.length) {
    grid.innerHTML = '<p class="text-muted text-sm" style="grid-column:1/-1;padding:20px">Sin resultados.</p>'
    return
  }

  grid.innerHTML = filtered.map(i => {
    const inCart = cart.find(c => c.id === i.id)
    return `
      <div class="order-item-card ${inCart ? 'in-cart' : ''}"
           onclick="addToCart('${i.id}','${i.name.replace(/'/g, "\\'")}',${i.price})">
        <div class="order-item-img">
          ${i.image_url
            ? `<img src="${i.image_url}" alt="${i.name}" style="width:100%;height:100%;object-fit:cover">`
            : `<span>${i.emoji || '🍽️'}</span>`}
        </div>
        <div class="order-item-body">
          <div class="order-item-name">${i.name}</div>
          ${i.description ? `<div class="order-item-desc">${i.description}</div>` : ''}
          <div class="order-item-footer">
            <span class="order-item-price">${fmt.currency(i.price)}</span>
            <span class="order-item-add ${inCart ? 'in-cart' : ''}">
              ${inCart ? `✓ ${inCart.qty}` : '+'}
            </span>
          </div>
        </div>
      </div>`
  }).join('')
}

// ─── Cart ──────────────────────────────────────────────────────────
window.addToCart = (id, name, price) => {
  const existing = cart.find(c => c.id === id)
  existing ? existing.qty++ : cart.push({ id, name, price: parseFloat(price), qty: 1 })
  renderGrid()
  renderDesktopCart()
  updateMobileBar()
  toast(`${name} agregado`, 'success', 1500)
}

window.changeQty = (id, delta) => {
  const item = cart.find(c => c.id === id)
  if (!item) return
  item.qty += delta
  if (item.qty <= 0) cart = cart.filter(c => c.id !== id)
  renderGrid()
  renderDesktopCart()
  renderMobileCart()
  updateMobileBar()
  if (!cart.length) closeMobileCart()
}

function cartTotals() {
  const raw = cart.reduce((s, c) => s + c.price * c.qty, 0)
  return calcTotals(raw)
}

function cartItemsHTML() {
  if (!cart.length) return '<p class="text-muted text-sm" style="padding:12px 0">Sin productos.</p>'
  return cart.map(c => `
    <div class="cart-item">
      <span class="cart-item__name">${c.name}</span>
      <div class="cart-item__qty">
        <button class="btn btn-ghost btn-sm" style="padding:2px 8px" onclick="changeQty('${c.id}',-1)">−</button>
        <span>${c.qty}</span>
        <button class="btn btn-ghost btn-sm" style="padding:2px 8px" onclick="changeQty('${c.id}',1)">+</button>
      </div>
      <span class="cart-item__price">${fmt.currency(c.price * c.qty)}</span>
    </div>`).join('')
}

function renderDesktopCart() {
  const { subtotal, tax, total } = cartTotals()
  document.getElementById('desktopCartItems').innerHTML = cart.length
    ? cartItemsHTML()
    : '<div class="cart-empty"><div style="font-size:2.5rem">🧾</div><p class="text-muted text-sm mt-8">Agrega platillos para empezar</p></div>'
  document.getElementById('desktopCartCount').textContent = `${cart.reduce((s, c) => s + c.qty, 0)} items`
  document.getElementById('desktopSubtotal').textContent = fmt.currency(subtotal)
  document.getElementById('desktopTax').textContent      = fmt.currency(tax)
  document.getElementById('desktopTotal').textContent    = fmt.currency(total)
  document.getElementById('desktopConfirmBtn').disabled  = !cart.length
}

function renderMobileCart() {
  const { subtotal, tax, total } = cartTotals()
  document.getElementById('mobileCartItems').innerHTML = cartItemsHTML()
  document.getElementById('mobileSubtotal').textContent = fmt.currency(subtotal)
  document.getElementById('mobileTax').textContent      = fmt.currency(tax)
  document.getElementById('mobileTotal').textContent    = fmt.currency(total)
}

function updateMobileBar() {
  const bar   = document.getElementById('mobileCartBar')
  const count = cart.reduce((s, c) => s + c.qty, 0)
  if (!count) { bar.classList.remove('visible'); return }
  bar.classList.add('visible')
  document.getElementById('mobileCartCount').textContent = `${count} ${count === 1 ? 'item' : 'items'}`
  document.getElementById('mobileCartTotal').textContent = fmt.currency(cartTotals().total)
}

function closeMobileCart() {
  document.getElementById('mobileCartBackdrop').classList.remove('visible')
}

// ─── Submit ────────────────────────────────────────────────────────
async function submitOrder(notesId, msgId, btnId) {
  if (!cart.length) return
  const btn = document.getElementById(btnId)
  btn.disabled = true
  btn.textContent = 'Enviando...'

  const notes = document.getElementById(notesId).value.trim() || null
  const { subtotal, tax, total } = cartTotals()

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      table_id:    tableId,
      customer_id: profile?.id ?? null,
      order_type:  'dine_in',
      status:      'in_kitchen',
      notes,
      subtotal,
      tax,
      total
    })
    .select()
    .single()

  if (orderErr) {
    const msgEl = document.getElementById(msgId)
    msgEl.textContent = 'Error al enviar el pedido. Intenta de nuevo.'
    msgEl.className = 'alert alert-error'
    msgEl.classList.remove('hidden')
    btn.disabled = false
    btn.textContent = 'Enviar Pedido a Cocina'
    return
  }

  await supabase.from('order_items').insert(
    cart.map(c => ({
      order_id:     order.id,
      menu_item_id: c.id,
      item_name:    c.name,
      item_price:   c.price,
      quantity:     c.qty
    }))
  )

  // Show success
  closeMobileCart()
  document.getElementById('successOrderNum').textContent = `#${order.id.slice(0, 8).toUpperCase()}`
  document.getElementById('successScreen').classList.remove('hidden')
  cart = []
}

// ─── Events ────────────────────────────────────────────────────────
function setupEvents() {
  document.getElementById('menuSearch').addEventListener('input', renderGrid)
  document.getElementById('mobileCartBar').addEventListener('click', () => {
    renderMobileCart()
    document.getElementById('mobileCartBackdrop').classList.add('visible')
  })
  document.getElementById('mobileCartClose').addEventListener('click', closeMobileCart)
  document.getElementById('mobileCartBackdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeMobileCart()
  })
  document.getElementById('desktopConfirmBtn').addEventListener('click', () =>
    submitOrder('desktopNotes', 'desktopOrderMsg', 'desktopConfirmBtn'))
  document.getElementById('mobileConfirmBtn').addEventListener('click', () =>
    submitOrder('mobileNotes', 'mobileOrderMsg', 'mobileConfirmBtn'))
  document.getElementById('orderMoreBtn').addEventListener('click', () => {
    document.getElementById('successScreen').classList.add('hidden')
    renderGrid()
    renderDesktopCart()
    updateMobileBar()
  })
}

init()
