import { supabase, fmt } from '../../shared/supabase-client.js'

const orderId = new URLSearchParams(location.search).get('id')

const DELIVERY_STEPS = [
  { key: 'pending',     icon: '🕐', label: 'Recibido',       desc: 'Tu pedido fue registrado en el sistema' },
  { key: 'preparing',  icon: '🔥', label: 'Preparando',     desc: 'El equipo está cocinando tu pedido' },
  { key: 'ready',      icon: '✅', label: 'Listo',           desc: 'Tu pedido está listo' },
  { key: 'on_the_way', icon: '🛵', label: 'En Camino',       desc: '¡El repartidor ya va hacia ti!' },
  { key: 'delivered',  icon: '📦', label: '¡Entregado!',    desc: '¡Buen provecho! Gracias por tu pedido' },
]

const TAKEOUT_STEPS = [
  { key: 'pending',    icon: '🕐', label: 'Recibido',              desc: 'Tu pedido fue registrado en el sistema' },
  { key: 'preparing', icon: '🔥', label: 'Preparando',            desc: 'El equipo está cocinando tu pedido' },
  { key: 'ready',     icon: '✅', label: 'Listo para Recoger',    desc: '¡Puedes venir a recoger tu pedido!' },
]

const STATUS_ORDER = ['pending', 'preparing', 'ready', 'on_the_way', 'delivered']

let currentOrder = null

async function init() {
  if (!orderId) { showNotFound(); return }

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, order_items(*), drivers(full_name, phone)')
    .eq('id', orderId)
    .single()

  if (error || !order) { showNotFound(); return }

  currentOrder = order
  renderPage(order)
  subscribeRealtime(order.id)
}

function showNotFound() {
  document.getElementById('trackNotFound').classList.remove('hidden')
}

function renderPage(order) {
  document.getElementById('trackContent').classList.remove('hidden')
  document.getElementById('trackOrderId').textContent = '#' + order.id.slice(0, 8).toUpperCase()

  const isDelivery = order.order_type === 'delivery'
  document.getElementById('trackTypeBadge').textContent = isDelivery ? '🛵 Domicilio' : '🥡 Para Llevar'

  renderStepper(order)
  renderStatusBanner(order)
  renderItems(order)
  renderPayment(order)
  renderDriverInfo(order)
}

async function renderDriverInfo(order) {
  const card = document.getElementById('trackDriverCard')
  if (order.order_type !== 'delivery' || !order.driver_id) { card.classList.add('hidden'); return }

  let driver = order.drivers
  if (!driver) {
    const { data } = await supabase.from('drivers').select('full_name, phone').eq('id', order.driver_id).maybeSingle()
    driver = data
  }
  if (!driver) { card.classList.add('hidden'); return }

  card.classList.remove('hidden')
  document.getElementById('trackDriverInfo').innerHTML = `
    <div class="flex justify-between items-center">
      <span style="font-weight:600">${driver.full_name}</span>
      <a href="tel:${driver.phone}" class="btn btn-outline btn-sm">📞 ${driver.phone}</a>
    </div>`
}

function renderStatusBanner(order) {
  const steps  = order.order_type === 'delivery' ? DELIVERY_STEPS : TAKEOUT_STEPS
  const status = order.delivery_status || 'pending'
  const step   = steps.find(s => s.key === status) ?? steps[0]

  document.getElementById('trackStatusIcon').textContent  = step.icon
  document.getElementById('trackStatusLabel').textContent = step.label
  document.getElementById('trackStatusDesc').textContent  = step.desc

  // Color the banner based on status
  const banner = document.getElementById('trackStatusBanner')
  banner.style.borderColor = status === 'delivered' ? 'var(--green)' : status === 'on_the_way' ? 'var(--amber)' : 'var(--border-lit)'
  banner.style.background  = status === 'delivered'
    ? 'rgba(0,220,130,.08)' : status === 'on_the_way'
    ? 'var(--amber-alpha)' : 'var(--bg-2)'
}

function renderStepper(order) {
  const steps      = order.order_type === 'delivery' ? DELIVERY_STEPS : TAKEOUT_STEPS
  const status     = order.delivery_status || 'pending'
  const currentIdx = STATUS_ORDER.indexOf(status)

  document.getElementById('trackStepper').innerHTML = steps.map((step, i) => {
    const stepIdx = STATUS_ORDER.indexOf(step.key)
    const done    = stepIdx < currentIdx
    const active  = step.key === status
    const cls     = done ? 'done' : active ? 'active' : ''
    return `
      <div class="track-step ${cls}">
        <div class="track-step__circle">${done ? '✓' : step.icon}</div>
        <div class="track-step__label">${step.label}</div>
      </div>`
  }).join('')
}

function renderItems(order) {
  const items = order.order_items || []
  document.getElementById('trackItems').innerHTML = items.map(i => `
    <div class="flex justify-between text-sm">
      <span>${i.quantity}× ${i.item_name}</span>
      <span class="text-muted">${fmt.currency(i.item_price * i.quantity)}</span>
    </div>`).join('')

  document.getElementById('trackTotal').innerHTML = `
    <span class="text-muted">Total</span>
    <span class="neon-amber" style="font-size:1.1rem">${fmt.currency(order.total)}</span>`
}

function renderPayment(order) {
  const isNequi = order.payment_method === 'nequi'
  document.getElementById('trackPaymentInfo').innerHTML = isNequi
    ? `<div style="color:var(--green);font-weight:600;margin-bottom:6px">📱 Nequi</div>
       <div class="track-nequi-number">312 828 2045</div>
       <p class="text-xs text-muted">Recuerda transferir ${fmt.currency(order.total)} si aún no lo has hecho.</p>`
    : `<div style="color:var(--amber);font-weight:600;margin-bottom:6px">💵 Efectivo</div>
       <p class="text-sm text-muted">${order.order_type === 'delivery' ? 'Pago al recibir tu pedido.' : 'Pago al recoger en el restaurante.'}</p>`
}

// ─── Realtime ──────────────────────────────────────────────────────
function subscribeRealtime(id) {
  supabase
    .channel(`track-order-${id}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
      async (payload) => {
        const updated = { ...currentOrder, ...payload.new, drivers: null }
        currentOrder  = updated

        renderStatusBanner(updated)
        renderStepper(updated)
        renderDriverInfo(updated)

        // Show a toast when status advances
        const steps   = updated.order_type === 'delivery' ? DELIVERY_STEPS : TAKEOUT_STEPS
        const step    = steps.find(s => s.key === updated.delivery_status)
        if (step) showToast(`${step.icon} ${step.label}`)
      })
    .subscribe()
}

function showToast(msg) {
  const el = document.createElement('div')
  el.className = 'toast toast-success'
  el.textContent = msg
  document.getElementById('toast-container').appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

init()
