import { supabase, getCustomerSession, getProfile, fmt } from '../../shared/supabase-client.js'

const STATUS_CFG = {
  pending:    { label: 'Pendiente',   cls: 'badge-amber', icon: '🕐', active: true  },
  preparing:  { label: 'Preparando',  cls: 'badge-info',  icon: '🔥', active: true  },
  ready:      { label: 'Listo',       cls: 'badge-green', icon: '✅', active: true  },
  on_the_way: { label: 'En Camino',   cls: 'badge-green', icon: '🛵', active: true  },
  delivered:  { label: 'Entregado',   cls: 'badge-muted', icon: '📦', active: false },
}

let currentPhone    = ''
let realtimeChannel = null

async function init() {
  // Auto-fill phone from profile if logged in
  const session = await getCustomerSession()
  if (session) {
    const profile = await getProfile(session.user.id)
    if (profile?.phone) {
      document.getElementById('phoneInput').value = profile.phone
      currentPhone = profile.phone
      await searchOrders(profile.phone)
    }
  }

  document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const phone = document.getElementById('phoneInput').value.trim()
    if (!phone) return
    currentPhone = phone
    await searchOrders(phone)
  })
}

async function searchOrders(phone) {
  const el = document.getElementById('ordersResult')
  el.innerHTML = '<p class="text-muted text-sm" style="text-align:center;padding:32px">Buscando...</p>'

  // Last 7 days
  const since = new Date()
  since.setDate(since.getDate() - 7)

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), drivers(full_name, phone)')
    .eq('delivery_phone', phone)
    .in('order_type', ['delivery', 'takeout'])
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(15)

  if (error || !data?.length) {
    el.innerHTML = `
      <div class="mis-pedidos-empty">
        <div style="font-size:2.5rem">🔍</div>
        <p class="text-muted text-sm mt-8">No se encontraron pedidos con ese número en los últimos 7 días.</p>
        <a href="order.html" class="btn btn-primary mt-16">Hacer un Pedido</a>
      </div>`
    return
  }

  renderOrders(data)
  subscribeRealtime()
}

function renderOrders(orders) {
  const active   = orders.filter(o => STATUS_CFG[o.delivery_status]?.active !== false)
  const finished = orders.filter(o => !STATUS_CFG[o.delivery_status]?.active)

  let html = ''
  if (active.length) {
    html += `<h4 class="mis-pedidos-section-title">Activos</h4>`
    html += active.map(buildCard).join('')
  }
  if (finished.length) {
    html += `<h4 class="mis-pedidos-section-title mt-24">Entregados</h4>`
    html += finished.map(buildCard).join('')
  }

  document.getElementById('ordersResult').innerHTML = html
}

function buildCard(order) {
  const ds         = order.delivery_status || 'pending'
  const cfg        = STATUS_CFG[ds] ?? STATUS_CFG.pending
  const isDelivery = order.order_type === 'delivery'
  const items      = order.order_items || []
  const isActive   = cfg.active !== false

  const itemsText = items.length
    ? items.slice(0, 3).map(i => `${i.quantity}× ${i.item_name}`).join(' · ')
      + (items.length > 3 ? ` +${items.length - 3} más` : '')
    : 'Sin items'

  return `
    <div class="mis-pedidos-card ${isActive ? 'mis-pedidos-card--active' : ''}">
      <div class="mis-pedidos-card__header">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:1.1rem">${isDelivery ? '🛵' : '🥡'}</span>
          <span style="font-weight:600">${isDelivery ? 'Domicilio' : 'Para Llevar'}</span>
          <span class="text-muted text-xs">#${order.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <span class="badge ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
      </div>

      <div class="mis-pedidos-card__items">${itemsText}</div>

      ${isDelivery && isActive && order.drivers ? `
        <div class="text-xs mt-8" style="color:var(--green)">🛵 ${order.drivers.full_name} — <a href="tel:${order.drivers.phone}" style="color:inherit">${order.drivers.phone}</a></div>
      ` : ''}

      <div class="mis-pedidos-card__footer">
        <span class="text-xs text-muted">${fmt.datetime(order.created_at)}</span>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span class="neon-amber" style="font-weight:700">${fmt.currency(order.total)}</span>
          ${isActive
            ? `<a href="track.html?id=${order.id}" class="btn btn-primary btn-sm">📍 Seguir en vivo</a>`
            : `<a href="track.html?id=${order.id}" class="btn btn-outline btn-sm">Ver detalle</a>`
          }
        </div>
      </div>

      ${isActive ? `<div class="mis-pedidos-card__progress">
        ${buildMiniStepper(order)}
      </div>` : ''}
    </div>`
}

function buildMiniStepper(order) {
  const isDelivery = order.order_type === 'delivery'
  const steps = isDelivery
    ? ['pending', 'preparing', 'ready', 'on_the_way', 'delivered']
    : ['pending', 'preparing', 'ready']

  const currentIdx = steps.indexOf(order.delivery_status || 'pending')

  return `<div class="mini-stepper">
    ${steps.map((key, i) => {
      const cfg  = STATUS_CFG[key]
      const done = i < currentIdx
      const cur  = i === currentIdx
      return `<div class="mini-step ${done ? 'done' : cur ? 'active' : ''}">
        <div class="mini-step__dot">${done ? '✓' : cfg.icon}</div>
        <div class="mini-step__label">${cfg.label}</div>
      </div>`
    }).join('')}
  </div>`
}

function subscribeRealtime() {
  realtimeChannel?.unsubscribe()
  document.getElementById('liveDot').style.opacity = '1'

  realtimeChannel = supabase
    .channel('mis-pedidos-live')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      () => {
        if (currentPhone) searchOrders(currentPhone)
      })
    .subscribe()
}

init()
