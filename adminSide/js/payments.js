import { supabase, fmt } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'

let allPayments     = []
let filterDate      = new Date().toISOString().split('T')[0]
let lastPaymentData = null   // snapshot para WhatsApp

async function init() {
  const ctx = await initAdminShell(['admin', 'waiter'])
  if (!ctx) return

  const dateInput = document.getElementById('filterDate')
  dateInput.value = filterDate
  dateInput.addEventListener('change', (e) => { filterDate = e.target.value; loadPayments() })

  document.getElementById('exportBtn').addEventListener('click', exportCSV)
  document.getElementById('receiptClose').addEventListener('click',  () => document.getElementById('receiptModal').classList.add('hidden'))
  document.getElementById('receiptClose2').addEventListener('click', () => document.getElementById('receiptModal').classList.add('hidden'))

  // WhatsApp modal
  document.getElementById('waModalClose').addEventListener('click', () => document.getElementById('waModal').classList.add('hidden'))
  document.getElementById('waCancel').addEventListener('click',     () => document.getElementById('waModal').classList.add('hidden'))
  document.getElementById('waConfirm').addEventListener('click',    confirmWhatsApp)
  document.getElementById('waPhone').addEventListener('keydown', e => { if (e.key === 'Enter') confirmWhatsApp() })

  await loadPayments()
}

async function loadPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*, orders(*, restaurant_tables(number)), profiles!payments_processed_by_fkey(full_name)')
    .gte('created_at', `${filterDate}T00:00:00`)
    .lte('created_at', `${filterDate}T23:59:59`)
    .order('created_at', { ascending: false })

  if (error) { toast('Error al cargar pagos', 'error'); return }
  allPayments = data || []
  renderStats()
  renderTable()
}

function renderStats() {
  const total    = allPayments.reduce((s, p) => s + +p.amount, 0)
  const byCash   = allPayments.filter(p => p.method === 'cash').reduce((s, p) => s + +p.amount, 0)
  const byCard   = allPayments.filter(p => p.method === 'card').reduce((s, p) => s + +p.amount, 0)
  const byTrans  = allPayments.filter(p => p.method === 'transfer').reduce((s, p) => s + +p.amount, 0)

  document.getElementById('dayTotal').textContent       = fmt.currency(total)
  document.getElementById('cashTotal').textContent      = fmt.currency(byCash)
  document.getElementById('cardTotal').textContent      = fmt.currency(byCard)
  document.getElementById('transferTotal').textContent  = fmt.currency(byTrans)
}

function renderTable() {
  const methodIcon = { cash: '💵', card: '💳', transfer: '📲', points: '⭐' }
  const tbody = document.getElementById('paymentsTableBody')

  if (!allPayments.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-muted text-center" style="padding:32px">Sin pagos para esta fecha.</td></tr>'
    return
  }

  tbody.innerHTML = allPayments.map(p => `
    <tr>
      <td><span class="text-xs" style="font-family:monospace">${p.receipt_number}</span></td>
      <td>Mesa ${p.orders?.restaurant_tables?.number ?? '—'}</td>
      <td>${methodIcon[p.method] ?? ''} ${p.method}</td>
      <td class="neon-green" style="font-weight:700">${fmt.currency(p.amount)}</td>
      <td>${p.change_amount > 0 ? fmt.currency(p.change_amount) : '—'}</td>
      <td>${p.profiles?.full_name ?? '—'}</td>
      <td>${fmt.time(p.created_at)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="showReceipt('${p.id}')">🖨️</button>
      </td>
    </tr>
  `).join('')
}

window.showReceipt = (payId) => {
  const p = allPayments.find(x => x.id === payId)
  if (!p) return

  // Guardar snapshot para WhatsApp
  lastPaymentData = p

  document.getElementById('receiptContent').innerHTML = `
    <div class="receipt">
      <div class="receipt__logo">Neón y Sabor Mi Rancho</div>
      <div class="receipt__address">${fmt.datetime(p.created_at)}</div>
      <hr class="receipt__divider">
      <div>Recibo: ${p.receipt_number}</div>
      <div>Mesa: ${p.orders?.restaurant_tables?.number ?? '—'}</div>
      <div>Cajero: ${p.profiles?.full_name ?? '—'}</div>
      <hr class="receipt__divider">
      <div class="receipt__item receipt__total"><span>TOTAL</span><span>${fmt.currency(p.amount)}</span></div>
      <div class="receipt__item"><span>Método</span><span>${p.method}</span></div>
      ${p.change_amount > 0 ? `<div class="receipt__item"><span>Cambio</span><span>${fmt.currency(p.change_amount)}</span></div>` : ''}
      <hr class="receipt__divider">
      <div class="receipt__thanks">¡Gracias por su visita!</div>
    </div>`
  document.getElementById('receiptModal').classList.remove('hidden')
}

// ─── WhatsApp ─────────────────────────────────────────────────────
window.openWhatsAppModal = function () {
  if (!lastPaymentData) return
  document.getElementById('waPhone').value = ''
  document.getElementById('waModal').classList.remove('hidden')
  document.getElementById('waPhone').focus()
}

function buildWhatsAppText(p) {
  const methodLabels = { cash: 'Efectivo 💵', card: 'Tarjeta 💳', transfer: 'Transferencia 📲', points: 'Puntos ⭐' }
  const changeLine = p.change_amount > 0 ? `\nCambio: ${fmt.currency(p.change_amount)}` : ''
  return [
    `🍽️ *Neón y Sabor Mi Rancho*`,
    `Recibo: ${p.receipt_number}`,
    `📅 ${fmt.datetime(p.created_at)}`,
    `Mesa: ${p.orders?.restaurant_tables?.number ?? '—'}`,
    `─────────────────────`,
    `*TOTAL: ${fmt.currency(p.amount)}*`,
    `Método: ${methodLabels[p.method] ?? p.method}${changeLine}`,
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
  const text = encodeURIComponent(buildWhatsAppText(lastPaymentData))
  window.open(`https://wa.me/${raw}?text=${text}`, '_blank')
  document.getElementById('waModal').classList.add('hidden')
}

function exportCSV() {
  const rows = [['Recibo', 'Mesa', 'Método', 'Monto', 'Cambio', 'Cajero', 'Fecha/Hora']]
  allPayments.forEach(p => {
    rows.push([
      p.receipt_number,
      `Mesa ${p.orders?.restaurant_tables?.number ?? ''}`,
      p.method,
      p.amount,
      p.change_amount,
      p.profiles?.full_name ?? '',
      fmt.datetime(p.created_at)
    ])
  })
  const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  link.download = `pagos-${filterDate}.csv`
  link.click()
}

init()
