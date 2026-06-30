'use client'

import { useEffect, useRef, useState } from 'react'
import { Chart } from 'chart.js/auto'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'

const EXPENSE_CAT_LABELS: Record<string, string> = {
  insumos: '🥩 Insumos',
  servicios: '💡 Servicios',
  nomina: '👥 Nómina',
  renta: '🏠 Renta',
  mantenimiento: '🔧 Mantenimiento',
  marketing: '📣 Marketing',
  transporte: '🛵 Transporte',
  otros: '📦 Otros',
}

const STATUS_ES: Record<string, string> = { open: 'Abierta', in_kitchen: 'En Cocina', ready: 'Lista', delivered: 'Entregada', paid: 'Pagada', cancelled: 'Cancelada' }
const STATUS_CLS: Record<string, string> = { paid: 'badge-green', cancelled: 'badge-danger', open: 'badge-amber', in_kitchen: 'badge-info', ready: 'badge-green', delivered: 'badge-muted' }

type ReportOrder = {
  id: string
  total: number
  subtotal: number
  tax: number
  status: string
  order_type: string
  payment_method?: string
  customer_id: string | null
  delivery_name: string | null
  delivery_phone: string | null
  created_at: string
  updated_at: string
  restaurant_tables: { number: number } | null
  profiles: { full_name: string | null } | null
}
type ReportPayment = { method: string; amount: number; created_at: string }
type ReportOrderItem = {
  item_name: string
  item_price: number
  quantity: number
  menu_items: { name: string; categories: { name: string } | null } | null
}
type ReportExpense = { category: string; amount: number; expense_date: string }

function chartOptions(prefix = '') {
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#261510', borderColor: '#3A1913', borderWidth: 1, titleColor: '#FFFFFF', bodyColor: '#BFA099',
        callbacks: { label: (ctx: { parsed: { y?: number | null } | number }) => ` ${prefix}${(typeof ctx.parsed === 'object' ? Number(ctx.parsed.y) : Number(ctx.parsed)).toFixed(2)}` },
      },
    },
    scales: {
      x: { ticks: { color: '#7A5248', font: { size: 11 } }, grid: { color: 'rgba(255,150,80,0.05)' } },
      y: { ticks: { color: '#7A5248', font: { size: 11 } }, grid: { color: 'rgba(255,150,80,0.05)' } },
    },
  }
}

export default function ReportsClient() {
  useRequireRole(['admin'])
  const supabase = createClient()

  const [days, setDays] = useState(30)
  const [orders, setOrders] = useState<ReportOrder[]>([])
  const [orderItems, setOrderItems] = useState<ReportOrderItem[]>([])
  const [expenses, setExpenses] = useState<ReportExpense[]>([])

  const salesCanvasRef = useRef<HTMLCanvasElement>(null)
  const paymentCanvasRef = useRef<HTMLCanvasElement>(null)
  const categoryCanvasRef = useRef<HTMLCanvasElement>(null)
  const expenseCategoryCanvasRef = useRef<HTMLCanvasElement>(null)
  const profitCanvasRef = useRef<HTMLCanvasElement>(null)

  const salesChartRef = useRef<Chart | null>(null)
  const paymentChartRef = useRef<Chart | null>(null)
  const categoryChartRef = useRef<Chart | null>(null)
  const expenseCategoryChartRef = useRef<Chart | null>(null)
  const profitChartRef = useRef<Chart | null>(null)

  const renderDailySalesChart = (ordersData: ReportOrder[]) => {
    const byDay: Record<string, number> = {}
    ordersData.forEach((o) => { const d = o.created_at.slice(0, 10); byDay[d] = (byDay[d] || 0) + Number(o.total) })
    const labels = Object.keys(byDay).sort()
    const values = labels.map((d) => byDay[d])

    if (!salesCanvasRef.current) return
    salesChartRef.current?.destroy()
    salesChartRef.current = new Chart(salesCanvasRef.current, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Ventas ($)', data: values, borderColor: '#FF6600', backgroundColor: 'rgba(255,102,0,0.08)', tension: 0.4, fill: true, pointBackgroundColor: '#FF6600', pointRadius: 4 }] },
      options: chartOptions('$'),
    })
  }

  const renderPaymentPieChart = (paymentsData: ReportPayment[], ordersData: ReportOrder[]) => {
    const byMethod: Record<string, number> = {}
    paymentsData.forEach((p) => { byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount) })
    ordersData.filter((o) => ['delivery', 'takeout'].includes(o.order_type)).forEach((o) => {
      const m = o.payment_method || 'cash'
      byMethod[m] = (byMethod[m] || 0) + Number(o.total)
    })
    const labels = Object.keys(byMethod)
    const values = labels.map((m) => byMethod[m])

    if (!paymentCanvasRef.current) return
    paymentChartRef.current?.destroy()
    paymentChartRef.current = new Chart(paymentCanvasRef.current, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: ['#FF6600', '#FF9900', '#4A9EE0', '#FF4455'], borderColor: '#1E1210', borderWidth: 2 }] },
      options: { ...chartOptions(), plugins: { ...chartOptions().plugins, legend: { display: true, position: 'bottom' as const, labels: { color: '#7A5248', padding: 14, font: { size: 12 } } } } },
    })
  }

  const renderCategoryChart = (itemsData: ReportOrderItem[]) => {
    const byCat: Record<string, number> = {}
    itemsData.forEach((oi) => {
      const name = oi.menu_items?.categories?.name ?? 'Sin categoría'
      byCat[name] = (byCat[name] || 0) + oi.quantity * Number(oi.item_price)
    })
    const labels = Object.keys(byCat)
    const values = labels.map((c) => byCat[c])

    if (!categoryCanvasRef.current) return
    categoryChartRef.current?.destroy()
    categoryChartRef.current = new Chart(categoryCanvasRef.current, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Ventas ($)', data: values, backgroundColor: 'rgba(255,153,0,0.65)', borderColor: '#FF9900', borderWidth: 1, borderRadius: 6 }] },
      options: { ...chartOptions('$'), indexAxis: 'y' as const },
    })
  }

  const renderExpenseCategoryChart = (expensesData: ReportExpense[]) => {
    const byCat: Record<string, number> = {}
    expensesData.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount) })
    const labels = Object.keys(byCat).map((k) => EXPENSE_CAT_LABELS[k] ?? k)
    const values = Object.values(byCat)

    if (!expenseCategoryCanvasRef.current) return
    expenseCategoryChartRef.current?.destroy()
    expenseCategoryChartRef.current = new Chart(expenseCategoryCanvasRef.current, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Gastos ($)', data: values, backgroundColor: 'rgba(255,68,85,0.65)', borderColor: '#FF4455', borderWidth: 1, borderRadius: 6 }] },
      options: { ...chartOptions('$'), indexAxis: 'y' as const },
    })
  }

  const renderProfitChart = (ordersData: ReportOrder[], expensesData: ReportExpense[]) => {
    const revenueByDay: Record<string, number> = {}
    ordersData.forEach((o) => { const d = o.created_at.slice(0, 10); revenueByDay[d] = (revenueByDay[d] || 0) + Number(o.total) })
    const expenseByDay: Record<string, number> = {}
    expensesData.forEach((e) => { expenseByDay[e.expense_date] = (expenseByDay[e.expense_date] || 0) + Number(e.amount) })

    const labels = [...new Set([...Object.keys(revenueByDay), ...Object.keys(expenseByDay)])].sort()
    const revenueValues = labels.map((d) => revenueByDay[d] || 0)
    const expenseValues = labels.map((d) => expenseByDay[d] || 0)

    if (!profitCanvasRef.current) return
    profitChartRef.current?.destroy()
    profitChartRef.current = new Chart(profitCanvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Ingresos', data: revenueValues, borderColor: '#FF6600', backgroundColor: 'rgba(255,102,0,0.08)', tension: 0.4, fill: true, pointBackgroundColor: '#FF6600', pointRadius: 3 },
          { label: 'Gastos', data: expenseValues, borderColor: '#FF4455', backgroundColor: 'rgba(255,68,85,0.08)', tension: 0.4, fill: true, pointBackgroundColor: '#FF4455', pointRadius: 3 },
        ],
      },
      options: { ...chartOptions('$'), plugins: { ...chartOptions('$').plugins, legend: { display: true, labels: { color: '#7A5248', font: { size: 11 } } } } },
    })
  }

  useEffect(() => {
    ;(async () => {
      const since = new Date(Date.now() - days * 86400_000).toISOString()

      const [{ data: ordersData }, { data: paymentsData }, { data: itemsData }, { data: expensesData }] = await Promise.all([
        supabase.from('orders').select('*, restaurant_tables(number), profiles!orders_waiter_id_fkey(full_name)')
          .in('status', ['paid', 'delivered']).gte('created_at', since).order('created_at'),
        supabase.from('payments').select('*').gte('created_at', since),
        supabase.from('order_items').select('*, menu_items(name, category_id, categories(name))').gte('created_at', since),
        supabase.from('expenses').select('*').gte('expense_date', since.split('T')[0]),
      ])

      const finalOrders = (ordersData as ReportOrder[]) || []
      const finalPayments = (paymentsData as ReportPayment[]) || []
      const finalItems = (itemsData as ReportOrderItem[]) || []
      const finalExpenses = (expensesData as ReportExpense[]) || []

      setOrders(finalOrders)
      setOrderItems(finalItems)
      setExpenses(finalExpenses)

      renderDailySalesChart(finalOrders)
      renderPaymentPieChart(finalPayments, finalOrders)
      renderCategoryChart(finalItems)
      renderExpenseCategoryChart(finalExpenses)
      renderProfitChart(finalOrders, finalExpenses)
    })()

    return () => {
      salesChartRef.current?.destroy()
      paymentChartRef.current?.destroy()
      categoryChartRef.current?.destroy()
      expenseCategoryChartRef.current?.destroy()
      profitChartRef.current?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const downloadCSV = (rows: (string | number)[][], filename: string) => {
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    link.download = filename
    link.click()
  }

  const exportSalesCSV = () => {
    const rows: (string | number)[][] = [['Fecha', 'Tipo', 'Cliente', 'Teléfono', 'Subtotal', 'IVA', 'Total', 'Pago', 'Estado']]
    orders.forEach((o) => {
      const typeLabel = o.order_type === 'delivery' ? 'Domicilio' : o.order_type === 'takeout' ? 'Para Llevar' : `Mesa ${o.restaurant_tables?.number ?? ''}`
      const who = o.order_type === 'dine-in' ? (o.profiles?.full_name ?? '') : (o.delivery_name ?? '')
      rows.push([fmt.datetime(o.created_at), typeLabel, who, o.delivery_phone ?? '', o.subtotal, o.tax, o.total, o.payment_method ?? '', o.status])
    })
    downloadCSV(rows, `ventas-${days}d.csv`)
  }

  const exportOrdersCSV = () => exportSalesCSV()

  const revenue = orders.reduce((s, o) => s + Number(o.total), 0)
  const uniqueCustomers = new Set(orders.map((o) => o.customer_id).filter(Boolean)).size
  const avgTicket = orders.length ? revenue / orders.length : 0
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const netProfit = revenue - totalExpenses

  const avgMinutes = (type: string) => {
    const completed = orders.filter((o) => o.order_type === type && o.status === 'delivered')
    if (!completed.length) return null
    const totalMin = completed.reduce((s, o) => s + (new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()) / 60000, 0)
    return Math.round(totalMin / completed.length)
  }
  const deliveryAvg = avgMinutes('delivery')
  const takeoutAvg = avgMinutes('takeout')

  const byItem: Record<string, { qty: number; revenue: number }> = {}
  orderItems.forEach((oi) => {
    const name = oi.menu_items?.name ?? oi.item_name
    if (!byItem[name]) byItem[name] = { qty: 0, revenue: 0 }
    byItem[name].qty += oi.quantity
    byItem[name].revenue += oi.quantity * Number(oi.item_price)
  })
  const topItems = Object.entries(byItem).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10)
  const maxQty = topItems[0]?.[1].qty || 1

  return (
    <>
      <Topbar title="Reportes">
        <select className="form-control" style={{ width: 160 }} value={days} onChange={(e) => setDays(parseInt(e.target.value))}>
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
        <button className="btn btn-outline btn-sm" onClick={exportSalesCSV}>↓ CSV Ventas</button>
      </Topbar>

      <div className="admin-content">
        <div className="stats-grid">
          <div className="stat-card stat-green">
            <div className="stat-label">Ingresos Totales</div>
            <div className="stat-value">{fmt.currency(revenue)}</div>
          </div>
          <div className="stat-card stat-amber">
            <div className="stat-label">Órdenes Totales</div>
            <div className="stat-value">{orders.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Ticket Promedio</div>
            <div className="stat-value">{fmt.currency(avgTicket)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Clientes Únicos</div>
            <div className="stat-value">{uniqueCustomers}</div>
          </div>
          <div className="stat-card stat-danger">
            <div className="stat-label">Gastos Totales</div>
            <div className="stat-value">{fmt.currency(totalExpenses)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Utilidad Neta</div>
            <div className={`stat-value${netProfit < 0 ? ' text-danger' : ' neon-green'}`}>{fmt.currency(netProfit)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Tiempo Prom. Domicilio</div>
            <div className="stat-value" style={{ fontSize: '1.6rem' }}>{deliveryAvg === null ? '—' : `${deliveryAvg} min`}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Tiempo Prom. Para Llevar</div>
            <div className="stat-value" style={{ fontSize: '1.6rem' }}>{takeoutAvg === null ? '—' : `${takeoutAvg} min`}</div>
          </div>
        </div>

        <div className="charts-grid mt-24">
          <div className="card">
            <h3 className="mb-16">Ventas por Día</h3>
            <canvas ref={salesCanvasRef} height={220}></canvas>
          </div>
          <div className="card">
            <h3 className="mb-16">Distribución de Pagos</h3>
            <canvas ref={paymentCanvasRef} height={220}></canvas>
          </div>
        </div>

        <div className="charts-grid mt-20">
          <div className="card">
            <h3 className="mb-16">Ventas por Categoría</h3>
            <canvas ref={categoryCanvasRef} height={220}></canvas>
          </div>
          <div className="card">
            <h3 className="mb-16">Top 10 Platillos</h3>
            {topItems.length === 0 ? (
              <p className="text-muted text-sm">Sin datos.</p>
            ) : (
              <div>
                {topItems.map(([name, d], i) => (
                  <div key={name} className="top-item-row">
                    <div className={`top-item-rank${i === 0 ? ' top-1' : i === 1 ? ' top-2' : i === 2 ? ' top-3' : ''}`}>{i + 1}</div>
                    <span style={{ flex: 1, fontSize: '.85rem' }}>{name}</span>
                    <div className="top-item-bar"><div className="top-item-bar__fill" style={{ width: `${(d.qty / maxQty * 100).toFixed(0)}%` }} /></div>
                    <span className="text-sm" style={{ minWidth: 40, textAlign: 'right' }}>{d.qty}x</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="charts-grid mt-20">
          <div className="card">
            <h3 className="mb-16">Gastos por Categoría</h3>
            <canvas ref={expenseCategoryCanvasRef} height={220}></canvas>
          </div>
          <div className="card">
            <h3 className="mb-16">Ingresos vs. Gastos por Día</h3>
            <canvas ref={profitCanvasRef} height={220}></canvas>
          </div>
        </div>

        <div className="card mt-20">
          <div className="flex justify-between items-center mb-16">
            <h3>Detalle de Órdenes</h3>
            <button className="btn btn-outline btn-sm" onClick={exportOrdersCSV}>↓ Exportar</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Fecha</th><th>Tipo</th><th>Cliente</th><th>Teléfono</th><th>Total</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={6} className="text-muted text-center" style={{ padding: 32 }}>Sin órdenes en este período.</td></tr>
                ) : (
                  orders.map((o) => {
                    const typeLabel = o.order_type === 'delivery' ? '🛵 Domicilio' : o.order_type === 'takeout' ? '🥡 Para Llevar' : `🍽 Mesa ${o.restaurant_tables?.number ?? '—'}`
                    const who = o.order_type === 'dine-in' ? (o.profiles?.full_name ?? '—') : (o.delivery_name ?? '—')
                    return (
                      <tr key={o.id}>
                        <td>{fmt.datetime(o.created_at)}</td>
                        <td>{typeLabel}</td>
                        <td>{who}</td>
                        <td>{o.delivery_phone ?? '—'}</td>
                        <td className="neon-amber" style={{ fontWeight: 700 }}>{fmt.currency(o.total)}</td>
                        <td><span className={`badge ${STATUS_CLS[o.status] ?? 'badge-muted'}`}>{STATUS_ES[o.status] ?? o.status}</span></td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
