'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Chart, LineController, DoughnutController,
  CategoryScale, LinearScale, PointElement, LineElement, ArcElement,
  Tooltip, Legend, Filler,
} from 'chart.js'
import { createClient } from '@/lib/supabase/client'

Chart.register(LineController, DoughnutController, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler)
import { fmt } from '@/lib/format'
import { useAdmin, useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import LiveClock from '../../components/LiveClock'

const STATUS_LABEL: Record<string, string> = {
  open: 'Abierta', in_kitchen: 'En Cocina', ready: 'Lista',
  delivered: 'Entregada', paid: 'Pagada', cancelled: 'Cancelada',
}
const STATUS_CLS: Record<string, string> = {
  open: 'badge-amber', in_kitchen: 'badge-info', ready: 'badge-primary',
  delivered: 'badge-muted', paid: 'badge-primary', cancelled: 'badge-danger',
}

type RecentOrder = {
  id: string
  total: number
  status: string
  created_at: string
  restaurant_tables: { number: number } | null
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function chartOptions() {
  const muted = cssVar('--text-muted')
  const bg2   = cssVar('--bg-2')
  const bg3   = cssVar('--bg-3')
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: bg3, borderColor: bg2, borderWidth: 1, titleColor: '#FFFFFF', bodyColor: cssVar('--text-secondary') },
    },
    scales: {
      x: { ticks: { color: muted, font: { size: 11 } }, grid: { color: 'rgba(255,150,80,0.05)' } },
      y: { ticks: { color: muted, font: { size: 11 } }, grid: { color: 'rgba(255,150,80,0.05)' } },
    },
  }
}

export default function DashboardClient() {
  useRequireRole(['admin', 'waiter'])
  const { tenant } = useAdmin()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [salesToday, setSalesToday] = useState(0)
  const [ordersTodayCount, setOrdersTodayCount] = useState(0)
  const [salesWeek, setSalesWeek] = useState(0)
  const [tablesOccupied, setTablesOccupied] = useState(0)
  const [tablesTotal, setTablesTotal] = useState(0)
  const [inKitchenCount, setInKitchenCount] = useState(0)
  const [expensesToday, setExpensesToday] = useState(0)
  const [topItems, setTopItems] = useState<[string, number][]>([])
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])

  const salesCanvasRef = useRef<HTMLCanvasElement>(null)
  const paymentCanvasRef = useRef<HTMLCanvasElement>(null)
  const salesChartRef = useRef<Chart | null>(null)
  const paymentChartRef = useRef<Chart | null>(null)

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        // El Salvador = UTC-6, sin horario de verano
        const SV_OFFSET_MS = 6 * 60 * 60 * 1000
        const localNow = new Date(Date.now() - SV_OFFSET_MS)
        const today = localNow.toISOString().split('T')[0]   // fecha local "YYYY-MM-DD"
        const todayStart = `${today}T06:00:00Z`              // 00:00 SV = 06:00 UTC
        const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()

        const results = await Promise.all([
          supabase.from('payments').select('amount').gte('created_at', todayStart),
          supabase.from('payments').select('amount, created_at').gte('created_at', weekAgo),
          supabase.from('restaurant_tables').select('status'),
          supabase.from('orders').select('id').in('status', ['in_kitchen']),
          supabase.from('payments').select('method, amount').gte('created_at', todayStart),
          supabase.from('order_items').select('item_name, quantity, item_price').gte('created_at', todayStart),
          supabase.from('expenses').select('amount').eq('expense_date', today),
          supabase.from('orders').select('*, restaurant_tables(number)').gte('created_at', todayStart).order('created_at', { ascending: false }).limit(8),
        ])

        if (results.some((r) => r.error)) throw new Error('Query error')

        const [
          { data: todayOrders }, { data: weekOrders }, { data: tables }, { data: inKitchen },
          { data: todayPayments }, { data: topItemsRaw }, { data: todayExpenses }, { data: recent },
        ] = results

        setSalesToday((todayOrders || []).reduce((s, p) => s + Number(p.amount), 0))
        setOrdersTodayCount(todayOrders?.length ?? 0)
        setSalesWeek((weekOrders || []).reduce((s, p) => s + Number(p.amount), 0))
        setTablesOccupied((tables || []).filter((t) => t.status === 'occupied').length)
        setTablesTotal(tables?.length ?? 0)
        setInKitchenCount(inKitchen?.length ?? 0)
        setExpensesToday((todayExpenses || []).reduce((s, e) => s + Number(e.amount), 0))
        setRecentOrders((recent as RecentOrder[]) ?? [])

        const byItem: Record<string, number> = {}
        ;(topItemsRaw || []).forEach((i) => { byItem[i.item_name] = (byItem[i.item_name] || 0) + i.quantity })
        setTopItems(Object.entries(byItem).sort((a, b) => b[1] - a[1]).slice(0, 6))

        renderSalesChart(weekOrders || [])
        renderPaymentChart(todayPayments || [])
        setError(false)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    const renderSalesChart = (payments: { amount: number; created_at: string }[]) => {
      const byDay: Record<string, number> = {}
      payments.forEach((p) => {
        const d = p.created_at.slice(0, 10)
        byDay[d] = (byDay[d] || 0) + Number(p.amount)
      })

      const labels: string[] = []
      const values: number[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10)
        labels.push(d.slice(5))
        values.push(+(byDay[d] || 0).toFixed(2))
      }

      if (!salesCanvasRef.current) return
      salesChartRef.current?.destroy()
      salesChartRef.current = new Chart(salesCanvasRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Ventas', data: values,
            borderColor: cssVar('--orange'), backgroundColor: cssVar('--orange-alpha'),
            fill: true, tension: 0.4, pointBackgroundColor: cssVar('--orange'), pointRadius: 4, pointHoverRadius: 6,
          }],
        },
        options: chartOptions(),
      })
    }

    const renderPaymentChart = (payments: { method: string; amount: number }[]) => {
      const byMethod: Record<string, number> = {}
      payments.forEach((p) => { byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount) })

      if (!paymentCanvasRef.current) return
      paymentChartRef.current?.destroy()
      paymentChartRef.current = new Chart(paymentCanvasRef.current, {
        type: 'doughnut',
        data: {
          labels: Object.keys(byMethod),
          datasets: [{ data: Object.values(byMethod), backgroundColor: [cssVar('--orange'), cssVar('--amber'), cssVar('--info'), cssVar('--danger')], borderColor: cssVar('--bg-2'), borderWidth: 2 }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom', labels: { color: cssVar('--text-muted'), padding: 12, font: { size: 11 } } },
            tooltip: { backgroundColor: cssVar('--bg-3'), titleColor: '#FFFFFF', bodyColor: cssVar('--text-secondary'), borderColor: cssVar('--bg-2'), borderWidth: 1 },
          },
        },
      })
    }

    loadDashboard()
    const id = setInterval(loadDashboard, 60_000)
    return () => {
      clearInterval(id)
      salesChartRef.current?.destroy()
      paymentChartRef.current?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const maxQty = topItems[0]?.[1] || 1

  return (
    <>
      <Topbar title="Dashboard">
        <LiveClock />
      </Topbar>

      <div className="admin-content">
        <div className="text-muted text-xs mb-12" style={{ letterSpacing: '.05em', textTransform: 'uppercase' }}>
          Negocio activo: <strong style={{ color: 'var(--text)' }}>{tenant.name}</strong>
        </div>
        {error && (
          <div className="alert alert-error mb-16" role="alert">
            Error al cargar datos del dashboard. Verifica tu conexión.
          </div>
        )}
        <div className="stats-grid">
          <div className="stat-card stat-green">
            <div className="stat-label">Ventas Hoy</div>
            <div className="stat-value">{loading ? <span className="text-muted">—</span> : fmt.currency(salesToday)}</div>
            <div className="stat-sub">{loading ? '' : `${ordersTodayCount} órdenes`}</div>
          </div>
          <div className="stat-card stat-amber">
            <div className="stat-label">Ventas Semana</div>
            <div className="stat-value">{loading ? <span className="text-muted">—</span> : fmt.currency(salesWeek)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Mesas Ocupadas</div>
            <div className="stat-value">{loading ? <span className="text-muted">—</span> : tablesOccupied}</div>
            <div className="stat-sub">{loading ? '' : `de ${tablesTotal} mesas`}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Órdenes en Cocina</div>
            <div className="stat-value">{loading ? <span className="text-muted">—</span> : inKitchenCount}</div>
          </div>
          <div className="stat-card stat-danger">
            <div className="stat-label">Gastos de Hoy</div>
            <div className="stat-value">{loading ? <span className="text-muted">—</span> : fmt.currency(expensesToday)}</div>
          </div>
        </div>

        <div className="charts-grid mt-20">
          <div className="card">
            <h3 className="mb-16">Ventas Últimos 7 Días</h3>
            <div style={{ position: 'relative', height: 220 }}><canvas ref={salesCanvasRef}></canvas></div>
          </div>
          <div className="card">
            <h3 className="mb-16">Métodos de Pago (Hoy)</h3>
            <div style={{ position: 'relative', height: 220 }}><canvas ref={paymentCanvasRef}></canvas></div>
          </div>
        </div>

        <div className="dashboard-bottom">
          <div className="card">
            <h3 className="mb-16">Top Platillos del Día</h3>
            <div>
              {topItems.length === 0 ? (
                <p className="text-muted text-sm">Sin ventas hoy.</p>
              ) : (
                topItems.map(([name, qty], i) => (
                  <div key={name} className="top-item-row">
                    <div className={`top-item-rank${i === 0 ? ' top-1' : i === 1 ? ' top-2' : i === 2 ? ' top-3' : ''}`}>{i + 1}</div>
                    <span style={{ flex: 1, fontSize: '.85rem' }}>{name}</span>
                    <div className="top-item-bar"><div className="top-item-bar__fill" style={{ width: `${(qty / maxQty * 100).toFixed(0)}%` }}></div></div>
                    <span className="text-sm text-muted" style={{ minWidth: 30, textAlign: 'right' }}>{qty}x</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="card">
            <h3 className="mb-16">Órdenes Recientes</h3>
            <div>
              {recentOrders.length === 0 ? (
                <p className="text-muted text-sm">Sin órdenes recientes.</p>
              ) : (
                recentOrders.map((o) => (
                  <div key={o.id} className="recent-order-row">
                    <span>Mesa {o.restaurant_tables?.number ?? '—'}</span>
                    <span className="text-muted text-xs">{fmt.time(o.created_at)}</span>
                    <span style={{ fontWeight: 700, color: 'var(--amber)' }}>{fmt.currency(o.total)}</span>
                    <span className={`badge ${STATUS_CLS[o.status] ?? 'badge-muted'}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
