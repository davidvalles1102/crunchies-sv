'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'
import type { Payment } from '@/lib/types'
import { buildPaymentPDF } from './receipt-pdf'

const METHOD_ICON: Record<string, string> = { cash: '💵', card: '💳', transfer: '📲', points: '⭐' }

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function PaymentsClient() {
  useRequireRole(['admin', 'waiter'])
  const supabase = createClient()
  const toast = useToast()

  const [filterDate, setFilterDate] = useState(todayStr)
  const [payments, setPayments] = useState<Payment[]>([])

  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null)
  const [waOpen, setWaOpen] = useState(false)
  const [waPhone, setWaPhone] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, orders(*, restaurant_tables(number), order_items(*, order_item_modifiers(*))), profiles!payments_processed_by_fkey(full_name)')
        .gte('created_at', `${filterDate}T00:00:00`)
        .lte('created_at', `${filterDate}T23:59:59`)
        .order('created_at', { ascending: false })

      if (error) { toast('Error al cargar pagos', 'error'); return }
      setPayments((data as Payment[]) ?? [])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate])

  const total = payments.reduce((s, p) => s + Number(p.amount), 0)
  const byCash = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + Number(p.amount), 0)
  const byCard = payments.filter((p) => p.method === 'card').reduce((s, p) => s + Number(p.amount), 0)
  const byTransfer = payments.filter((p) => p.method === 'transfer').reduce((s, p) => s + Number(p.amount), 0)

  const downloadPDF = (p: Payment) => {
    const doc = buildPaymentPDF(p)
    doc.save(`recibo-${p.receipt_number}.pdf`)
  }

  const confirmWhatsApp = () => {
    const raw = waPhone.trim().replace(/[\s\-()+]/g, '')
    if (!raw) { toast('Ingresa un número de WhatsApp', 'warning'); return }
    if (!receiptPayment) return

    const doc = buildPaymentPDF(receiptPayment)
    doc.save(`recibo-${receiptPayment.receipt_number}.pdf`)
    window.open(`https://wa.me/${raw}`, '_blank')
    toast('PDF descargado — adjúntalo en la conversación de WhatsApp', 'info')
    setWaOpen(false)
  }

  const exportCSV = () => {
    const rows: (string | number)[][] = [['Recibo', 'Mesa', 'Método', 'Monto', 'Cambio', 'Cajero', 'Fecha/Hora']]
    payments.forEach((p) => {
      rows.push([
        p.receipt_number,
        `Mesa ${p.orders?.restaurant_tables?.number ?? ''}`,
        p.method,
        p.amount,
        p.change_amount,
        p.profiles?.full_name ?? '',
        fmt.datetime(p.created_at),
      ])
    })
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    link.download = `pagos-${filterDate}.csv`
    link.click()
  }

  return (
    <>
      <Topbar title="Historial de Pagos">
        <input type="date" className="form-control date-filter-input" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        <button className="btn btn-outline btn-sm" onClick={exportCSV}>↓ Exportar CSV</button>
      </Topbar>

      <div className="admin-content">
        <div className="stats-grid">
          <div className="stat-card stat-green">
            <div className="stat-label">Total del Día</div>
            <div className="stat-value">{fmt.currency(total)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Efectivo</div>
            <div className="stat-value">{fmt.currency(byCash)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Tarjeta</div>
            <div className="stat-value">{fmt.currency(byCard)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Transferencia</div>
            <div className="stat-value">{fmt.currency(byTransfer)}</div>
          </div>
        </div>

        <div className="card mt-24">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Recibo #</th>
                  <th>Mesa</th>
                  <th>Método</th>
                  <th>Monto</th>
                  <th>Cambio</th>
                  <th>Cajero</th>
                  <th>Hora</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={8} className="text-muted text-center" style={{ padding: 32 }}>Sin pagos para esta fecha.</td></tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id}>
                      <td><span className="text-xs" style={{ fontFamily: 'monospace' }}>{p.receipt_number}</span></td>
                      <td>Mesa {p.orders?.restaurant_tables?.number ?? '—'}</td>
                      <td>{METHOD_ICON[p.method] ?? ''} {p.method}</td>
                      <td className="neon-green" style={{ fontWeight: 700 }}>{fmt.currency(p.amount)}</td>
                      <td>{p.change_amount > 0 ? fmt.currency(p.change_amount) : '—'}</td>
                      <td>{p.profiles?.full_name ?? '—'}</td>
                      <td>{fmt.time(p.created_at)}</td>
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => setReceiptPayment(p)}>🖨️</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={`modal-backdrop${receiptPayment ? '' : ' hidden'}`}>
        <div className="modal">
          <div className="modal-header">
            <h3>Recibo</h3>
            <button className="modal-close" onClick={() => setReceiptPayment(null)}>✕</button>
          </div>
          {receiptPayment && (
            <div className="modal-body">
              <div className="receipt">
                <div className="receipt__logo">CRUNCHIES</div>
                <div className="receipt__address">{fmt.datetime(receiptPayment.created_at)}</div>
                <hr className="receipt__divider" />
                <div>Recibo: {receiptPayment.receipt_number}</div>
                <div>Mesa: {receiptPayment.orders?.restaurant_tables?.number ?? '—'}</div>
                <div>Cajero: {receiptPayment.profiles?.full_name ?? '—'}</div>
                <hr className="receipt__divider" />
                <div className="receipt__item receipt__total"><span>TOTAL</span><span>{fmt.currency(receiptPayment.amount)}</span></div>
                <div className="receipt__item"><span>Método</span><span>{receiptPayment.method}</span></div>
                {receiptPayment.change_amount > 0 && (
                  <div className="receipt__item"><span>Cambio</span><span>{fmt.currency(receiptPayment.change_amount)}</span></div>
                )}
                <hr className="receipt__divider" />
                <div className="receipt__thanks">¡Gracias por su visita!</div>
              </div>
            </div>
          )}
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={() => setReceiptPayment(null)}>Cerrar</button>
            <button className="btn btn-whatsapp" onClick={async () => {
              if (!receiptPayment) return
              const testFile = new File([new Blob()], 'test.pdf', { type: 'application/pdf' })
              if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [testFile] })) {
                // Mobile: share sheet available — share PDF directly without phone dialog
                const doc = buildPaymentPDF(receiptPayment)
                const blob = doc.output('blob')
                const file = new File([blob], `recibo-${receiptPayment.receipt_number}.pdf`, { type: 'application/pdf' })
                try { await navigator.share({ files: [file], title: `Recibo ${receiptPayment.receipt_number}` }) } catch { /* cancelled */ }
              } else {
                // Desktop: ask for phone number
                setWaPhone(''); setWaOpen(true)
              }
            }}>📱 WhatsApp</button>
            <button className="btn btn-primary" onClick={() => receiptPayment && downloadPDF(receiptPayment)}>🖨️ Reimprimir</button>
          </div>
        </div>
      </div>

      <div className={`modal-backdrop${waOpen ? '' : ' hidden'}`}>
        <div className="modal" style={{ maxWidth: 380 }}>
          <div className="modal-header">
            <h3>📱 Enviar por WhatsApp</h3>
            <button className="modal-close" onClick={() => setWaOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
              WhatsApp se abrirá con el recibo listo para enviar. Solo presiona ▶ en WhatsApp.
            </p>
            <div className="form-group">
              <label className="form-label">Número del cliente</label>
              <input
                type="tel" className="form-control" placeholder="Ej: 573001234567"
                value={waPhone} onChange={(e) => setWaPhone(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmWhatsApp() }}
              />
              <div className="text-xs text-muted" style={{ marginTop: 4 }}>Sin espacios ni guiones · incluye código de país (57 Colombia, 503 El Salvador)</div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={() => setWaOpen(false)}>Cancelar</button>
            <button className="btn btn-whatsapp" onClick={confirmWhatsApp}>Abrir WhatsApp ▶</button>
          </div>
        </div>
      </div>
    </>
  )
}
