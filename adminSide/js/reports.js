import { supabase, fmt } from '../../shared/supabase-client.js'
import { initAdminShell } from './admin-auth.js'

const EXPENSE_CAT_LABELS = {
  insumos:       '🥩 Insumos',
  servicios:     '💡 Servicios',
  nomina:        '👥 Nómina',
  renta:         '🏠 Renta',
  mantenimiento: '🔧 Mantenimiento',
  marketing:     '📣 Marketing',
  transporte:    '🛵 Transporte',
  otros:         '📦 Otros'
}

let days = 30
let salesChart, paymentChart, categoryChart, expenseCategoryChart, profitChart

async function init() {
  const ctx = await initAdminShell(['admin'])
  if (!ctx) return

  document.getElementById('reportPeriod').addEventListener('change', (e) => {
    days = parseInt(e.target.value)
    loadAll()
  })
  document.getElementById('exportSalesBtn').addEventListener('click',  () => exportSalesCSV())
  document.getElementById('exportOrdersBtn').addEventListener('click', () => exportOrdersCSV())

  await loadAll()
}

async function loadAll() {
  const since = new Date(Date.now() - days * 86400_000).toISOString()

  const [{ data: orders }, { data: payments }, { data: orderItems }, { data: expenses }] = await Promise.all([
    supabase.from('orders').select('*, restaurant_tables(number), profiles!orders_waiter_id_fkey(full_name)')
      .in('status', ['paid', 'delivered']).gte('created_at', since).order('created_at'),
    supabase.from('payments').select('*').gte('created_at', since),
    supabase.from('order_items').select('*, menu_items(name, category_id, categories(name))')
      .gte('created_at', since),
    supabase.from('expenses').select('*').gte('expense_date', since.split('T')[0])
  ])

  renderKPIs(orders, payments, expenses)
  renderDeliveryTimeKPI(orders)
  renderDailySalesChart(orders)
  renderPaymentPieChart(payments, orders)
  renderCategoryChart(orderItems)
  renderExpenseCategoryChart(expenses)
  renderProfitChart(orders, expenses)
  renderTopItems(orderItems)
  renderOrdersTable(orders)

  window._exportOrders = orders
  window._exportPayments = payments
}

function renderKPIs(orders, payments, expenses) {
  // Use order totals so delivery/takeout revenue is included (payments table = dine-in only)
  const revenue   = orders?.reduce((s, o) => s + +o.total, 0) ?? 0
  const customers = new Set(orders?.map(o => o.customer_id).filter(Boolean)).size
  const avg       = orders?.length ? revenue / orders.length : 0
  const totalExpenses = expenses?.reduce((s, e) => s + +e.amount, 0) ?? 0
  const netProfit      = revenue - totalExpenses

  document.getElementById('rTotalRevenue').textContent      = fmt.currency(revenue)
  document.getElementById('rTotalOrders').textContent       = orders?.length ?? 0
  document.getElementById('rAvgTicket').textContent         = fmt.currency(avg)
  document.getElementById('rUniqueCustomers').textContent   = customers
  document.getElementById('rTotalExpenses').textContent     = fmt.currency(totalExpenses)

  const netEl = document.getElementById('rNetProfit')
  netEl.textContent = fmt.currency(netProfit)
  netEl.classList.toggle('text-danger', netProfit < 0)
  netEl.classList.toggle('neon-green', netProfit >= 0)
}

function renderDeliveryTimeKPI(orders) {
  const avgMinutes = (type) => {
    const completed = orders?.filter(o => o.order_type === type && o.status === 'delivered') ?? []
    if (!completed.length) return null
    const totalMin = completed.reduce((s, o) => s + (new Date(o.updated_at) - new Date(o.created_at)) / 60000, 0)
    return Math.round(totalMin / completed.length)
  }

  const deliveryAvg = avgMinutes('delivery')
  const takeoutAvg  = avgMinutes('takeout')

  document.getElementById('rAvgDeliveryTime').textContent = deliveryAvg === null ? '—' : `${deliveryAvg} min`
  document.getElementById('rAvgTakeoutTime').textContent  = takeoutAvg  === null ? '—' : `${takeoutAvg} min`
}

function renderDailySalesChart(orders) {
  const byDay = {}
  orders?.forEach(o => {
    const d = o.created_at.slice(0, 10)
    byDay[d] = (byDay[d] || 0) + +o.total
  })
  const labels = Object.keys(byDay).sort()
  const values = labels.map(d => byDay[d])

  const ctx = document.getElementById('dailySalesChart').getContext('2d')
  if (salesChart) salesChart.destroy()
  salesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Ventas ($)',
        data: values,
        borderColor: '#39FF14',
        backgroundColor: 'rgba(57,255,20,0.08)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#39FF14',
        pointRadius: 4
      }]
    },
    options: chartOptions('$')
  })
}

function renderPaymentPieChart(payments, orders) {
  // Dine-in: use payments table; delivery/takeout: use order.payment_method + order.total
  const byMethod = {}
  payments?.forEach(p => { byMethod[p.method] = (byMethod[p.method] || 0) + +p.amount })
  orders?.filter(o => ['delivery', 'takeout'].includes(o.order_type))
         .forEach(o => {
           const m = o.payment_method || 'cash'
           byMethod[m] = (byMethod[m] || 0) + +o.total
         })
  const labels = Object.keys(byMethod)
  const values = labels.map(m => byMethod[m])

  const ctx = document.getElementById('paymentPieChart').getContext('2d')
  if (paymentChart) paymentChart.destroy()
  paymentChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#39FF14', '#FFB300', '#00BFFF', '#FF3B3B'],
        borderColor: '#161616',
        borderWidth: 2
      }]
    },
    options: {
      ...chartOptions(),
      plugins: {
        legend: { position: 'bottom', labels: { color: '#9E9080', padding: 14, font: { size: 12 } } }
      }
    }
  })
}

function renderCategoryChart(orderItems) {
  const byCat = {}
  orderItems?.forEach(oi => {
    const name = oi.menu_items?.categories?.name ?? 'Sin categoría'
    byCat[name] = (byCat[name] || 0) + oi.quantity * +oi.item_price
  })
  const labels = Object.keys(byCat)
  const values = labels.map(c => byCat[c])

  const ctx = document.getElementById('categoryChart').getContext('2d')
  if (categoryChart) categoryChart.destroy()
  categoryChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Ventas ($)',
        data: values,
        backgroundColor: 'rgba(255,179,0,0.7)',
        borderColor: '#FFB300',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: { ...chartOptions('$'), indexAxis: 'y' }
  })
}

function renderExpenseCategoryChart(expenses) {
  const byCat = {}
  expenses?.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + +e.amount })
  const labels = Object.keys(byCat).map(k => EXPENSE_CAT_LABELS[k] ?? k)
  const values = Object.values(byCat)

  const ctx = document.getElementById('expenseCategoryChart').getContext('2d')
  if (expenseCategoryChart) expenseCategoryChart.destroy()
  expenseCategoryChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Gastos ($)',
        data: values,
        backgroundColor: 'rgba(255,59,59,0.7)',
        borderColor: '#FF3B3B',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: { ...chartOptions('$'), indexAxis: 'y' }
  })
}

function renderProfitChart(orders, expenses) {
  const revenueByDay = {}
  orders?.forEach(o => {
    const d = o.created_at.slice(0, 10)
    revenueByDay[d] = (revenueByDay[d] || 0) + +o.total
  })
  const expenseByDay = {}
  expenses?.forEach(e => { expenseByDay[e.expense_date] = (expenseByDay[e.expense_date] || 0) + +e.amount })

  const labels = [...new Set([...Object.keys(revenueByDay), ...Object.keys(expenseByDay)])].sort()
  const revenueValues = labels.map(d => revenueByDay[d] || 0)
  const expenseValues = labels.map(d => expenseByDay[d] || 0)

  const ctx = document.getElementById('profitChart').getContext('2d')
  if (profitChart) profitChart.destroy()
  profitChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Ingresos',
          data: revenueValues,
          borderColor: '#39FF14',
          backgroundColor: 'rgba(57,255,20,0.08)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#39FF14',
          pointRadius: 3
        },
        {
          label: 'Gastos',
          data: expenseValues,
          borderColor: '#FF3B3B',
          backgroundColor: 'rgba(255,59,59,0.08)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#FF3B3B',
          pointRadius: 3
        }
      ]
    },
    options: {
      ...chartOptions('$'),
      plugins: {
        ...chartOptions('$').plugins,
        legend: { display: true, labels: { color: '#9E9080', font: { size: 11 } } }
      }
    }
  })
}

function renderTopItems(orderItems) {
  const byItem = {}
  orderItems?.forEach(oi => {
    const name = oi.menu_items?.name ?? oi.item_name
    if (!byItem[name]) byItem[name] = { qty: 0, revenue: 0 }
    byItem[name].qty     += oi.quantity
    byItem[name].revenue += oi.quantity * +oi.item_price
  })
  const sorted = Object.entries(byItem).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10)
  const max = sorted[0]?.[1].qty || 1

  const el = document.getElementById('topItemsReport')
  el.innerHTML = sorted.map(([name, d], i) => `
    <div class="top-item-row">
      <div class="top-item-rank ${i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : ''}">${i + 1}</div>
      <span style="flex:1;font-size:.85rem">${name}</span>
      <div class="top-item-bar"><div class="top-item-bar__fill" style="width:${(d.qty/max*100).toFixed(0)}%"></div></div>
      <span class="text-sm" style="min-width:40px;text-align:right">${d.qty}x</span>
    </div>
  `).join('')
}

function renderOrdersTable(orders) {
  const statusCls = { paid: 'badge-green', cancelled: 'badge-danger', open: 'badge-amber' }
  const tbody = document.getElementById('ordersReportBody')

  if (!orders?.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-center" style="padding:32px">Sin órdenes en este período.</td></tr>'
    return
  }

  tbody.innerHTML = orders.map(o => {
    const typeLabel = o.order_type === 'delivery' ? '🛵 Domicilio'
                    : o.order_type === 'takeout'  ? '🥡 Para Llevar'
                    : `🍽 Mesa ${o.restaurant_tables?.number ?? '—'}`
    const who = o.order_type === 'dine-in'
      ? (o.profiles?.full_name ?? '—')
      : (o.delivery_name ?? '—')
    return `
    <tr>
      <td>${fmt.datetime(o.created_at)}</td>
      <td>${typeLabel}</td>
      <td>${who}</td>
      <td>${o.delivery_phone ?? '—'}</td>
      <td class="neon-amber" style="font-weight:700">${fmt.currency(o.total)}</td>
      <td><span class="badge ${statusCls[o.status] ?? 'badge-muted'}">${o.status}</span></td>
    </tr>`
  }).join('')
}

function exportSalesCSV() {
  const orders = window._exportOrders || []
  const rows = [['Fecha', 'Tipo', 'Cliente', 'Teléfono', 'Subtotal', 'IVA', 'Total', 'Pago', 'Estado']]
  orders.forEach(o => {
    const typeLabel = o.order_type === 'delivery' ? 'Domicilio'
                    : o.order_type === 'takeout'  ? 'Para Llevar'
                    : `Mesa ${o.restaurant_tables?.number ?? ''}`
    const who = o.order_type === 'dine-in' ? (o.profiles?.full_name ?? '') : (o.delivery_name ?? '')
    rows.push([fmt.datetime(o.created_at), typeLabel, who, o.delivery_phone ?? '', o.subtotal, o.tax, o.total, o.payment_method ?? '', o.status])
  })
  downloadCSV(rows, `ventas-${days}d.csv`)
}

function exportOrdersCSV() { exportSalesCSV() }

function downloadCSV(rows, filename) {
  const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  link.download = filename
  link.click()
}

// ─── Chart.js defaults ────────────────────────────────────────────
function chartOptions(prefix = '') {
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e1e1e',
        borderColor: '#2e2e2e',
        borderWidth: 1,
        titleColor: '#F2ECD8',
        bodyColor: '#9E9080',
        callbacks: {
          label: (ctx) => ` ${prefix}${(+ctx.parsed.y || +ctx.parsed).toFixed(2)}`
        }
      }
    },
    scales: {
      x: { ticks: { color: '#5A5045', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#5A5045', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  }
}

init()
