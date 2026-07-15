'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useAdmin, useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'

type CashSession = {
  id: string
  status: 'open' | 'closed'
  opening_amount: number
  opened_at: string
  expected_amount: number | null
  counted_amount: number | null
  difference: number | null
  closed_at: string | null
  notes: string | null
}

type Movement = {
  id: string
  movement_type: 'in' | 'out'
  amount: number
  reason: string
  created_at: string
}

export default function CashClient() {
  useRequireRole(['admin', 'waiter'])
  const { tenant, profile } = useAdmin()
  const supabase = createClient()
  const toast = useToast()

  const [session, setSession] = useState<CashSession | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [expected, setExpected] = useState<number | null>(null)
  const [history, setHistory] = useState<CashSession[]>([])
  const [loading, setLoading] = useState(true)

  const [openingAmount, setOpeningAmount] = useState('')
  const [opening, setOpening] = useState(false)

  const [movType, setMovType] = useState<'in' | 'out'>('out')
  const [movAmount, setMovAmount] = useState('')
  const [movReason, setMovReason] = useState('')
  const [addingMovement, setAddingMovement] = useState(false)

  const [countedAmount, setCountedAmount] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [closing, setClosing] = useState(false)

  const load = useCallback(async () => {
    const { data: open } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('tenant_id', tenant.tenant_id)
      .eq('status', 'open')
      .maybeSingle<CashSession>()

    setSession(open ?? null)

    if (open) {
      const [{ data: movs }, { data: exp }] = await Promise.all([
        supabase.from('cash_session_movements').select('*').eq('cash_session_id', open.id).order('created_at', { ascending: false }),
        supabase.rpc('compute_cash_session_expected', { p_session_id: open.id }),
      ])
      setMovements((movs as Movement[]) ?? [])
      setExpected(typeof exp === 'number' ? exp : null)
    } else {
      setMovements([])
      setExpected(null)
    }

    const { data: closed } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('tenant_id', tenant.tenant_id)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(10)
    setHistory((closed as CashSession[]) ?? [])

    setLoading(false)
  }, [supabase, tenant.tenant_id])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function openRegister(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(openingAmount)
    if (isNaN(amount) || amount < 0) { toast('Monto de apertura inválido', 'warning'); return }
    setOpening(true)
    const { error } = await supabase.from('cash_sessions').insert({
      tenant_id: tenant.tenant_id,
      opening_amount: amount,
      opened_by: profile.id,
    })
    if (error) {
      toast(error.message.includes('one_open') ? 'Ya hay una caja abierta' : 'Error al abrir caja', 'error')
    } else {
      toast('Caja abierta ✓')
      setOpeningAmount('')
      await load()
    }
    setOpening(false)
  }

  async function addMovement(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return
    const amount = parseFloat(movAmount)
    const reason = movReason.trim()
    if (isNaN(amount) || amount <= 0 || !reason) { toast('Monto y motivo requeridos', 'warning'); return }
    setAddingMovement(true)
    const { error } = await supabase.from('cash_session_movements').insert({
      tenant_id: tenant.tenant_id,
      cash_session_id: session.id,
      movement_type: movType,
      amount,
      reason,
      created_by: profile.id,
    })
    if (error) {
      toast('Error al registrar movimiento', 'error')
    } else {
      toast('Movimiento registrado ✓')
      setMovAmount('')
      setMovReason('')
      await load()
    }
    setAddingMovement(false)
  }

  async function closeRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return
    const counted = parseFloat(countedAmount)
    if (isNaN(counted) || counted < 0) { toast('Monto contado inválido', 'warning'); return }
    if (!confirm('¿Cerrar caja? Esta acción no se puede deshacer.')) return
    setClosing(true)
    const { data, error } = await supabase.rpc('close_cash_session', {
      p_session_id: session.id,
      p_counted_amount: counted,
      p_notes: closeNotes.trim() || null,
    })
    if (error) {
      toast('Error al cerrar caja', 'error')
    } else {
      const closed = Array.isArray(data) ? data[0] : data
      const diff = closed?.difference ?? 0
      toast(diff === 0 ? 'Caja cuadrada ✓' : `Caja cerrada — diferencia: ${fmt.currency(diff)}`, diff === 0 ? 'success' : 'warning')
      setCountedAmount('')
      setCloseNotes('')
      await load()
    }
    setClosing(false)
  }

  if (loading) {
    return (
      <>
        <Topbar title="Caja — Cierre de turno" />
        <div className="admin-content"><p className="text-muted text-sm">Cargando...</p></div>
      </>
    )
  }

  return (
    <>
      <Topbar title="Caja — Cierre de turno" />
      <div className="admin-content">
        {!session ? (
          <div className="card" style={{ maxWidth: 480 }}>
            <h4 style={{ marginBottom: 16 }}>🔓 Abrir caja</h4>
            <form className="flex-col gap-12" onSubmit={openRegister}>
              <div className="form-group">
                <label className="form-label">Monto de apertura</label>
                <input
                  type="number" step="0.01" min="0" className="form-control" required
                  placeholder="0.00" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={opening}>
                {opening ? 'Abriendo...' : '✓ Abrir caja'}
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="card mb-24" style={{ maxWidth: 560 }}>
              <h4 style={{ marginBottom: 12 }}>💵 Caja abierta</h4>
              <div className="perf-stat"><span>Apertura</span><span className="perf-stat__val">{fmt.currency(session.opening_amount)}</span></div>
              <div className="perf-stat"><span>Esperado ahora</span><span className="perf-stat__val">{expected !== null ? fmt.currency(expected) : '—'}</span></div>
              <div className="text-xs text-muted mt-4">Abierta {fmt.datetime(session.opened_at)}</div>
            </div>

            <div className="card mb-24" style={{ maxWidth: 560 }}>
              <h4 style={{ marginBottom: 16 }}>➕ Movimiento manual</h4>
              <form className="flex-col gap-12" onSubmit={addMovement}>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-control" value={movType} onChange={(e) => setMovType(e.target.value as 'in' | 'out')}>
                    <option value="out">Salida (retiro, compra menor)</option>
                    <option value="in">Entrada (fondo adicional)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Monto</label>
                  <input type="number" step="0.01" min="0.01" className="form-control" required value={movAmount} onChange={(e) => setMovAmount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Motivo</label>
                  <input type="text" className="form-control" required placeholder="Ej: compra de hielo" value={movReason} onChange={(e) => setMovReason(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-outline" disabled={addingMovement}>
                  {addingMovement ? 'Guardando...' : 'Registrar movimiento'}
                </button>
              </form>

              {movements.length > 0 && (
                <div className="flex-col gap-8 mt-16">
                  {movements.map((m) => (
                    <div key={m.id} className="text-sm" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{m.movement_type === 'in' ? '➕' : '➖'} {m.reason}</span>
                      <span>{fmt.currency(m.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card" style={{ maxWidth: 560 }}>
              <h4 style={{ marginBottom: 16 }}>🔒 Cerrar caja</h4>
              <form className="flex-col gap-12" onSubmit={closeRegister}>
                <div className="form-group">
                  <label className="form-label">Monto contado</label>
                  <input type="number" step="0.01" min="0" className="form-control" required value={countedAmount} onChange={(e) => setCountedAmount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notas (opcional)</label>
                  <input type="text" className="form-control" value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-danger" disabled={closing}>
                  {closing ? 'Cerrando...' : 'Cerrar caja'}
                </button>
              </form>
            </div>
          </>
        )}

        {history.length > 0 && (
          <div className="mt-24">
            <h4 className="mb-16">📋 Historial de cierres</h4>
            <div className="flex-col gap-8">
              {history.map((h) => (
                <div key={h.id} className="staff-card">
                  <div className="staff-card__info">
                    <div className="staff-card__name">{fmt.datetime(h.opened_at)} → {h.closed_at ? fmt.datetime(h.closed_at) : '—'}</div>
                    <div className="staff-card__meta">
                      Esperado {fmt.currency(h.expected_amount ?? 0)} · Contado {fmt.currency(h.counted_amount ?? 0)} ·{' '}
                      <span style={{ color: (h.difference ?? 0) === 0 ? 'var(--text)' : 'var(--orange)' }}>
                        Diferencia {fmt.currency(h.difference ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
