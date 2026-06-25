import { supabase, fmt, calcTotals } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'
import { modifiersSummary } from '../../shared/modifier-modal.js'

let allOrders  = []
let drivers    = []
let zones      = []
let typeFilter = 'all'   // 'all' | 'delivery' | 'takeout'

// Delivery status flow:
// takeout:  pending → preparing → ready → (paid)
// delivery: pending → preparing → ready → on_the_way → delivered → (paid)

const deliveryStatusCfg = {
  pending:    { label: 'Pendiente',   cls: 'badge-amber',  icon: '🕐', next: 'preparing',  nextLabel: '👨‍🍳 Preparar' },
  preparing:  { label: 'Preparando',  cls: 'badge-info',   icon: '🔥', next: 'ready',       nextLabel: '✅ Listo' },
  ready:      { label: 'Listo',       cls: 'badge-green',  icon: '✅', next: 'on_the_way',  nextLabel: '🛵 En Camino' },
  on_the_way: { label: 'En Camino',   cls: 'badge-green',  icon: '🛵', next: 'delivered',   nextLabel: '📦 Entregado' },
  delivered:  { label: 'Entregado',   cls: 'badge-muted',  icon: '📦', next: null,           nextLabel: null }
}

// For takeout, "on_the_way" doesn't apply — after ready goes straight to paid
const takeoutNextLabel = { ready: '📞 Cliente avisado / Recogido' }

async function init() {
  const ctx = await initAdminShell(['admin', 'waiter'])
  if (!ctx) return

  // Filter buttons
  document.querySelectorAll('.delivery-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      typeFilter = btn.dataset.filter
      document.querySelectorAll('.delivery-filter').forEach(b => {
        b.classList.toggle('active', b === btn)
        b.style.borderColor = b === btn ? 'var(--green)' : ''
        b.style.color       = b === btn ? 'var(--green)' : ''
      })
      renderBoard()
    })
  })

  document.getElementById('detailModalClose').addEventListener('click', () =>
    document.getElementById('orderDetailModal').classList.add('hidden'))

  document.getElementById('manageDriversBtn').addEventListener('click', () => {
    renderDriversList()
    document.getElementById('driversModal').classList.remove('hidden')
  })
  document.getElementById('driversModalClose').addEventListener('click', () => document.getElementById('driversModal').classList.add('hidden'))
  document.getElementById('addDriverForm').addEventListener('submit', addDriver)

  document.getElementById('manageZonesBtn').addEventListener('click', () => {
    renderZonesList()
    document.getElementById('zonesModal').classList.remove('hidden')
  })
  document.getElementById('zonesModalClose').addEventListener('click', () => document.getElementById('zonesModal').classList.add('hidden'))
  document.getElementById('addZoneForm').addEventListener('submit', addZone)

  await Promise.all([loadDrivers(), loadZones()])
  await loadOrders()
  subscribeRealtime()
}

// ─── Drivers ────────────────────────────────────────────────────────
async function loadDrivers() {
  const { data } = await supabase.from('drivers').select('*').order('full_name')
  drivers = data || []
}

function renderDriversList() {
  const el = document.getElementById('driversList')
  if (!drivers.length) {
    el.innerHTML = '<p class="text-muted text-sm">Sin repartidores registrados.</p>'
    return
  }
  el.innerHTML = drivers.map(d => {
    const workload = allOrders.filter(o => o.driver_id === d.id && ['ready', 'on_the_way'].includes(o.delivery_status)).length
    return `
    <div class="card" style="padding:10px 14px">
      <div class="flex justify-between items-center">
        <div>
          <strong>${d.full_name}</strong>
          <span class="text-muted text-xs"> · 📞 ${d.phone}</span>
          ${!d.active ? '<span class="badge badge-muted text-xs">Inactivo</span>' : ''}
        </div>
        <div class="flex gap-8 items-center">
          ${workload > 0 ? `<span class="badge badge-amber text-xs">${workload} en ruta</span>` : ''}
          <button class="btn btn-outline btn-sm" onclick="toggleDriverActive('${d.id}', ${!d.active})">${d.active ? 'Desactivar' : 'Activar'}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteDriver('${d.id}')">✕</button>
        </div>
      </div>
    </div>`
  }).join('')
}

async function addDriver(e) {
  e.preventDefault()
  const full_name = document.getElementById('newDriverName').value.trim()
  const phone     = document.getElementById('newDriverPhone').value.trim()
  if (!full_name || !phone) return

  const { error } = await supabase.from('drivers').insert({ full_name, phone })
  if (error) { toast('Error al agregar repartidor', 'error'); return }

  toast('Repartidor agregado')
  e.target.reset()
  await loadDrivers()
  renderDriversList()
  renderBoard()
}

window.toggleDriverActive = async (id, newVal) => {
  const { error } = await supabase.from('drivers').update({ active: newVal }).eq('id', id)
  if (error) { toast('Error', 'error'); return }
  await loadDrivers()
  renderDriversList()
  renderBoard()
}

window.deleteDriver = async (id) => {
  if (!confirm('¿Eliminar este repartidor? Las órdenes asignadas quedarán sin repartidor.')) return
  const { error } = await supabase.from('drivers').delete().eq('id', id)
  if (error) { toast('Error al eliminar', 'error'); return }
  toast('Repartidor eliminado')
  await loadDrivers()
  renderDriversList()
  await loadOrders()
}

window.assignDriver = async (orderId, driverId) => {
  const { error } = await supabase.from('orders').update({ driver_id: driverId || null }).eq('id', orderId)
  if (error) { toast('Error al asignar repartidor', 'error'); return }
  const driver = drivers.find(d => d.id === driverId)
  toast(driverId ? `🛵 Asignado a ${driver?.full_name}` : 'Repartidor desasignado', 'success')
  await loadOrders()
}

// ─── Delivery Zones ───────────────────────────────────────────────
async function loadZones() {
  const { data } = await supabase.from('delivery_zones').select('*').order('display_order')
  zones = data || []
}

function renderZonesList() {
  const el = document.getElementById('zonesList')
  if (!zones.length) {
    el.innerHTML = '<p class="text-muted text-sm">Sin zonas registradas. El costo de envío en el pedido web no se podrá calcular hasta crear al menos una.</p>'
    return
  }
  el.innerHTML = zones.map(z => `
    <div class="card" style="padding:10px 14px">
      <div class="flex justify-between items-center">
        <div>
          <strong>${z.name}</strong>
          <span class="neon-amber text-sm"> — ${fmt.currency(z.fee)}</span>
          ${!z.active ? '<span class="badge badge-muted text-xs">Inactiva</span>' : ''}
        </div>
        <div class="flex gap-8">
          <button class="btn btn-outline btn-sm" onclick="toggleZoneActive('${z.id}', ${!z.active})">${z.active ? 'Desactivar' : 'Activar'}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteZone('${z.id}')">✕</button>
        </div>
      </div>
    </div>`).join('')
}

async function addZone(e) {
  e.preventDefault()
  const name = document.getElementById('newZoneName').value.trim()
  const fee  = parseFloat(document.getElementById('newZoneFee').value)
  if (!name || isNaN(fee)) return

  const { error } = await supabase.from('delivery_zones').insert({ name, fee, display_order: zones.length })
  if (error) { toast('Error al agregar zona', 'error'); return }

  toast('Zona agregada')
  e.target.reset()
  await loadZones()
  renderZonesList()
}

window.toggleZoneActive = async (id, newVal) => {
  const { error } = await supabase.from('delivery_zones').update({ active: newVal }).eq('id', id)
  if (error) { toast('Error', 'error'); return }
  await loadZones()
  renderZonesList()
}

window.deleteZone = async (id) => {
  if (!confirm('¿Eliminar esta zona de entrega?')) return
  const { error } = await supabase.from('delivery_zones').delete().eq('id', id)
  if (error) { toast('Error al eliminar', 'error'); return }
  toast('Zona eliminada')
  await loadZones()
  renderZonesList()
}

// ─── Load ─────────────────────────────────────────────────────────
async function loadOrders() {
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, order_item_modifiers(*))')
    .in('order_type', ['delivery', 'takeout'])
    .not('delivery_status', 'eq', 'delivered')   // hide old delivered
    .gte('created_at', `${today}T00:00:00`)
    .order('created_at', { ascending: false })

  // Also fetch today's delivered to show count
  const { data: delivered } = await supabase
    .from('orders')
    .select('id, order_type')
    .in('order_type', ['delivery', 'takeout'])
    .eq('delivery_status', 'delivered')
    .gte('created_at', `${today}T00:00:00`)

  if (error) { toast('Error al cargar órdenes', 'error'); return }

  allOrders = data || []
  renderStats(delivered?.length ?? 0)
  renderBoard()
}

// ─── Stats ────────────────────────────────────────────────────────
function renderStats(deliveredCount) {
  const count = (s) => allOrders.filter(o => o.delivery_status === s).length
  document.getElementById('statPending').textContent   = count('pending')
  document.getElementById('statPreparing').textContent = count('preparing')
  document.getElementById('statReady').textContent     = count('ready')
  document.getElementById('statOnWay').textContent     = count('on_the_way')
  document.getElementById('statDelivered').textContent = deliveredCount
}

// ─── Board ────────────────────────────────────────────────────────
function renderBoard() {
  const filtered = typeFilter === 'all'
    ? allOrders
    : allOrders.filter(o => o.order_type === typeFilter)

  const board = document.getElementById('deliveryBoard')

  if (!filtered.length) {
    board.innerHTML = `
      <div class="kitchen-empty" style="max-width:400px;margin:0 auto">
        <div style="font-size:3rem">${typeFilter === 'delivery' ? '🛵' : typeFilter === 'takeout' ? '🥡' : '📭'}</div>
        <p class="text-muted text-sm mt-8">Sin órdenes activas por ahora</p>
      </div>`
    return
  }

  board.innerHTML = filtered.map(o => buildCard(o)).join('')

  board.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const { action, id } = e.currentTarget.dataset
      if (action === 'detail') openDetail(id)
      else advanceStatus(id, action)
    })
  })

  board.querySelectorAll('.driver-select').forEach(sel => {
    sel.addEventListener('click', (e) => e.stopPropagation())
    sel.addEventListener('change', (e) => assignDriver(e.target.dataset.orderId, e.target.value))
  })
}

function buildCard(order) {
  const ds      = order.delivery_status || 'pending'
  const cfg     = deliveryStatusCfg[ds] ?? deliveryStatusCfg.pending
  const isDelivery = order.order_type === 'delivery'
  const elapsed = Math.floor((Date.now() - new Date(order.created_at)) / 60000)
  const timerCls = elapsed < 20 ? 'timer--ok' : elapsed < 40 ? 'timer--warn' : 'timer--urgent'
  const items   = order.order_items || []

  // For takeout, skip "on_the_way" step
  let nextLabel = cfg.nextLabel
  let nextStatus = cfg.next
  if (!isDelivery && ds === 'ready') { nextLabel = '✅ Marcado como Recogido'; nextStatus = 'delivered' }

  return `
    <div class="delivery-card" id="dcard-${order.id}">
      <div class="delivery-card__header">
        <div class="delivery-card__type">
          ${isDelivery ? '🛵 Domicilio' : '🥡 Para Llevar'}
        </div>
        <div class="delivery-card__timer ${timerCls}">⏱ ${elapsed}m</div>
        <span class="badge ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
      </div>

      <div class="delivery-card__customer">
        <div class="delivery-card__name">${order.delivery_name || '—'}</div>
        <div class="delivery-card__phone text-sm text-muted">📞 ${order.delivery_phone || '—'}</div>
        ${isDelivery && order.delivery_address
          ? `<div class="delivery-card__address text-sm" style="color:var(--amber);margin-top:4px">📍 ${order.delivery_address}</div>`
          : ''}
        <div class="text-xs mt-4" style="color:${order.payment_method === 'nequi' ? 'var(--green)' : 'var(--text-muted)'}">
          ${order.payment_method === 'nequi' ? '📱 Nequi — verificar pago' : '💵 Efectivo'}
        </div>
        ${isDelivery ? `
          <div class="flex gap-8 items-center mt-8">
            <span class="text-xs text-muted">🛵 Repartidor:</span>
            <select class="form-control driver-select" data-order-id="${order.id}" style="flex:1;padding:4px 8px;font-size:.8rem">
              <option value="">Sin asignar</option>
              ${drivers.filter(d => d.active).map(d => `<option value="${d.id}" ${order.driver_id === d.id ? 'selected' : ''}>${d.full_name}</option>`).join('')}
            </select>
          </div>` : ''}
      </div>

      <div class="delivery-card__items">
        ${items.map(i => `
          <div class="delivery-card__item">
            <span class="kitchen-item__qty">${i.quantity}</span>
            <span>${i.item_name}${i.order_item_modifiers?.length ? ` <span class="text-muted text-xs">(${modifiersSummary(i.order_item_modifiers.map(m => ({ option_name: m.option_name })))})</span>` : ''}</span>
          </div>`).join('')}
        ${order.notes ? `<div class="text-xs text-muted mt-4">📋 ${order.notes}</div>` : ''}
      </div>

      <div class="delivery-card__footer">
        <span class="neon-amber" style="font-weight:700;font-family:var(--font-d)">${fmt.currency(order.total)}</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" data-action="detail" data-id="${order.id}">Ver</button>
          ${nextStatus ? `<button class="btn btn-primary btn-sm" data-action="${nextStatus}" data-id="${order.id}">${nextLabel}</button>` : ''}
        </div>
      </div>
    </div>`
}

// ─── Advance status ───────────────────────────────────────────────
async function advanceStatus(orderId, newDeliveryStatus) {
  // Keep `status` in sync so kitchen.js can see the order
  const statusMap = {
    preparing:  'in_kitchen',
    ready:      'ready',
    on_the_way: 'ready',
    delivered:  'delivered'
  }
  const orderStatus = statusMap[newDeliveryStatus] ?? 'open'
  const { error } = await supabase
    .from('orders')
    .update({ delivery_status: newDeliveryStatus, status: orderStatus, updated_at: new Date().toISOString() })
    .eq('id', orderId)

  if (error) { toast('Error al actualizar', 'error'); return }

  const msgs = {
    preparing:  '🔥 Orden en preparación',
    ready:      '✅ Orden lista',
    on_the_way: '🛵 Repartidor en camino',
    delivered:  '📦 Entregado — recuerda cobrar'
  }
  toast(msgs[newDeliveryStatus] ?? 'Actualizado', 'success')
  await loadOrders()
}

// ─── Detail modal ─────────────────────────────────────────────────
function openDetail(id) {
  const o = allOrders.find(x => x.id === id)
  if (!o) return
  const ds  = o.delivery_status || 'pending'
  const cfg = deliveryStatusCfg[ds]
  const isDelivery = o.order_type === 'delivery'

  document.getElementById('detailModalTitle').textContent = isDelivery ? '🛵 Orden Domicilio' : '🥡 Para Llevar'

  document.getElementById('detailModalBody').innerHTML = `
    <div class="flex-col gap-16">
      <div class="card" style="border-color:var(--amber-dim)">
        <h4 style="color:var(--amber);margin-bottom:10px">👤 Cliente</h4>
        <div class="flex-col gap-6 text-sm">
          <div class="flex justify-between"><span class="text-muted">Nombre</span><span style="font-weight:600">${o.delivery_name}</span></div>
          <div class="flex justify-between"><span class="text-muted">Teléfono</span><span>${o.delivery_phone}</span></div>
          ${isDelivery ? `<div class="flex justify-between"><span class="text-muted">Dirección</span><span style="text-align:right;max-width:220px">${o.delivery_address}</span></div>` : ''}
          <div class="flex justify-between"><span class="text-muted">Pago</span>
            <span style="font-weight:600;color:${o.payment_method === 'nequi' ? 'var(--green)' : 'var(--amber)'}">
              ${o.payment_method === 'nequi' ? '📱 Nequi' : '💵 Efectivo'}
            </span>
          </div>
          ${isDelivery ? `<div class="flex justify-between"><span class="text-muted">Repartidor</span><span>${drivers.find(d => d.id === o.driver_id)?.full_name ?? 'Sin asignar'}</span></div>` : ''}
          ${o.delivery_fee > 0 ? `<div class="flex justify-between"><span class="text-muted">Costo de envío</span><span>${fmt.currency(o.delivery_fee)}</span></div>` : ''}
        </div>
      </div>
      <div class="card">
        <h4 style="margin-bottom:10px">🧾 Items</h4>
        ${(o.order_items || []).map(i => `
          <div class="receipt__item text-sm" style="padding:5px 0;border-bottom:1px solid var(--border)">
            <span>${i.quantity}x ${i.item_name}${i.order_item_modifiers?.length ? `<br><span class="text-muted text-xs">${modifiersSummary(i.order_item_modifiers.map(m => ({ option_name: m.option_name })))}</span>` : ''}</span>
            <span>${fmt.currency(i.item_price * i.quantity)}</span>
          </div>`).join('')}
        ${o.notes ? `<div class="text-sm text-muted mt-8">📋 ${o.notes}</div>` : ''}
        <div class="receipt__item receipt__total mt-8" style="padding-top:8px;border-top:1px solid var(--border-lit)">
          <span>Total a cobrar</span>
          <span class="neon-amber">${fmt.currency(o.total)}</span>
        </div>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-muted text-sm">Estado actual</span>
        <span class="badge ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
      </div>
      <div class="text-muted text-xs">Recibida: ${fmt.datetime(o.created_at)}</div>
    </div>`

  let nextStatus = cfg.next
  if (!isDelivery && ds === 'ready') nextStatus = 'delivered'

  document.getElementById('detailModalFooter').innerHTML = `
    <button class="btn btn-outline" onclick="document.getElementById('orderDetailModal').classList.add('hidden')">Cerrar</button>
    ${nextStatus ? `<button class="btn btn-primary" onclick="advanceFromModal('${o.id}','${nextStatus}')">${deliveryStatusCfg[nextStatus]?.icon ?? ''} ${isDelivery || ds !== 'ready' ? (deliveryStatusCfg[nextStatus]?.nextLabel ?? 'Avanzar') : '✅ Marcar Recogido'}</button>` : ''}
  `

  document.getElementById('orderDetailModal').classList.remove('hidden')
}

window.advanceFromModal = async (id, status) => {
  document.getElementById('orderDetailModal').classList.add('hidden')
  await advanceStatus(id, status)
}

// ─── Realtime ──────────────────────────────────────────────────────
function subscribeRealtime() {
  const dot = document.getElementById('realtimeDot')
  supabase
    .channel('delivery-orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
      const t = payload.new?.order_type
      if (!['delivery','takeout'].includes(t)) return
      dot.classList.add('dot--active')
      setTimeout(() => dot.classList.remove('dot--active'), 2000)
      if (payload.eventType === 'INSERT') {
        toast(t === 'delivery' ? '🛵 Nueva orden a domicilio' : '🥡 Nueva orden para llevar', 'info')
      }
      await loadOrders()
    })
    .subscribe(s => { if (s === 'SUBSCRIBED') dot.style.opacity = '1' })
}

init()
