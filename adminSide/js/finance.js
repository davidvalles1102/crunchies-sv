import { supabase, fmt } from '../../shared/supabase-client.js'
import { initAdminShell, toast } from './admin-auth.js'

const CAT_LABELS = {
  insumos:       '🥩 Insumos',
  servicios:     '💡 Servicios',
  nomina:        '👥 Nómina',
  renta:         '🏠 Renta',
  mantenimiento: '🔧 Mantenimiento',
  marketing:     '📣 Marketing',
  transporte:    '🛵 Transporte',
  otros:         '📦 Otros'
}

const SEED_ITEMS = [
  { name: 'Pollo Entero',     price: 12 },
  { name: 'Media Pollo',      price: 7  },
  { name: '1/4 Pollo',        price: 5  },
  { name: 'Alas 6 pzs',       price: 8  },
  { name: 'Alas 12 pzs',      price: 14 },
  { name: 'Combo Rancho',     price: 10 },
  { name: 'Sopa de Gallina',  price: 8  },
  { name: 'Enchiladas 3 pzs', price: 5  },
  { name: 'Arroz con Pollo',  price: 7  },
  { name: 'Refresco',         price: 2  },
  { name: 'Agua Pura',        price: 1  },
]

let plChart, pieChart
let days = 30
let _orders = [], _expenses = [], _items = []
let _usingDemo = false

// ── Deterministic demo data (no DB needed) ─────────────────────────────────
// Uses a simple seeded-random so numbers are stable across reloads.
function buildStaticDemo() {
  let seed = 42
  const rng  = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff }
  const ri   = (lo, hi) => Math.floor(rng() * (hi - lo + 1)) + lo
  const pick = ()       => SEED_ITEMS[Math.floor(rng() * SEED_ITEMS.length)]

  const orders = [], expenses = [], items = []

  for (let d = 0; d < 30; d++) {
    const base = new Date()
    base.setDate(base.getDate() - (30 - d))
    base.setHours(12, 0, 0, 0)
    const dateStr = base.toISOString().split('T')[0]
    const dow     = base.getDay()
    const dom     = base.getDate()
    const nOrders = dow === 5 ? ri(15,23) : (dow===0||dow===6) ? ri(18,28) : ri(9,16)

    for (let n = 0; n < nOrders; n++) {
      const ts = new Date(base)
      ts.setSeconds(ri(0, 36000))
      const created = ts.toISOString()
      let total = 0
      for (let i = 0; i < ri(1,4); i++) {
        const item = pick(), qty = ri(1,3)
        total += item.price * qty
        items.push({ item_name: item.name, item_price: item.price, quantity: qty, created_at: created })
      }
      orders.push({ total, created_at: created })
    }

    expenses.push({ expense_date: dateStr, category: 'insumos', amount: ri(50,80) })
    if (dow === 1)           expenses.push({ expense_date: dateStr, category: 'nomina',        amount: 175 })
    if (dom === 1)           expenses.push({ expense_date: dateStr, category: 'renta',         amount: 350 },
                                            { expense_date: dateStr, category: 'servicios',     amount: 120 })
    if (dom===1||dom===15)   expenses.push({ expense_date: dateStr, category: 'mantenimiento', amount: 40  })
    if (dom===7||dom===21)   expenses.push({ expense_date: dateStr, category: 'marketing',     amount: 30  })
    if (rng() < 0.3)         expenses.push({ expense_date: dateStr, category: 'transporte',    amount: ri(15,30) })
  }

  return { orders, expenses, items }
}

async function init() {
  const ctx = await initAdminShell(['admin', 'waiter'])
  if (!ctx) return

  document.getElementById('filterPeriod').addEventListener('change', (e) => {
    days = parseInt(e.target.value)
    loadAll()
  })
  document.getElementById('exportEdcBtn').addEventListener('click', exportEDC)

  await loadAll()
}

async function loadAll() {
  const since = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0]

  const [
    // Ingresos reales = total de la orden, no solo lo que pasó por `payments`
    // (domicilio/llevar se cobran en efectivo/Nequi fuera del sistema y NUNCA
    // generan fila en `payments` — usar esa tabla aquí subestimaría ingresos)
    { data: orders,   error: errO },
    { data: expenses, error: errE },
    { data: items,    error: errI }
  ] = await Promise.all([
    supabase.from('orders').select('total, created_at, order_type')
      .in('status', ['paid', 'delivered']).gte('created_at', since + 'T00:00:00'),
    supabase.from('expenses').select('*').gte('expense_date', since).order('expense_date'),
    supabase.from('order_items').select('item_name, item_price, quantity').gte('created_at', since + 'T00:00:00')
  ])

  const expensesMissing = errE && errE.code === '42P01'
  if (expensesMissing) showExpensesSetup()
  if (errO) toast('Error al cargar órdenes', 'error')

  const realOrders    = orders    || []
  const realExpenses  = expensesMissing ? [] : (expenses || [])
  const realItems     = items     || []
  const hasRealData   = realOrders.length > 0 || realExpenses.length > 0

  if (hasRealData) {
    _usingDemo = false
    _orders    = realOrders
    _expenses  = realExpenses
    _items     = realItems
    hideSeedBanner()
  } else {
    // No DB data — render from static demo so charts are always populated
    _usingDemo = true
    const demo = buildStaticDemo()
    _orders    = demo.orders
    _expenses  = demo.expenses
    _items     = demo.items
    showSeedBanner()
  }

  renderKPIs()
  renderPLChart()
  renderExpensePie()
  renderTopProducts()
  renderEDC()
}

// ── Empty-state banners ────────────────────────────────────────────────────

function showExpensesSetup() {
  if (document.getElementById('_setupBanner')) return
  const el = document.createElement('div')
  el.id = '_setupBanner'
  el.style.cssText = 'background:rgba(255,153,0,.1);border:1px solid var(--amber);border-radius:10px;padding:16px 20px;margin-bottom:20px'
  el.innerHTML = `<strong style="color:var(--amber)">⚠️ Tabla de gastos no creada</strong>
    <p style="font-size:.85rem;color:var(--muted);margin:6px 0 0">Ejecuta <code>supabase/expenses_create.sql</code> en Supabase SQL Editor y recarga la página.</p>`
  document.querySelector('.admin-content').prepend(el)
}

function showSeedBanner() {
  if (document.getElementById('_seedBanner')) return
  const el = document.createElement('div')
  el.id = '_seedBanner'
  el.style.cssText = 'background:rgba(255,102,0,.08);border:1px solid var(--green);border-radius:10px;padding:16px 20px;margin-bottom:20px'
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <strong style="color:var(--text);font-size:.9rem">📊 Vista previa con datos demo</strong>
        <p style="font-size:.8rem;color:var(--muted);margin:4px 0 0">Guarda estos datos reales en la base de datos para usar el portal con datos persistentes.</p>
      </div>
      <button class="btn btn-primary btn-sm" id="_seedBtn">▶ Guardar en base de datos</button>
    </div>
    <div id="_seedProgress" style="display:none;margin-top:12px">
      <div style="background:var(--bg2);border-radius:6px;height:8px;overflow:hidden">
        <div id="_seedBar" style="background:var(--green);height:100%;width:0;transition:width .3s"></div>
      </div>
      <p id="_seedLog" style="font-size:.78rem;color:var(--muted);margin-top:6px">Iniciando…</p>
    </div>`
  document.querySelector('.admin-content').prepend(el)
  document.getElementById('_seedBtn').addEventListener('click', runSeed)
}

function hideSeedBanner() {
  document.getElementById('_seedBanner')?.remove()
  document.getElementById('_setupBanner')?.remove()
}

// ── Seed runner ────────────────────────────────────────────────────────────

async function runSeed() {
  const ok = confirm(
    '⚠️ Esto va a INSERTAR 30 días de órdenes, items, pagos y gastos ficticios ' +
    'directamente en tu base de datos real (no es una simulación).\n\n' +
    'Úsalo solo para poblar un ambiente de pruebas — no lo hagas en producción ' +
    'con clientes reales.\n\n¿Continuar?'
  )
  if (!ok) return

  document.getElementById('_seedBtn').disabled = true
  document.getElementById('_seedProgress').style.display = 'block'
  const bar = document.getElementById('_seedBar')
  const log = document.getElementById('_seedLog')

  const ri   = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo
  const pick = ()       => SEED_ITEMS[Math.floor(Math.random() * SEED_ITEMS.length)]
  const mkTs = (base, sec) => { const d = new Date(base); d.setSeconds(d.getSeconds() + sec); return d.toISOString() }

  for (let d = 0; d < 30; d++) {
    const base = new Date()
    base.setDate(base.getDate() - (30 - d))
    base.setHours(10, 0, 0, 0)
    const dateStr = base.toISOString().split('T')[0]
    const dow = base.getDay(), dom = base.getDate()
    const nOrders = dow === 5 ? ri(15,23) : (dow===0||dow===6) ? ri(18,28) : ri(9,16)

    log.textContent = `${dateStr} — ${nOrders} órdenes…`

    const orders = [], allItems = [], payments = []
    for (let n = 0; n < nOrders; n++) {
      const oid = crypto.randomUUID(), ts = mkTs(base, ri(0,36000))
      let total = 0
      for (let i = 0; i < ri(1,4); i++) {
        const item = pick(), qty = ri(1,3)
        total += item.price * qty
        allItems.push({ order_id: oid, item_name: item.name, item_price: item.price, quantity: qty, created_at: ts })
      }
      orders.push({ id: oid, status: 'paid', subtotal: total, tax: 0, total, created_at: ts, updated_at: ts })
      const r = Math.random()
      payments.push({ order_id: oid, amount: total, created_at: ts,
        method: r<0.75?'cash':r<0.95?'card':'transfer',
        receipt_number: `R-SEED-${String(d*100+n+1).padStart(5,'0')}` })
    }

    const { error: e1 } = await supabase.from('orders').insert(orders)
    if (e1) { toast(`Error: ${e1.message}`, 'error'); break }
    await Promise.all([supabase.from('order_items').insert(allItems), supabase.from('payments').insert(payments)])

    const exp = [{ expense_date: dateStr, category: 'insumos', description: 'Compra de insumos del día', amount: ri(50,80), payment_method: 'cash' }]
    if (dow===1)           exp.push({ expense_date: dateStr, category: 'nomina',        description: 'Pago semanal de personal',         amount: 175, payment_method: 'transfer' })
    if (dom===1)           exp.push({ expense_date: dateStr, category: 'renta',         description: 'Renta mensual del local',           amount: 350, payment_method: 'transfer' },
                                     { expense_date: dateStr, category: 'servicios',     description: 'Agua, luz e internet',             amount: 120, payment_method: 'transfer' })
    if (dom===1||dom===15) exp.push({ expense_date: dateStr, category: 'mantenimiento', description: 'Mantenimiento de equipo de cocina', amount: 40,  payment_method: 'cash'     })
    if (dom===7||dom===21) exp.push({ expense_date: dateStr, category: 'marketing',     description: 'Redes sociales y publicidad',       amount: 30,  payment_method: 'card'     })
    if (Math.random()<0.3) exp.push({ expense_date: dateStr, category: 'transporte',    description: 'Transporte y entregas del día',     amount: ri(15,30), payment_method: 'cash' })
    const { error: e4 } = await supabase.from('expenses').insert(exp)
    if (e4 && e4.code === '42P01' && d === 0) {
      toast('La tabla "expenses" no existe. Ejecuta supabase/expenses_create.sql en Supabase SQL Editor primero.', 'error')
      break
    }

    bar.style.width = `${((d+1)/30)*100}%`
    await new Promise(r => setTimeout(r, 20))
  }

  log.textContent = '✓ Guardado — cargando datos reales…'
  _usingDemo = false
  await loadAll()
  toast('30 días de datos guardados en la base de datos', 'success')
}

// ── Render functions ───────────────────────────────────────────────────────

function renderKPIs() {
  const revenue  = _orders.reduce((s, o) => s + +o.total, 0)
  const expenses = _expenses.reduce((s, e) => s + +e.amount, 0)
  const profit   = revenue - expenses
  const margin   = revenue > 0 ? (profit / revenue * 100) : 0

  document.getElementById('kpiRevenue').textContent      = fmt.currency(revenue)
  document.getElementById('kpiOrders').textContent       = `${_orders.length} órdenes`
  document.getElementById('kpiExpenses').textContent     = fmt.currency(expenses)
  document.getElementById('kpiExpenseCount').textContent = `${_expenses.length} registros`
  document.getElementById('kpiProfit').textContent       = fmt.currency(profit)
  document.getElementById('kpiMargin').textContent       = margin.toFixed(1) + '%'
  document.getElementById('kpiMarginSub').textContent    = profit >= 0 ? 'Período rentable' : 'Período en pérdida'
  document.getElementById('kpiAvgTicket').textContent    = fmt.currency(_orders.length ? revenue / _orders.length : 0)

  document.getElementById('kpiProfit').style.color = profit >= 0 ? 'var(--green)' : 'var(--danger)'
  const card = document.getElementById('kpiProfitCard')
  card.classList.toggle('stat-green',  profit >= 0)
  card.classList.toggle('stat-danger', profit < 0)
}

function renderPLChart() {
  const revByDay = {}, expByDay = {}
  _orders.forEach(o => { const d = o.created_at.slice(0,10); revByDay[d] = (revByDay[d]||0) + +o.total })
  _expenses.forEach(e => { const d = e.expense_date; expByDay[d] = (expByDay[d]||0) + +e.amount })
  const allDays = [...new Set([...Object.keys(revByDay), ...Object.keys(expByDay)])].sort()

  if (plChart) plChart.destroy()
  plChart = new Chart(document.getElementById('plChart').getContext('2d'), {
    type: 'line',
    data: { labels: allDays, datasets: [
      { label: 'Ingresos', data: allDays.map(d => revByDay[d]||0), borderColor:'#FF6600', backgroundColor:'rgba(255,102,0,0.06)', fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#FF6600' },
      { label: 'Gastos',   data: allDays.map(d => expByDay[d]||0), borderColor:'#FF4455', backgroundColor:'rgba(255,68,85,0.06)',  fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#FF4455' }
    ]},
    options: { ...chartOpts(), plugins: { ...chartOpts().plugins, legend: { display:true, labels:{ color:'#7A5248', font:{size:11} } } } }
  })
}

function renderExpensePie() {
  const byCat = {}
  _expenses.forEach(e => { byCat[e.category] = (byCat[e.category]||0) + +e.amount })
  if (!Object.keys(byCat).length) return
  if (pieChart) pieChart.destroy()
  pieChart = new Chart(document.getElementById('expensePieChart').getContext('2d'), {
    type: 'doughnut',
    data: { labels: Object.keys(byCat).map(k => CAT_LABELS[k]??k),
      datasets: [{ data: Object.values(byCat), backgroundColor:['#FF4455','#FF6600','#FF9900','#4A9EE0','#9B59B6','#2ECC71','#F39C12','#95A5A6'], borderColor:'#1E1210', borderWidth:2 }] },
    options: { responsive:true, plugins: {
      legend: { position:'right', labels:{ color:'#BFA099', font:{size:11}, boxWidth:14, padding:10 } },
      tooltip: { backgroundColor:'#261510', borderColor:'#3A1913', borderWidth:1, titleColor:'#FFFFFF', bodyColor:'#BFA099' }
    }}
  })
}

function renderTopProducts() {
  const byItem = {}
  _items.forEach(i => {
    if (!byItem[i.item_name]) byItem[i.item_name] = { qty:0, revenue:0 }
    byItem[i.item_name].qty     += i.quantity
    byItem[i.item_name].revenue += i.quantity * +i.item_price
  })
  const sorted = Object.entries(byItem).sort((a,b) => b[1].revenue - a[1].revenue).slice(0,8)
  const maxRev = sorted[0]?.[1].revenue || 1
  const el = document.getElementById('topProductsList')
  if (!sorted.length) { el.innerHTML = '<p class="text-muted text-sm">Sin datos.</p>'; return }
  el.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px">
    ${sorted.map(([name,d],i) => `
      <div class="top-item-row">
        <div class="top-item-rank ${i===0?'top-1':i===1?'top-2':i===2?'top-3':''}">${i+1}</div>
        <span style="flex:1;font-size:.84rem">${name}</span>
        <div class="top-item-bar"><div class="top-item-bar__fill" style="width:${(d.revenue/maxRev*100).toFixed(0)}%"></div></div>
        <span class="text-sm" style="min-width:38px;text-align:right;color:var(--amber)">${fmt.currency(d.revenue)}</span>
        <span class="text-xs text-muted" style="min-width:28px;text-align:right">${d.qty}x</span>
      </div>`).join('')}
  </div>`
}

function renderEDC() {
  const revByDay = {}, expByDay = {}
  _orders.forEach(o => { const d = o.created_at.slice(0,10); revByDay[d] = (revByDay[d]||0) + +o.total })
  _expenses.forEach(e => { const d = e.expense_date; expByDay[d] = (expByDay[d]||0) + +e.amount })
  const allDays = [...new Set([...Object.keys(revByDay), ...Object.keys(expByDay)])].sort()
  const tbody = document.getElementById('edcTableBody')
  if (!allDays.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center" style="padding:32px">Sin movimientos.</td></tr>'; return }
  let balance = 0
  tbody.innerHTML = allDays.map(d => {
    const rev = revByDay[d]||0, exp = expByDay[d]||0, net = rev - exp
    balance += net
    return `<tr>
      <td>${fmt.date(d)}</td>
      <td style="text-align:right;color:var(--green);font-weight:600">${rev>0?fmt.currency(rev):'—'}</td>
      <td style="text-align:right;color:var(--danger);font-weight:600">${exp>0?fmt.currency(exp):'—'}</td>
      <td style="text-align:right;font-weight:700;color:${net>=0?'var(--green)':'var(--danger)'}">${fmt.currency(net)}</td>
      <td style="text-align:right;font-weight:700;color:${balance>=0?'var(--green)':'var(--danger)'}">${fmt.currency(balance)}</td>
    </tr>`
  }).join('')
}

function exportEDC() {
  const revByDay = {}, expByDay = {}
  _orders.forEach(o => { const d = o.created_at.slice(0,10); revByDay[d] = (revByDay[d]||0) + +o.total })
  _expenses.forEach(e => { const d = e.expense_date; expByDay[d] = (expByDay[d]||0) + +e.amount })
  const allDays = [...new Set([...Object.keys(revByDay), ...Object.keys(expByDay)])].sort()
  let balance = 0
  const rows = [['Fecha','Ingresos','Gastos','Neto','Balance']]
  allDays.forEach(d => { const r=revByDay[d]||0, e=expByDay[d]||0; balance+=r-e; rows.push([d,r.toFixed(2),e.toFixed(2),(r-e).toFixed(2),balance.toFixed(2)]) })
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' }))
  a.download = `edc-${days}d${_usingDemo?'-demo':''}.csv`
  a.click()
}

function chartOpts() {
  return { responsive:true, plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#261510', borderColor:'#3A1913', borderWidth:1, titleColor:'#FFFFFF', bodyColor:'#BFA099' } },
    scales:{ x:{ ticks:{color:'#7A5248',font:{size:11}}, grid:{color:'rgba(255,150,80,0.05)'} }, y:{ ticks:{color:'#7A5248',font:{size:11}}, grid:{color:'rgba(255,150,80,0.05)'} } } }
}

init()
