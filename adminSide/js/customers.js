import { supabase, fmt } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'

let allCustomers   = []
let selectedCustId = null

async function init() {
  const ctx = await initAdminShell(['admin'])
  if (!ctx) return

  document.getElementById('customerSearch').addEventListener('input', (e) => renderTable(e.target.value))
  document.getElementById('exportCustomersBtn').addEventListener('click', exportCSV)
  document.getElementById('custModalClose').addEventListener('click', () => document.getElementById('customerModal').classList.add('hidden'))
  document.getElementById('applyPointsBtn').addEventListener('click', applyPointsAdjust)

  await loadCustomers()
}

async function loadCustomers() {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .or('role.eq.customer,role.is.null')
    .order('loyalty_points', { ascending: false })

  // Fetch visit counts per customer — include delivery/takeout (delivered) and dine-in (paid)
  const { data: orders } = await supabase
    .from('orders')
    .select('customer_id, total')
    .in('status', ['paid', 'delivered'])
    .not('customer_id', 'is', null)

  const visitMap = {}
  const spentMap = {}
  orders?.forEach(o => {
    visitMap[o.customer_id] = (visitMap[o.customer_id] || 0) + 1
    spentMap[o.customer_id] = (spentMap[o.customer_id] || 0) + +o.total
  })

  allCustomers = (profiles || []).map(p => ({
    ...p,
    visits:      visitMap[p.id] || 0,
    total_spent: spentMap[p.id] || 0
  }))

  renderStats()
  renderTable('')
}

function renderStats() {
  document.getElementById('totalCustomers').textContent = allCustomers.length
  const totalPts = allCustomers.reduce((s, c) => s + (c.loyalty_points || 0), 0)
  document.getElementById('totalPoints').textContent   = totalPts.toLocaleString()
  document.getElementById('vipCustomers').textContent  = allCustomers.filter(c => c.loyalty_points >= 500).length
}

function renderTable(query = '') {
  const q  = query.toLowerCase()
  const filtered = allCustomers.filter(c =>
    (c.full_name || '').toLowerCase().includes(q) ||
    (c.phone || '').includes(q)
  )

  const tbody = document.getElementById('customersTableBody')
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-center" style="padding:32px">Sin clientes encontrados.</td></tr>'
    return
  }

  tbody.innerHTML = filtered.map(c => `
    <tr>
      <td>
        <div style="font-weight:600">${c.full_name || '(Sin nombre)'}</div>
        ${c.loyalty_points >= 500 ? '<span class="badge badge-amber text-xs">VIP</span>' : ''}
      </td>
      <td>${c.phone || '—'}</td>
      <td>
        <span class="neon-green" style="font-weight:700">${c.loyalty_points || 0}</span>
        <span class="text-muted text-xs"> pts</span>
      </td>
      <td>${c.visits}</td>
      <td>${fmt.currency(c.total_spent)}</td>
      <td>${fmt.date(c.created_at)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openCustomer('${c.id}')">Ver</button>
      </td>
    </tr>
  `).join('')
}

window.openCustomer = async (id) => {
  selectedCustId = id
  const c = allCustomers.find(x => x.id === id)
  document.getElementById('custModalName').textContent = c?.full_name || 'Cliente'
  document.getElementById('customerModal').classList.remove('hidden')
  document.getElementById('pointsAdjust').value = ''
  document.getElementById('pointsNote').value   = ''

  // Load loyalty history
  const { data: loyalty } = await supabase
    .from('loyalty_transactions')
    .select('*')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: reservations } = await supabase
    .from('reservations')
    .select('*')
    .eq('customer_id', id)
    .order('reservation_date', { ascending: false })
    .limit(5)

  document.getElementById('custModalContent').innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
      <div class="stat-card" style="padding:12px"><div class="stat-label">Puntos</div><div class="stat-value" style="font-size:1.4rem;color:var(--green)">${c?.loyalty_points ?? 0}</div></div>
      <div class="stat-card" style="padding:12px"><div class="stat-label">Visitas</div><div class="stat-value" style="font-size:1.4rem">${c?.visits ?? 0}</div></div>
      <div class="stat-card" style="padding:12px"><div class="stat-label">Gastado</div><div class="stat-value" style="font-size:1.4rem;color:var(--amber)">${fmt.currency(c?.total_spent ?? 0)}</div></div>
    </div>
    <h4 style="margin-bottom:8px">Historial de Puntos</h4>
    ${loyalty?.length ? loyalty.map(l => `
      <div class="loyalty-item ${l.type}" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.85rem">
        <span>${fmt.date(l.created_at)}</span>
        <span style="font-weight:700;color:${l.type === 'earned' ? 'var(--green)' : 'var(--amber)'}">${l.type === 'earned' ? '+' : '-'}${l.points} pts</span>
      </div>`).join('') : '<p class="text-muted text-sm">Sin movimientos.</p>'}
    <h4 style="margin:16px 0 8px">Reservaciones</h4>
    ${reservations?.length ? reservations.map(r => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.85rem">
        <span>${fmt.date(r.reservation_date)} ${r.reservation_time.slice(0,5)}</span>
        <span class="badge badge-${r.status === 'confirmed' ? 'green' : r.status === 'cancelled' ? 'danger' : 'amber'}">${r.status}</span>
      </div>`).join('') : '<p class="text-muted text-sm">Sin reservaciones.</p>'}
  `
}

async function applyPointsAdjust() {
  if (!selectedCustId) return
  const pts  = parseInt(document.getElementById('pointsAdjust').value)
  if (!pts || isNaN(pts)) { toast('Ingresa un valor válido', 'warning'); return }

  const c = allCustomers.find(x => x.id === selectedCustId)
  const newPts = Math.max(0, (c?.loyalty_points || 0) + pts)

  const { error } = await supabase.from('profiles').update({ loyalty_points: newPts }).eq('id', selectedCustId)
  if (error) { toast('Error', 'error'); return }

  await supabase.from('loyalty_transactions').insert({
    customer_id: selectedCustId,
    points:      Math.abs(pts),
    type:        pts > 0 ? 'earned' : 'redeemed'
  })

  toast(`Puntos ${pts > 0 ? 'agregados' : 'descontados'} correctamente`)
  await loadCustomers()
  await openCustomer(selectedCustId)
}

function exportCSV() {
  const rows = [['Nombre', 'Teléfono', 'Puntos', 'Visitas', 'Total Gastado', 'Registro']]
  allCustomers.forEach(c => rows.push([c.full_name || '', c.phone || '', c.loyalty_points || 0, c.visits, c.total_spent.toFixed(2), fmt.date(c.created_at)]))
  const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  link.download = `clientes-${new Date().toISOString().slice(0,10)}.csv`
  link.click()
}

init()
