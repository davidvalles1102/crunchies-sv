'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'

type ExportRow = {
  id: string
  receipt_number: string
  method: string
  amount: number
  change_amount: number
  created_at: string
  orders: { subtotal: number; tax: number; total: number; order_type: string } | null
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function csvEscape(v: string | number) {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function FiscalExportClient() {
  useRequireRole(['admin'])
  const supabase = createClient()
  const toast = useToast()

  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [rows, setRows] = useState<ExportRow[] | null>(null)
  const [generating, setGenerating] = useState(false)

  async function generate(e: React.FormEvent) {
    e.preventDefault()
    setGenerating(true)
    const { data, error } = await supabase
      .from('payments')
      .select('id, receipt_number, method, amount, change_amount, created_at, orders(subtotal, tax, total, order_type)')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .order('created_at')

    if (error) {
      toast('Error al generar el reporte', 'error')
    } else {
      setRows((data as unknown as ExportRow[]) ?? [])
    }
    setGenerating(false)
  }

  function downloadCsv() {
    if (!rows) return
    const header = ['fecha', 'recibo', 'tipo_orden', 'metodo_pago', 'subtotal', 'impuesto', 'total', 'vuelto']
    const lines = rows.map((r) => [
      r.created_at,
      r.receipt_number,
      r.orders?.order_type ?? '',
      r.method,
      r.orders?.subtotal ?? 0,
      r.orders?.tax ?? 0,
      r.orders?.total ?? r.amount,
      r.change_amount,
    ].map(csvEscape).join(','))
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ventas_${from}_a_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totals = rows?.reduce((acc, r) => ({
    subtotal: acc.subtotal + (r.orders?.subtotal ?? 0),
    tax: acc.tax + (r.orders?.tax ?? 0),
    total: acc.total + (r.orders?.total ?? r.amount),
  }), { subtotal: 0, tax: 0, total: 0 })

  return (
    <>
      <Topbar title="Exportación contable" />
      <div className="admin-content">
        <div className="card mb-24" style={{ maxWidth: 480 }}>
          <h4 style={{ marginBottom: 16 }}>📤 Generar reporte de ventas</h4>
          <form className="flex-col gap-12" onSubmit={generate}>
            <div className="form-group">
              <label className="form-label">Desde</label>
              <input type="date" className="form-control" required value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Hasta</label>
              <input type="date" className="form-control" required value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={generating}>
              {generating ? 'Generando...' : 'Generar'}
            </button>
          </form>
        </div>

        {rows && (
          <div className="card" style={{ maxWidth: 640 }}>
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4>{rows.length} pago{rows.length === 1 ? '' : 's'}</h4>
              <button className="btn btn-outline btn-sm" onClick={downloadCsv} disabled={rows.length === 0}>
                ⬇️ Descargar CSV
              </button>
            </div>
            {totals && (
              <div className="flex-col gap-4 mb-16">
                <div className="perf-stat"><span>Subtotal</span><span className="perf-stat__val">{fmt.currency(totals.subtotal)}</span></div>
                <div className="perf-stat"><span>Impuesto</span><span className="perf-stat__val">{fmt.currency(totals.tax)}</span></div>
                <div className="perf-stat"><span>Total</span><span className="perf-stat__val">{fmt.currency(totals.total)}</span></div>
              </div>
            )}
            <div className="text-xs text-muted">
              El CSV incluye fecha, recibo, tipo de orden, método de pago, subtotal, impuesto, total y vuelto — listo para importar a una hoja de cálculo contable.
            </div>
          </div>
        )}
      </div>
    </>
  )
}
