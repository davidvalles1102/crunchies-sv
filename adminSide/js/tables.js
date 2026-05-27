import { supabase } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'

let tables   = []
let activeQR = null

const STATUS_LABEL = { available: 'Disponible', occupied: 'Ocupada', reserved: 'Reservada', maintenance: 'Mantenimiento' }
const STATUS_BADGE = { available: 'badge-green', occupied: 'badge-danger', reserved: 'badge-amber', maintenance: 'badge-muted' }

async function init() {
  const ctx = await initAdminShell(['admin'])
  if (!ctx) return
  await loadTables()
  setupModal()
}

async function loadTables() {
  const { data } = await supabase.from('restaurant_tables').select('*').order('number')
  tables = data || []
  renderTables()
}

function renderTables() {
  const grid = document.getElementById('tablesGrid')
  if (!tables.length) {
    grid.innerHTML = '<p class="text-muted">No hay mesas registradas en la base de datos.</p>'
    return
  }
  grid.innerHTML = tables.map(t => `
    <div class="tbl-card tbl-card--${t.status}">
      <div class="tbl-card__top">
        <div class="tbl-card__num">Mesa ${t.number}</div>
        <span class="badge ${STATUS_BADGE[t.status] ?? 'badge-muted'}">${STATUS_LABEL[t.status] ?? t.status}</span>
      </div>
      <div class="tbl-card__meta">📍 ${t.location} &nbsp;·&nbsp; 👤 ${t.capacity} personas</div>
      <div class="tbl-card__actions">
        <button class="btn btn-primary btn-sm" onclick="showQR('${t.id}', ${t.number})">📱 Ver QR</button>
        ${t.status === 'occupied'
          ? `<button class="btn btn-danger btn-sm" onclick="releaseTable('${t.id}', ${t.number})">🔓 Liberar</button>`
          : `<button class="btn btn-outline btn-sm" onclick="toggleMaintenance('${t.id}','${t.status}')">
               ${t.status === 'maintenance' ? '✓ Activar' : '⚙ Mantenimiento'}
             </button>`}
      </div>
    </div>
  `).join('')
}

function setupModal() {
  document.getElementById('qrModalClose').addEventListener('click', () => {
    document.getElementById('qrModal').classList.add('hidden')
    activeQR = null
  })

  document.getElementById('downloadQrBtn').addEventListener('click', () => {
    if (!activeQR) return
    const canvas = document.querySelector('#qrContainer canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `mesa-${activeQR.number}-qr.png`
    a.click()
  })
}

window.showQR = (id, number) => {
  activeQR = { id, number }
  const url = `${location.origin}/customerSide/table-order.html?table=${id}`

  document.getElementById('qrModalTitle').textContent = `QR — Mesa ${number}`
  document.getElementById('qrUrl').textContent = url
  document.getElementById('qrModal').classList.remove('hidden')

  const container = document.getElementById('qrContainer')
  container.innerHTML = ''
  new QRCode(container, {
    text: url,
    width: 256,
    height: 256,
    colorDark:  '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  })
}

window.releaseTable = async (id, number) => {
  // Verificar si hay orden activa en la mesa
  const { data: active } = await supabase
    .from('orders')
    .select('id, status')
    .eq('table_id', id)
    .in('status', ['open', 'in_kitchen', 'ready', 'delivered'])
    .limit(1)

  if (active?.length) {
    const statusLabel = { open: 'abierta', in_kitchen: 'en cocina', ready: 'lista', delivered: 'entregada' }
    const go = confirm(
      `⚠️ Mesa ${number} tiene una orden ${statusLabel[active[0].status] ?? active[0].status}.\n\n` +
      `¿Liberar la mesa de todas formas?`
    )
    if (!go) return
  }

  const { error } = await supabase.from('restaurant_tables').update({ status: 'available' }).eq('id', id)
  if (error) { toast('Error al liberar la mesa', 'error'); return }
  const t = tables.find(x => x.id === id)
  if (t) t.status = 'available'
  renderTables()
  toast(`Mesa ${number} liberada ✓`, 'success')
}

window.toggleMaintenance = async (id, currentStatus) => {
  const newStatus = currentStatus === 'maintenance' ? 'available' : 'maintenance'
  const { error } = await supabase.from('restaurant_tables').update({ status: newStatus }).eq('id', id)
  if (error) { toast('Error al actualizar la mesa', 'error'); return }
  const t = tables.find(x => x.id === id)
  if (t) t.status = newStatus
  renderTables()
  toast(newStatus === 'maintenance' ? 'Mesa en mantenimiento' : 'Mesa activada')
}

init()
