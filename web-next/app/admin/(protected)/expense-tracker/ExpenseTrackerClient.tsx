'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Chart, BarController, LineController,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  Tooltip, Filler,
} from 'chart.js'

Chart.register(BarController, LineController, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler)
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'
import type { Expense, ExpenseCategory } from '@/lib/types'

const CAT_LABELS: Record<ExpenseCategory, string> = {
  insumos: '🥩 Insumos',
  servicios: '💡 Servicios',
  nomina: '👥 Nómina',
  renta: '🏠 Renta',
  mantenimiento: '🔧 Mantenimiento',
  marketing: '📣 Marketing',
  transporte: '🛵 Transporte',
  otros: '📦 Otros',
}
const RECURRENCE_LABELS: Record<string, string> = { daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual' }
const METHOD_ICON: Record<string, string> = { cash: '💵', card: '💳', transfer: '📲' }

function chartOptions(prefix = '') {
  return {
    responsive: true,
    maintainAspectRatio: false,
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

const emptyForm = {
  id: '',
  category: 'insumos' as ExpenseCategory,
  description: '',
  amount: '',
  payment_method: 'cash',
  expense_date: new Date().toISOString().split('T')[0],
  is_recurring: false,
  recurrence: 'monthly',
}

export default function ExpenseTrackerClient() {
  useRequireRole(['admin'])
  const supabase = createClient()
  const toast = useToast()

  const [rangeDays, setRangeDays] = useState(30)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [tableUnavailable, setTableUnavailable] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const categoryCanvasRef = useRef<HTMLCanvasElement>(null)
  const dailyCanvasRef = useRef<HTMLCanvasElement>(null)
  const categoryChartRef = useRef<Chart | null>(null)
  const dailyChartRef = useRef<Chart | null>(null)

  useEffect(() => {
    ;(async () => {
      const since = new Date(Date.now() - rangeDays * 86400_000).toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', since)
        .order('expense_date', { ascending: false })

      if (error && error.code === '42P01') { setTableUnavailable(true); return }
      if (error) { toast('Error al cargar gastos', 'error'); return }
      setTableUnavailable(false)
      setExpenses((data as Expense[]) ?? [])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays])

  useEffect(() => {
    const byCat: Record<string, number> = {}
    expenses.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount) })
    const catLabels = Object.keys(byCat).map((k) => CAT_LABELS[k as ExpenseCategory] ?? k)
    const catValues = Object.values(byCat)

    if (categoryCanvasRef.current) {
      categoryChartRef.current?.destroy()
      categoryChartRef.current = new Chart(categoryCanvasRef.current, {
        type: 'bar',
        data: { labels: catLabels, datasets: [{ label: 'Gastos ($)', data: catValues, backgroundColor: 'rgba(255,59,59,0.7)', borderColor: '#FF3B3B', borderWidth: 1, borderRadius: 6 }] },
        options: { ...chartOptions('$'), indexAxis: 'y' as const },
      })
    }

    const byDay: Record<string, number> = {}
    expenses.forEach((e) => { byDay[e.expense_date] = (byDay[e.expense_date] || 0) + Number(e.amount) })
    const dayLabels = Object.keys(byDay).sort()
    const dayValues = dayLabels.map((d) => byDay[d])

    if (dailyCanvasRef.current) {
      dailyChartRef.current?.destroy()
      dailyChartRef.current = new Chart(dailyCanvasRef.current, {
        type: 'line',
        data: { labels: dayLabels, datasets: [{ label: 'Gastos ($)', data: dayValues, borderColor: '#FF3B3B', backgroundColor: 'rgba(255,59,59,0.08)', tension: 0.4, fill: true, pointBackgroundColor: '#FF3B3B', pointRadius: 4 }] },
        options: chartOptions('$'),
      })
    }

    return () => {
      categoryChartRef.current?.destroy()
      dailyChartRef.current?.destroy()
    }
  }, [expenses])

  const today = new Date().toISOString().split('T')[0]
  const periodTotal = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const todayTotal = expenses.filter((e) => e.expense_date === today).reduce((s, e) => s + Number(e.amount), 0)
  const recurring = expenses.filter((e) => e.is_recurring)
  const byCatTotals: Record<string, number> = {}
  expenses.forEach((e) => { byCatTotals[e.category] = (byCatTotals[e.category] || 0) + Number(e.amount) })
  const topCat = Object.entries(byCatTotals).sort((a, b) => b[1] - a[1])[0]

  const loadExpenses = async () => {
    const since = new Date(Date.now() - rangeDays * 86400_000).toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .gte('expense_date', since)
      .order('expense_date', { ascending: false })
    if (!error) setExpenses((data as Expense[]) ?? [])
  }

  const openModal = (expense: Expense | null = null) => {
    setForm(expense ? {
      id: expense.id,
      category: expense.category,
      description: expense.description,
      amount: String(expense.amount),
      payment_method: expense.payment_method,
      expense_date: expense.expense_date,
      is_recurring: expense.is_recurring,
      recurrence: expense.recurrence ?? 'monthly',
    } : emptyForm)
    setModalOpen(true)
  }

  const saveExpense = async () => {
    const description = form.description.trim()
    const amount = parseFloat(form.amount)

    if (!description) { toast('Ingresa una descripción', 'warning'); return }
    if (!amount || amount <= 0) { toast('Ingresa un monto válido', 'warning'); return }

    setSaving(true)
    const payload = {
      category: form.category,
      description,
      amount,
      payment_method: form.payment_method,
      expense_date: form.expense_date,
      is_recurring: form.is_recurring,
      recurrence: form.is_recurring ? form.recurrence : null,
    }

    let error
    if (form.id) {
      ;({ error } = await supabase.from('expenses').update(payload).eq('id', form.id))
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      ;({ error } = await supabase.from('expenses').insert({ ...payload, registered_by: user?.id }))
    }

    setSaving(false)
    if (error) { toast('Error al guardar el gasto', 'error'); return }
    toast(form.id ? 'Gasto actualizado' : 'Gasto registrado', 'success')
    setModalOpen(false)
    await loadExpenses()
  }

  const deleteExpense = async (id: string) => {
    if (!confirm('¿Eliminar este gasto permanentemente?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { toast('Error al eliminar', 'error'); return }
    toast('Gasto eliminado', 'success')
    await loadExpenses()
  }

  const exportCSV = () => {
    const rows: (string | number)[][] = [['Fecha', 'Categoría', 'Descripción', 'Método', 'Monto', 'Recurrente', 'Registrado por']]
    expenses.forEach((e) => {
      rows.push([
        e.expense_date,
        CAT_LABELS[e.category] ?? e.category,
        e.description,
        e.payment_method ?? '',
        e.amount,
        e.is_recurring ? (RECURRENCE_LABELS[e.recurrence ?? ''] ?? 'Sí') : 'No',
        e.profiles?.full_name ?? '',
      ])
    })
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    link.download = `gastos-${rangeDays}d.csv`
    link.click()
  }

  return (
    <>
      <Topbar title="Registro de Gastos">
        <select className="form-control" style={{ width: 160 }} value={rangeDays} onChange={(e) => setRangeDays(parseInt(e.target.value))}>
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
        <button className="btn btn-outline btn-sm" onClick={exportCSV}>↓ Exportar CSV</button>
        <button className="btn btn-primary btn-sm" onClick={() => openModal()}>+ Nuevo Gasto</button>
      </Topbar>

      <div className="admin-content">
        {tableUnavailable ? (
          <div className="card mt-24" style={{ padding: 32, textAlign: 'center', color: 'var(--amber)' }}>
            ⚠️ La tabla de gastos no existe aún. Ejecuta <strong>supabase/expenses_create.sql</strong> en Supabase SQL Editor.
          </div>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card stat-danger">
                <div className="stat-label">Gastos del Período</div>
                <div className="stat-value">{fmt.currency(periodTotal)}</div>
                <div className="stat-sub">{expenses.length} registros</div>
              </div>
              <div className="stat-card stat-danger">
                <div className="stat-label">Gastos de Hoy</div>
                <div className="stat-value">{fmt.currency(todayTotal)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Categoría con Más Gasto</div>
                <div className="stat-value" style={{ fontSize: '1.3rem' }}>{topCat ? CAT_LABELS[topCat[0] as ExpenseCategory] : '—'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Recurrentes Activos</div>
                <div className="stat-value">{recurring.length}</div>
                <div className="stat-sub">{fmt.currency(recurring.reduce((s, e) => s + Number(e.amount), 0))} / período</div>
              </div>
            </div>

            <div className="charts-grid mt-24">
              <div className="card">
                <h3 className="mb-16">Gastos por Categoría</h3>
                <div style={{ position: 'relative', height: 220 }}><canvas ref={categoryCanvasRef}></canvas></div>
              </div>
              <div className="card">
                <h3 className="mb-16">Gastos por Día</h3>
                <div style={{ position: 'relative', height: 220 }}><canvas ref={dailyCanvasRef}></canvas></div>
              </div>
            </div>

            <div className="card mt-24">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Método</th><th>Monto</th><th>Recurrente</th><th>Registrado por</th><th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length === 0 ? (
                      <tr><td colSpan={8} className="text-muted text-center" style={{ padding: 32 }}>Sin gastos registrados en este período.</td></tr>
                    ) : (
                      expenses.map((e) => (
                        <tr key={e.id}>
                          <td>{fmt.date(e.expense_date)}</td>
                          <td>{CAT_LABELS[e.category] ?? e.category}</td>
                          <td>{e.description}</td>
                          <td>{METHOD_ICON[e.payment_method] ?? '—'}</td>
                          <td className="text-danger" style={{ fontWeight: 700 }}>{fmt.currency(e.amount)}</td>
                          <td>{e.is_recurring ? <span className="badge badge-amber">{RECURRENCE_LABELS[e.recurrence ?? ''] ?? 'Sí'}</span> : '—'}</td>
                          <td>{e.profiles?.full_name ?? '—'}</td>
                          <td>
                            <button className="btn btn-outline btn-sm" onClick={() => openModal(e)}>✎</button>{' '}
                            <button className="btn btn-danger btn-sm" onClick={() => deleteExpense(e.id)}>✕</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <div className={`modal-backdrop${modalOpen ? '' : ' hidden'}`}>
        <div className="modal">
          <div className="modal-header">
            <h3>{form.id ? 'Editar Gasto' : 'Nuevo Gasto'}</h3>
            <button className="modal-close" onClick={() => setModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-control" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
                  {Object.entries(CAT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
              <div className="form-group mt-16">
                <label className="form-label">Descripción</label>
                <input type="text" className="form-control" placeholder="Ej: Compra de carne y verduras" required
                  value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="form-group mt-16">
                <label className="form-label">Monto</label>
                <input type="number" className="form-control" min="0.01" step="0.01" placeholder="0.00" required
                  value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="form-group mt-16">
                <label className="form-label">Método de pago</label>
                <select className="form-control" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                  <option value="cash">💵 Efectivo</option>
                  <option value="card">💳 Tarjeta</option>
                  <option value="transfer">📲 Transferencia</option>
                </select>
              </div>
              <div className="form-group mt-16">
                <label className="form-label">Fecha</label>
                <input type="date" className="form-control" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
              </div>
              <div className="form-group mt-16">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={form.is_recurring} onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })} />
                  Gasto recurrente
                </label>
              </div>
              {form.is_recurring && (
                <div className="form-group mt-16">
                  <label className="form-label">Frecuencia</label>
                  <select className="form-control" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensual</option>
                  </select>
                </div>
              )}
            </form>
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving} onClick={saveExpense}>{saving ? 'Guardando...' : 'Guardar Gasto'}</button>
          </div>
        </div>
      </div>
    </>
  )
}
