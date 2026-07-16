'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCustomerSession } from '@/lib/supabase/auth'
import { resolveRootTenantId } from '@/lib/tenant'
import { useToast } from '../components/ToastProvider'
import { useConfirm } from '@/app/components/ConfirmProvider'
import { fmt } from '@/lib/format'
import { svToday } from '@/lib/svDate'
import type { User } from '@supabase/supabase-js'

type Reservation = {
  id: string
  reservation_date: string
  reservation_time: string
  party_size: number
  notes: string | null
  status: 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show'
  restaurant_tables: { number: number; location: string } | null
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Pendiente',  cls: 'badge-amber' },
  confirmed: { label: 'Confirmada', cls: 'badge-primary' },
  seated:    { label: 'En Mesa',    cls: 'badge-info' },
  cancelled: { label: 'Cancelada',  cls: 'badge-danger' },
  no_show:   { label: 'No Show',    cls: 'badge-muted' },
}

const ZONES = [
  { value: '', label: 'Sin preferencia' },
  { value: 'interior', label: 'Interior' },
  { value: 'terraza', label: 'Terraza' },
  { value: 'barra', label: 'Barra' },
  { value: 'privado', label: 'Salón Privado' },
]

const TIMES = ['12:00', '13:00', '14:00', '15:00', '18:00', '19:00', '20:00', '21:00']

export default function ReservationsClient() {
  const supabase = createClient()
  const toast = useToast()
  const confirm = useConfirm()

  const [loadingAuth, setLoadingAuth] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [reservations, setReservations] = useState<Reservation[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [party, setParty] = useState('')
  const [zone, setZone] = useState('')
  const [notes, setNotes] = useState('')

  const todayStr = svToday()

  const loadMyReservations = useCallback(async (userId: string, tid: string | null) => {
    // Sin el filtro de tenant_id, un cliente con reservas en mas de un
    // negocio de la plataforma veria TODAS mezcladas aqui, aunque este
    // navegando el sitio de un solo restaurante — reservations.customer_id
    // apunta a profiles, que es global, no por-tenant (mismo motivo que
    // customer_credit_accounts vive separado de profiles).
    let query = supabase
      .from('reservations')
      .select('*, restaurant_tables(number, location)')
      .eq('customer_id', userId)
      .order('reservation_date', { ascending: false })
      .limit(10)
    if (tid) query = query.eq('tenant_id', tid)
    const { data } = await query
    setReservations((data as Reservation[]) ?? [])
  }, [supabase])

  useEffect(() => {
    ;(async () => {
      const tid = await resolveRootTenantId(supabase)
      setTenantId(tid)
      const session = await getCustomerSession()
      setUser(session?.user ?? null)
      setLoadingAuth(false)
      if (session?.user) await loadMyReservations(session.user.id, tid)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMyReservations])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setMsg(null)
    setSubmitting(true)

    // restaurant_tables.status es ocupacion EN VIVO (para el POS de hoy), no
    // dice nada sobre si la mesa esta libre en la fecha/hora futura que se
    // esta reservando — una mesa "ocupada" ahorita puede estar libre el
    // viernes a las 7pm, y una "disponible" ahorita puede ya tener 3
    // reservas para ese mismo horario. Se calcula disponibilidad real
    // contra reservations en vez de contra el status en vivo.
    let reservedQuery = supabase
      .from('reservations')
      .select('table_id')
      .eq('reservation_date', date)
      .eq('reservation_time', time)
      .in('status', ['pending', 'confirmed', 'seated'])
      .not('table_id', 'is', null)
    if (tenantId) reservedQuery = reservedQuery.eq('tenant_id', tenantId)
    const { data: reservedRows } = await reservedQuery
    const reservedIds = new Set((reservedRows ?? []).map((r) => r.table_id as string))

    let query = supabase
      .from('restaurant_tables')
      .select('id')
      .neq('status', 'maintenance')
      .gte('capacity', parseInt(party))
      .order('capacity')
    if (tenantId) query = query.eq('tenant_id', tenantId)
    if (zone) query = query.eq('location', zone)

    const { data: candidateTables } = await query
    const tableId = (candidateTables ?? []).find((t) => !reservedIds.has(t.id))?.id ?? null

    const { error } = await supabase.from('reservations').insert({
      customer_id: user.id,
      table_id: tableId,
      reservation_date: date,
      reservation_time: time,
      party_size: parseInt(party),
      notes: notes.trim() || null,
      status: 'pending',
      tenant_id: tenantId,
    })

    setSubmitting(false)

    if (error) {
      setMsg({ text: 'Error al guardar reservación: ' + error.message, type: 'error' })
      return
    }

    setMsg({ text: '¡Reservación enviada! Te confirmaremos pronto.', type: 'success' })
    setDate(''); setTime(''); setParty(''); setZone(''); setNotes('')
    await loadMyReservations(user.id, tenantId)
  }

  const cancelReserv = async (id: string) => {
    if (!user) return
    if (!await confirm('¿Cancelar esta reservación?', { title: 'Cancelar Reservación', confirmLabel: 'Cancelar' })) return
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('customer_id', user.id)

    if (error) { toast('Error al cancelar', 'error'); return }
    toast('Reservación cancelada')
    await loadMyReservations(user.id, tenantId)
  }

  return (
    <div className="reserv-layout">
      <div className="card reserv-form-card">
        <h2 className="mb-20">Nueva Reservación</h2>

        {!loadingAuth && !user && (
          <div className="auth-gate">
            <p className="text-secondary">Para hacer una reservación debes tener una cuenta.</p>
            <Link href="/auth" className="btn btn-primary mt-16">Ingresar / Registrarse</Link>
          </div>
        )}

        {user && (
          <form className="flex-col gap-16" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="reserv-date">Fecha</label>
                <input
                  id="reserv-date" type="date" className="form-control" required
                  min={todayStr} value={date} onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reserv-time">Hora</label>
                <select id="reserv-time" className="form-control" required value={time} onChange={(e) => setTime(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {TIMES.map((t) => (
                    <option key={t} value={t}>
                      {new Date(`2000-01-01T${t}:00`).toLocaleTimeString('es-SV', { hour: 'numeric', minute: '2-digit' })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="reserv-party">N.º de personas</label>
                <select id="reserv-party" className="form-control" required value={party} onChange={(e) => setParty(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n === 9 ? '9 o más' : `${n} persona${n > 1 ? 's' : ''}`}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reserv-zone">Zona preferida</label>
                <select id="reserv-zone" className="form-control" value={zone} onChange={(e) => setZone(e.target.value)}>
                  {ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reserv-notes">Notas especiales (alergias, celebraciones, etc.)</label>
              <textarea
                id="reserv-notes" className="form-control" rows={3} placeholder="Ej: Cumpleaños, alergia a mariscos..."
                value={notes} onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

            <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
              {submitting ? 'Guardando...' : 'Confirmar Reservación'}
            </button>
          </form>
        )}
      </div>

      <div className="card reserv-list-card">
        <h2 className="mb-16">Mis Reservaciones</h2>
        <div>
          {reservations === null ? (
            <p className="text-muted text-sm">Cargando...</p>
          ) : reservations.length === 0 ? (
            <p className="text-muted text-sm">Sin reservaciones aún.</p>
          ) : (
            reservations.map((r) => {
              const s = STATUS_LABELS[r.status] ?? { label: r.status, cls: 'badge-muted' }
              return (
                <div key={r.id} className="reservation-item">
                  <div>
                    <div style={{ fontWeight: 600 }}>{fmt.date(r.reservation_date)}</div>
                    <div className="reservation-item__meta">
                      {r.reservation_time.slice(0, 5)} · {r.party_size} personas
                      {r.restaurant_tables ? ` · Mesa ${r.restaurant_tables.number}` : ''}
                    </div>
                    {r.notes && <div className="text-xs text-muted mt-4">{r.notes}</div>}
                  </div>
                  <div className="flex-col items-center gap-8">
                    <span className={`badge ${s.cls}`}>{s.label}</span>
                    {r.status === 'pending' && (
                      <button className="btn btn-danger btn-sm" onClick={() => cancelReserv(r.id)}>Cancelar</button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
