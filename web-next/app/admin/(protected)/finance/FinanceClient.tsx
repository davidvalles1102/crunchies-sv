'use client'

import { useEffect, useRef, useState } from 'react'
import { Chart } from 'chart.js/auto'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'

const CAT_LABELS: Record<string, string> = {
  insumos: '🥩 Insumos',
  servicios: '💡 Servicios',
  nomina: '👥 Nómina',
  renta: '🏠 Renta',
  mantenimiento: '🔧 Mantenimiento',
  marketing: '📣 Marketing',
  transporte: '🛵 Transporte',
  otros: '📦 Otros',
}

const SEED_ITEMS = [
  { name: 'Pollo Entero', price: 12 },
  { name: 'Media Pollo', price: 7 },
  { name: '1/4 Pollo', price: 5 },
  { name: 'Alas 6 pzs', price: 8 },
  { name: 'Alas 12 pzs', price: 14 },
  { name: 'Combo Rancho', price: 10 },
  { name: 'Sopa de Gallina', price: 8 },
  { name: 'Enchiladas 3 pzs', price: 5 },
  { name: 'Arroz con Pollo', price: 7 },
  { name: 'Refresco', price: 2 },
  { name: 'Agua Pura', price: 1 },
]

type FinanceOrder = { total: number; created_at: string }
type FinanceExpense = { category: string; amount: number; expense_date: string }
type FinanceItem = { item_name: string; item_price: number; quantity: number }

function buildStaticDemo() {
  let seed = 42
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff }
  const ri = (lo: number, hi: number) => Math.floor(rng() * (hi - lo + 1)) + lo
  const pick = () => SEED_ITEMS[Math.floor(rng() * SEED_ITEMS.length)]

  const orders: FinanceOrder[] = []
  const expenses: FinanceExpense[] = []
  const items: FinanceItem[] = []

  for (let d = 0; d < 30; d++) {
    const base = new Date()
    base.setDate(base.getDate() - (30 - d))
    base.setHours(12, 0, 0, 0)
    const dateStr = base.toISOString().split('T')[0]
    const dow = base.getDay()
    const dom = base.getDate()
    const nOrders = dow === 5 ? ri(15, 23) : (dow === 0 || dow === 6) ? ri(18, 28) : ri(9, 16)

    for (let n = 0; n < nOrders; n++) {
      const ts = new Date(base)
      ts.setSeconds(ri(0, 36000))
      const created = ts.toISOString()
      let total = 0
      for (let i = 0; i < ri(1, 4); i++) {
        const item = pick()
        const qty = ri(1, 3)
        total += item.price * qty
        items.push({ item_name: item.name, item_price: item.price, quantity: qty })
      }
      orders.push({ total, created_at: created })
    }

    expenses.push({ expense_date: dateStr, category: 'insumos', amount: ri(50, 80) })
    if (dow === 1) expenses.push({ expense_date: dateStr, category: 'nomina', amount: 175 })
    if (dom === 1) expenses.push(
      { expense_date: dateStr, category: 'renta', amount: 350 },
      { expense_date: dateStr, category: 'servicios', amount: 120 },
    )
    if (dom === 1 || dom === 15) expenses.push({ expense_date: dateStr, category: 'mantenimiento', amount: 40 })
    if (dom === 7 || dom === 21) expenses.push({ expense_date: dateStr, category: 'marketing', amount: 30 })
    if (rng() < 0.3) expenses.push({ expense_date: dateStr, category: 'transporte', amount: ri(15, 30) })
  }

  return { orders, expenses, items }
}

function chartOpts() {
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#261510', borderColor: '#3A1913', borderWidth: 1, titleColor: '#FFFFFF', bodyColor: '#BFA099' },
    },
    scales: {
      x: { ticks: { color: '#7A5248', font: { size: 11 } }, grid: { color: 'rgba(255,150,80,0.05)' } },
      y: { ticks: { color: '#7A5248', font: { size: 11 } }, grid: { color: 'rgba(255,150,80,0.05)' } },
    },
  }
}

export default function FinanceClient() {
  useRequireRole(['admin', 'waiter'])
  const supabase = createClient()
  const toast = useToast()

  const [days, setDays] = useState(30)
  const [orders, setOrders] = useState<FinanceOrder[]>([])
  const [expenses, setExpenses] = useState<FinanceExpense[]>([])
  const [items, setItems] = useState<FinanceItem[]>([])
  const [usingDemo, setUsingDemo] = useState(false)
  const [expensesMissing, setExpensesMissing] = useState(false)

  const [seeding, setSeeding] = useState(false)
  const [seedProgress, setSeedProgress] = useState(0)
  const [seedLog, setSeedLog] = useState('Iniciando…')

  const plCanvasRef = useRef<HTMLCanvasElement>(null)
  const pieCanvasRef = useRef<HTMLCanvasElement>(null)
  const plChartRef = useRef<Chart | null>(null)
  const pieChartRef = useRef<Chart | null>(null)

  const renderPLChart = (ordersData: FinanceOrder[], expensesData: FinanceExpense[]) => {
    const revByDay: Record<string, number> = {}
    const expByDay: Record<string, number> = {}
    ordersData.forEach((o) => { const d = o.created_at.slice(0, 10); revByDay[d] = (revByDay[d] || 0) + Number(o.total) })
    expensesData.forEach((e) => { const d = e.expense_date; expByDay[d] = (expByDay[d] || 0) + Number(e.amount) })
    const allDays = [...new Set([...Object.keys(revByDay), ...Object.keys(expByDay)])].sort()

    if (!plCanvasRef.current) return
    plChartRef.current?.destroy()
    plChartRef.current = new Chart(plCanvasRef.current, {
      type: 'line',
      data: {
        labels: allDays,
        datasets: [
          { label: 'Ingresos', data: allDays.map((d) => revByDay[d] || 0), borderColor: '#FF6600', backgroundColor: 'rgba(255,102,0,0.06)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#FF6600' },
          { label: 'Gastos', data: allDays.map((d) => expByDay[d] || 0), borderColor: '#FF4455', backgroundColor: 'rgba(255,68,85,0.06)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#FF4455' },
        ],
      },
      options: { ...chartOpts(), plugins: { ...chartOpts().plugins, legend: { display: true, labels: { color: '#7A5248', font: { size: 11 } } } } },
    })
  }

  const renderExpensePie = (expensesData: FinanceExpense[]) => {
    const byCat: Record<string, number> = {}
    expensesData.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount) })
    if (!Object.keys(byCat).length) return
    if (!pieCanvasRef.current) return
    pieChartRef.current?.destroy()
    pieChartRef.current = new Chart(pieCanvasRef.current, {
      type: 'doughnut',
      data: {
        labels: Object.keys(byCat).map((k) => CAT_LABELS[k] ?? k),
        datasets: [{ data: Object.values(byCat), backgroundColor: ['#FF4455', '#FF6600', '#FF9900', '#4A9EE0', '#9B59B6', '#2ECC71', '#F39C12', '#95A5A6'], borderColor: '#1E1210', borderWidth: 2 }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right', labels: { color: '#BFA099', font: { size: 11 }, boxWidth: 14, padding: 10 } },
          tooltip: { backgroundColor: '#261510', borderColor: '#3A1913', borderWidth: 1, titleColor: '#FFFFFF', bodyColor: '#BFA099' },
        },
      },
    })
  }

  const loadAll = async () => {
    const since = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0]

    const [
      { data: ordersData, error: errO },
      { data: expensesData, error: errE },
      { data: itemsData },
    ] = await Promise.all([
      supabase.from('orders').select('total, created_at').in('status', ['paid', 'delivered']).gte('created_at', since + 'T00:00:00'),
      supabase.from('expenses').select('*').gte('expense_date', since).order('expense_date'),
      supabase.from('order_items').select('item_name, item_price, quantity').gte('created_at', since + 'T00:00:00'),
    ])

    const expMissing = errE != null && errE.code === '42P01'
    setExpensesMissing(expMissing)
    if (errO) toast('Error al cargar órdenes', 'error')

    const realOrders = (ordersData as FinanceOrder[]) || []
    const realExpenses = expMissing ? [] : ((expensesData as FinanceExpense[]) || [])
    const realItems = (itemsData as FinanceItem[]) || []
    const hasRealData = realOrders.length > 0 || realExpenses.length > 0

    let finalOrders: FinanceOrder[]
    let finalExpenses: FinanceExpense[]
    let finalItems: FinanceItem[]

    if (hasRealData) {
      setUsingDemo(false)
      finalOrders = realOrders
      finalExpenses = realExpenses
      finalItems = realItems
    } else {
      setUsingDemo(true)
      const demo = buildStaticDemo()
      finalOrders = demo.orders
      finalExpenses = demo.expenses
      finalItems = demo.items
    }

    setOrders(finalOrders)
    setExpenses(finalExpenses)
    setItems(finalItems)
    renderPLChart(finalOrders, finalExpenses)
    renderExpensePie(finalExpenses)
  }

  useEffect(() => {
    ;(async () => { await loadAll() })()
    return () => {
      plChartRef.current?.destroy()
      pieChartRef.current?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const runSeed = async () => {
    const ok = confirm(
      '⚠️ Esto va a INSERTAR 30 días de órdenes, items, pagos y gastos ficticios ' +
      'directamente en tu base de datos real (no es una simulación).\n\n' +
      'Úsalo solo para poblar un ambiente de pruebas — no lo hagas en producción ' +
      'con clientes reales.\n\n¿Continuar?'
    )
    if (!ok) return

    setSeeding(true)
    setSeedProgress(0)
    setSeedLog('Iniciando…')

    const ri = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo
    const pick = () => SEED_ITEMS[Math.floor(Math.random() * SEED_ITEMS.length)]
    const mkTs = (base: Date, sec: number) => { const d = new Date(base); d.setSeconds(d.getSeconds() + sec); return d.toISOString() }

    for (let d = 0; d < 30; d++) {
      const base = new Date()
      base.setDate(base.getDate() - (30 - d))
      base.setHours(10, 0, 0, 0)
      const dateStr = base.toISOString().split('T')[0]
      const dow = base.getDay()
      const dom = base.getDate()
      const nOrders = dow === 5 ? ri(15, 23) : (dow === 0 || dow === 6) ? ri(18, 28) : ri(9, 16)

      setSeedLog(`${dateStr} — ${nOrders} órdenes…`)

      const seedOrders: { id: string; status: string; subtotal: number; tax: number; total: number; created_at: string; updated_at: string }[] = []
      const allItems: { order_id: string; item_name: string; item_price: number; quantity: number; created_at: string }[] = []
      const payments: { order_id: string; amount: number; created_at: string; method: string; receipt_number: string }[] = []

      for (let n = 0; n < nOrders; n++) {
        const oid = crypto.randomUUID()
        const ts = mkTs(base, ri(0, 36000))
        let total = 0
        for (let i = 0; i < ri(1, 4); i++) {
          const item = pick()
          const qty = ri(1, 3)
          total += item.price * qty
          allItems.push({ order_id: oid, item_name: item.name, item_price: item.price, quantity: qty, created_at: ts })
        }
        seedOrders.push({ id: oid, status: 'paid', subtotal: total, tax: 0, total, created_at: ts, updated_at: ts })
        const r = Math.random()
        payments.push({
          order_id: oid, amount: total, created_at: ts,
          method: r < 0.75 ? 'cash' : r < 0.95 ? 'card' : 'transfer',
          receipt_number: `R-SEED-${String(d * 100 + n + 1).padStart(5, '0')}`,
        })
      }

      const { error: e1 } = await supabase.from('orders').insert(seedOrders)
      if (e1) { toast(`Error: ${e1.message}`, 'error'); break }
      await Promise.all([supabase.from('order_items').insert(allItems), supabase.from('payments').insert(payments)])

      const exp: { expense_date: string; category: string; description: string; amount: number; payment_method: string }[] = [
        { expense_date: dateStr, category: 'insumos', description: 'Compra de insumos del día', amount: ri(50, 80), payment_method: 'cash' },
      ]
      if (dow === 1) exp.push({ expense_date: dateStr, category: 'nomina', description: 'Pago semanal de personal', amount: 175, payment_method: 'transfer' })
      if (dom === 1) exp.push(
        { expense_date: dateStr, category: 'renta', description: 'Renta mensual del local', amount: 350, payment_method: 'transfer' },
        { expense_date: dateStr, category: 'servicios', description: 'Agua, luz e internet', amount: 120, payment_method: 'transfer' },
      )
      if (dom === 1 || dom === 15) exp.push({ expense_date: dateStr, category: 'mantenimiento', description: 'Mantenimiento de equipo de cocina', amount: 40, payment_method: 'cash' })
      if (dom === 7 || dom === 21) exp.push({ expense_date: dateStr, category: 'marketing', description: 'Redes sociales y publicidad', amount: 30, payment_method: 'card' })
      if (Math.random() < 0.3) exp.push({ expense_date: dateStr, category: 'transporte', description: 'Transporte y entregas del día', amount: ri(15, 30), payment_method: 'cash' })

      const { error: e4 } = await supabase.from('expenses').insert(exp)
      if (e4 && e4.code === '42P01' && d === 0) {
        toast('La tabla "expenses" no existe. Ejecuta supabase/expenses_create.sql en Supabase SQL Editor primero.', 'error')
        break
      }

      setSeedProgress(((d + 1) / 30) * 100)
      await new Promise((r) => setTimeout(r, 20))
    }

    setSeedLog('✓ Guardado — cargando datos reales…')
    setUsingDemo(false)
    await loadAll()
    toast('30 días de datos guardados en la base de datos', 'success')
    setSeeding(false)
  }

  const exportEDC = () => {
    const revByDay: Record<string, number> = {}
    const expByDay: Record<string, number> = {}
    orders.forEach((o) => { const d = o.created_at.slice(0, 10); revByDay[d] = (revByDay[d] || 0) + Number(o.total) })
    expenses.forEach((e) => { const d = e.expense_date; expByDay[d] = (expByDay[d] || 0) + Number(e.amount) })
    const allDays = [...new Set([...Object.keys(revByDay), ...Object.keys(expByDay)])].sort()
    let balance = 0
    const rows: string[][] = [['Fecha', 'Ingresos', 'Gastos', 'Neto', 'Balance']]
    allDays.forEach((d) => {
      const r = revByDay[d] || 0
      const e = expByDay[d] || 0
      balance += r - e
      rows.push([d, r.toFixed(2), e.toFixed(2), (r - e).toFixed(2), balance.toFixed(2)])
    })
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `edc-${days}d${usingDemo ? '-demo' : ''}.csv`
    a.click()
  }

  const revenue = orders.reduce((s, o) => s + Number(o.total), 0)
  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const profit = revenue - expensesTotal
  const margin = revenue > 0 ? (profit / revenue * 100) : 0
  const avgTicket = orders.length ? revenue / orders.length : 0

  const byItem: Record<string, { qty: number; revenue: number }> = {}
  items.forEach((i) => {
    if (!byItem[i.item_name]) byItem[i.item_name] = { qty: 0, revenue: 0 }
    byItem[i.item_name].qty += i.quantity
    byItem[i.item_name].revenue += i.quantity * Number(i.item_price)
  })
  const topProducts = Object.entries(byItem).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8)
  const maxRev = topProducts[0]?.[1].revenue || 1

  const edcRevByDay: Record<string, number> = {}
  const edcExpByDay: Record<string, number> = {}
  orders.forEach((o) => { const d = o.created_at.slice(0, 10); edcRevByDay[d] = (edcRevByDay[d] || 0) + Number(o.total) })
  expenses.forEach((e) => { const d = e.expense_date; edcExpByDay[d] = (edcExpByDay[d] || 0) + Number(e.amount) })
  const edcDays = [...new Set([...Object.keys(edcRevByDay), ...Object.keys(edcExpByDay)])].sort()
  const edcRows = edcDays.reduce<{ date: string; rev: number; exp: number; net: number; balance: number }[]>((acc, d) => {
    const rev = edcRevByDay[d] || 0
    const exp = edcExpByDay[d] || 0
    const net = rev - exp
    const prevBalance = acc.length ? acc[acc.length - 1].balance : 0
    return [...acc, { date: d, rev, exp, net, balance: prevBalance + net }]
  }, [])

  return (
    <>
      <Topbar title="Control Financiero">
        <select className="form-control" style={{ width: 160 }} value={days} onChange={(e) => setDays(parseInt(e.target.value))}>
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
        <button className="btn btn-outline btn-sm" onClick={exportEDC}>↓ Exportar EDC</button>
      </Topbar>

      <div className="admin-content">
        {expensesMissing && (
          <div style={{ background: 'rgba(255,153,0,.1)', border: '1px solid var(--amber)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
            <strong style={{ color: 'var(--amber)' }}>⚠️ Tabla de gastos no creada</strong>
            <p style={{ fontSize: '.85rem', color: 'var(--muted)', margin: '6px 0 0' }}>Ejecuta <code>supabase/expenses_create.sql</code> en Supabase SQL Editor y recarga la página.</p>
          </div>
        )}

        {usingDemo && (
          <div style={{ background: 'rgba(255,102,0,.08)', border: '1px solid var(--orange)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <strong style={{ color: 'var(--text)', fontSize: '.9rem' }}>📊 Vista previa con datos demo</strong>
                <p style={{ fontSize: '.8rem', color: 'var(--muted)', margin: '4px 0 0' }}>Guarda estos datos reales en la base de datos para usar el portal con datos persistentes.</p>
              </div>
              <button className="btn btn-primary btn-sm" disabled={seeding} onClick={runSeed}>▶ Guardar en base de datos</button>
            </div>
            {seeding && (
              <div style={{ marginTop: 12 }}>
                <div style={{ background: 'var(--bg2)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                  <div style={{ background: 'var(--orange)', height: '100%', width: `${seedProgress}%`, transition: 'width .3s' }} />
                </div>
                <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 6 }}>{seedLog}</p>
              </div>
            )}
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card stat-green">
            <div className="stat-label">Ingresos del Período</div>
            <div className="stat-value">{fmt.currency(revenue)}</div>
            <div className="stat-sub">{orders.length} órdenes</div>
          </div>
          <div className="stat-card stat-danger">
            <div className="stat-label">Gastos del Período</div>
            <div className="stat-value">{fmt.currency(expensesTotal)}</div>
            <div className="stat-sub">{expenses.length} registros</div>
          </div>
          <div className={`stat-card${profit >= 0 ? ' stat-green' : ' stat-danger'}`}>
            <div className="stat-label">Utilidad Neta</div>
            <div className="stat-value" style={{ color: profit >= 0 ? 'var(--orange)' : 'var(--danger)' }}>{fmt.currency(profit)}</div>
            <div className="stat-sub">{profit >= 0 ? 'Período rentable' : 'Período en pérdida'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Margen de Utilidad</div>
            <div className="stat-value">{margin.toFixed(1)}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Ticket Promedio</div>
            <div className="stat-value">{fmt.currency(avgTicket)}</div>
          </div>
        </div>

        <div className="charts-grid mt-20">
          <div className="card">
            <h3 className="mb-16">Ingresos vs Gastos por Día</h3>
            <canvas ref={plCanvasRef} height={220}></canvas>
          </div>
          <div className="card">
            <h3 className="mb-16">Gastos por Categoría</h3>
            <canvas ref={pieCanvasRef} height={220}></canvas>
          </div>
        </div>

        <div className="card mt-20">
          <h3 className="mb-16">Top Productos del Período</h3>
          {topProducts.length === 0 ? (
            <p className="text-muted text-sm">Sin datos.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
              {topProducts.map(([name, d], i) => (
                <div key={name} className="top-item-row">
                  <div className={`top-item-rank${i === 0 ? ' top-1' : i === 1 ? ' top-2' : i === 2 ? ' top-3' : ''}`}>{i + 1}</div>
                  <span style={{ flex: 1, fontSize: '.84rem' }}>{name}</span>
                  <div className="top-item-bar"><div className="top-item-bar__fill" style={{ width: `${(d.revenue / maxRev * 100).toFixed(0)}%` }} /></div>
                  <span className="text-sm" style={{ minWidth: 38, textAlign: 'right', color: 'var(--amber)' }}>{fmt.currency(d.revenue)}</span>
                  <span className="text-xs text-muted" style={{ minWidth: 28, textAlign: 'right' }}>{d.qty}x</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card mt-20">
          <div className="flex justify-between items-center mb-16">
            <h3>Estado de Cuenta (EDC)</h3>
            <span className="text-xs text-muted">Balance acumulado del período</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th style={{ textAlign: 'right' }}>Ingresos</th>
                  <th style={{ textAlign: 'right' }}>Gastos</th>
                  <th style={{ textAlign: 'right' }}>Neto del Día</th>
                  <th style={{ textAlign: 'right' }}>Balance Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {edcRows.length === 0 ? (
                  <tr><td colSpan={5} className="text-muted text-center" style={{ padding: 32 }}>Sin movimientos.</td></tr>
                ) : (
                  edcRows.map((row) => (
                    <tr key={row.date}>
                      <td>{fmt.date(row.date)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--orange)', fontWeight: 600 }}>{row.rev > 0 ? fmt.currency(row.rev) : '—'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{row.exp > 0 ? fmt.currency(row.exp) : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: row.net >= 0 ? 'var(--orange)' : 'var(--danger)' }}>{fmt.currency(row.net)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: row.balance >= 0 ? 'var(--orange)' : 'var(--danger)' }}>{fmt.currency(row.balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
