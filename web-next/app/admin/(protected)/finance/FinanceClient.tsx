'use client'

import { useEffect, useRef, useState } from 'react'
import { Chart } from 'chart.js/auto'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'
import { svDaysAgo, svDayStartUTC } from '@/lib/svDate'

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


type FinanceOrder = { total: number; created_at: string }
type FinanceExpense = { category: string; amount: number; expense_date: string }
// cost es el snapshot guardado en order_items al momento de la venta (ver
// order_item_cost_snapshot.sql) — no se recalcula contra menu_items.cost
// actual, para que cambiar el costo de un insumo hoy no reescriba
// retroactivamente el margen de ventas ya cerradas.
type FinanceItem = { item_name: string; item_price: number; cost: number; quantity: number; menu_item_id: string | null; created_at: string }


function chartOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
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

const SV_OFFSET_MS = 6 * 60 * 60 * 1000
const svDate = (iso: string) => new Date(new Date(iso).getTime() - SV_OFFSET_MS).toISOString().split('T')[0]

export default function FinanceClient() {
  useRequireRole(['admin', 'waiter'])
  const supabase = createClient()
  const toast = useToast()

  const [days, setDays] = useState(30)
  const [orders, setOrders] = useState<FinanceOrder[]>([])
  const [expenses, setExpenses] = useState<FinanceExpense[]>([])
  const [items, setItems] = useState<FinanceItem[]>([])
  const [expensesMissing, setExpensesMissing] = useState(false)

  const plCanvasRef = useRef<HTMLCanvasElement>(null)
  const pieCanvasRef = useRef<HTMLCanvasElement>(null)
  const plChartRef = useRef<Chart | null>(null)
  const pieChartRef = useRef<Chart | null>(null)

  const renderPLChart = (ordersData: FinanceOrder[], expensesData: FinanceExpense[], itemsData: FinanceItem[]) => {
    const revByDay: Record<string, number> = {}
    const expByDay: Record<string, number> = {}
    const cogsByDay: Record<string, number> = {}
    ordersData.forEach((o) => { const d = svDate(o.created_at); revByDay[d] = (revByDay[d] || 0) + Number(o.total) })
    expensesData.forEach((e) => { const d = e.expense_date; expByDay[d] = (expByDay[d] || 0) + Number(e.amount) })
    itemsData.forEach((i) => {
      const d = i.created_at.slice(0, 10)
      cogsByDay[d] = (cogsByDay[d] || 0) + Number(i.cost) * i.quantity
    })
    const allDays = [...new Set([...Object.keys(revByDay), ...Object.keys(expByDay), ...Object.keys(cogsByDay)])].sort()

    if (!plCanvasRef.current) return
    plChartRef.current?.destroy()
    plChartRef.current = new Chart(plCanvasRef.current, {
      type: 'line',
      data: {
        labels: allDays,
        datasets: [
          { label: 'Ingresos', data: allDays.map((d) => revByDay[d] || 0), borderColor: '#FF6600', backgroundColor: 'rgba(255,102,0,0.06)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#FF6600' },
          { label: 'Costo Insumos', data: allDays.map((d) => cogsByDay[d] || 0), borderColor: '#F39C12', backgroundColor: 'rgba(243,156,18,0.06)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#F39C12' },
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
    const since = svDaysAgo(days)
    const sinceUTC = svDayStartUTC(since)

    const [
      { data: ordersData, error: errO },
      { data: expensesData, error: errE },
      { data: itemsData },
    ] = await Promise.all([
      supabase.from('orders').select('total, created_at').in('status', ['paid', 'delivered']).gte('created_at', sinceUTC),
      supabase.from('expenses').select('*').gte('expense_date', since).order('expense_date'),
      supabase.from('order_items').select('item_name, item_price, cost, quantity, menu_item_id, created_at').gte('created_at', sinceUTC),
    ])

    const expMissing = errE != null && errE.code === '42P01'
    setExpensesMissing(expMissing)
    if (errO) toast('Error al cargar órdenes', 'error')

    const finalOrders = (ordersData as FinanceOrder[]) || []
    const finalExpenses = expMissing ? [] : ((expensesData as FinanceExpense[]) || [])
    const finalItems = (itemsData as FinanceItem[]) || []

    setOrders(finalOrders)
    setExpenses(finalExpenses)
    setItems(finalItems)
    renderPLChart(finalOrders, finalExpenses, finalItems)
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

  const exportEDC = () => {
    const rows: string[][] = [['Fecha', 'Ingresos', 'Costo Insumos', 'Gastos Operativos', 'Neto', 'Balance']]
    edcRows.forEach((row) => {
      rows.push([row.date, row.rev.toFixed(2), row.cogs.toFixed(2), row.opex.toFixed(2), row.net.toFixed(2), row.balance.toFixed(2)])
    })
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `edc-${days}d.csv`
    a.click()
  }

  const itemCost = (i: FinanceItem) => Number(i.cost) * i.quantity

  const revenue = orders.reduce((s, o) => s + Number(o.total), 0)
  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const cogsTotal = items.reduce((s, i) => s + itemCost(i), 0)
  const profit = revenue - expensesTotal - cogsTotal
  const margin = revenue > 0 ? (profit / revenue * 100) : 0
  const avgTicket = orders.length ? revenue / orders.length : 0

  const byItem: Record<string, { qty: number; revenue: number; cost: number }> = {}
  items.forEach((i) => {
    if (!byItem[i.item_name]) byItem[i.item_name] = { qty: 0, revenue: 0, cost: 0 }
    byItem[i.item_name].qty += i.quantity
    byItem[i.item_name].revenue += i.quantity * Number(i.item_price)
    byItem[i.item_name].cost += itemCost(i)
  })
  const topProducts = Object.entries(byItem).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8)
  const maxRev = topProducts[0]?.[1].revenue || 1

  const edcRevByDay: Record<string, number> = {}
  const edcExpByDay: Record<string, number> = {}
  const edcCogsByDay: Record<string, number> = {}
  orders.forEach((o) => { const d = svDate(o.created_at); edcRevByDay[d] = (edcRevByDay[d] || 0) + Number(o.total) })
  expenses.forEach((e) => { const d = e.expense_date; edcExpByDay[d] = (edcExpByDay[d] || 0) + Number(e.amount) })
  items.forEach((i) => { const d = i.created_at.slice(0, 10); edcCogsByDay[d] = (edcCogsByDay[d] || 0) + itemCost(i) })
  const edcDays = [...new Set([...Object.keys(edcRevByDay), ...Object.keys(edcExpByDay), ...Object.keys(edcCogsByDay)])].sort()
  const edcRows = edcDays.reduce<{ date: string; rev: number; opex: number; cogs: number; net: number; balance: number }[]>((acc, d) => {
    const rev = edcRevByDay[d] || 0
    const opex = edcExpByDay[d] || 0
    const cogs = edcCogsByDay[d] || 0
    const net = rev - opex - cogs
    const prevBalance = acc.length ? acc[acc.length - 1].balance : 0
    return [...acc, { date: d, rev, opex, cogs, net, balance: prevBalance + net }]
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

        <div className="stats-grid">
          <div className="stat-card stat-green">
            <div className="stat-label">Ingresos del Período</div>
            <div className="stat-value">{fmt.currency(revenue)}</div>
            <div className="stat-sub">{orders.length} órdenes</div>
          </div>
          <div className="stat-card stat-danger">
            <div className="stat-label">Costo de Insumos (COGS)</div>
            <div className="stat-value">{fmt.currency(cogsTotal)}</div>
            <div className="stat-sub">{revenue > 0 ? `${((cogsTotal / revenue) * 100).toFixed(1)}% de la venta` : 'Sin ventas'}</div>
          </div>
          <div className="stat-card stat-danger">
            <div className="stat-label">Gastos Operativos</div>
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
            <h3 className="mb-16">Ingresos vs Costos por Día</h3>
            <div style={{ position: 'relative', height: 220 }}><canvas ref={plCanvasRef}></canvas></div>
          </div>
          <div className="card">
            <h3 className="mb-16">Gastos por Categoría</h3>
            <div style={{ position: 'relative', height: 220 }}><canvas ref={pieCanvasRef}></canvas></div>
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
                  <th style={{ textAlign: 'right' }}>Costo Insumos</th>
                  <th style={{ textAlign: 'right' }}>Gastos Operativos</th>
                  <th style={{ textAlign: 'right' }}>Neto del Día</th>
                  <th style={{ textAlign: 'right' }}>Balance Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {edcRows.length === 0 ? (
                  <tr><td colSpan={6} className="text-muted text-center" style={{ padding: 32 }}>Sin movimientos.</td></tr>
                ) : (
                  edcRows.map((row) => (
                    <tr key={row.date}>
                      <td>{fmt.date(row.date)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--orange)', fontWeight: 600 }}>{row.rev > 0 ? fmt.currency(row.rev) : '—'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{row.cogs > 0 ? fmt.currency(row.cogs) : '—'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{row.opex > 0 ? fmt.currency(row.opex) : '—'}</td>
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
