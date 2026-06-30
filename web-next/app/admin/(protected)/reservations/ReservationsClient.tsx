'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'
import type { Reservation, RestaurantTable } from '@/lib/types'

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: string }> = {
  pending:   { label: 'Pendiente',  cls: 'badge-amber',  icon: '🕐' },
  confirmed: { label: 'Confirmada', cls: 'badge-green',  icon: '✅' },
  seated:    { label: 'En Mesa',    cls: 'badge-info',   icon: '🪑' },
  cancelled: { label: 'Cancelada',  cls: 'badge-danger', icon: '❌' },
  no_show:   { label: 'No Show',    cls: 'badge-muted',  icon: '👻' },
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Reservación confirmada ✅',
  seated: 'Cliente sentado 🪑',
  cancelled: 'Reservación cancelada',
  no_show: 'Marcada como No Show',
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function ReservationsClient() {
  useRequireRole(['admin', 'waiter'])
  const supabase = createClient()
  const toast = useToast()

  const [filterDate, setFilterDate] = useState(todayStr)
  const [filterStatus, setFilterStatus] = useState('')
  const [allReservations, setAllReservations] = useState<Reservation[]>([])
  const [availableTables, setAvailableTables] = useState<RestaurantTable[]>([])

  const [detailReservation, setDetailReservation] = useState<Reservation | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignTableId, setAssignTableId] = useState('')
  const pendingAssignIdRef = useRef<string | null>(null)

  const [dotSubscribed, setDotSubscribed] = useState(false)
  const [dotFlash, setDotFlash] = useState(false)

  const filterDateRef = useRef(filterDate)
  useEffect(() => { filterDateRef.current = filterDate }, [filterDate])

  async function loadReservations() {
    let query = supabase
      .from('reservations')
      .select('*, profiles(full_name, phone, loyalty_points), restaurant_tables(number, location, capacity)')
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true })

    if (filterDateRef.current) query = query.eq('reservation_date', filterDateRef.current)

    const { data, error } = await query
    if (error) { toast('Error al cargar reservaciones', 'error'); return }
    setAllReservations((data as Reservation[]) || [])
  }

  async function loadTables() {
    const { data } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('status', 'available')
      .order('number')
    setAvailableTables((data as RestaurantTable[]) || [])
  }

  async function updateStatus(id: string, newStatus: string) {
    const { error } = await supabase.from('reservations').update({ status: newStatus }).eq('id', id)
    if (error) { toast('Error al actualizar', 'error'); return }
    toast(STATUS_LABELS[newStatus] ?? 'Actualizado', newStatus === 'cancelled' ? 'warning' : 'success')
    await loadReservations()
  }

  function openAssignTable(id: string) {
    pendingAssignIdRef.current = id
    setAssignTableId('')
    setDetailReservation(null)
    setAssignOpen(true)
  }

  async function confirmAssignTable() {
    const pendingId = pendingAssignIdRef.current
    if (!pendingId) return

    const { error } = await supabase
      .from('reservations')
      .update({ table_id: assignTableId || null })
      .eq('id', pendingId)

    if (error) { toast('Error al asignar mesa', 'error'); return }
    toast('Mesa asignada correctamente')
    setAssignOpen(false)
    pendingAssignIdRef.current = null
    await loadReservations()
  }

  useEffect(() => {
    ;(async () => { await loadReservations() })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate])

  useEffect(() => {
    ;(async () => { await loadTables() })()

    const channel = supabase
      .channel('admin-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, async (payload) => {
        setDotFlash(true)
        setTimeout(() => setDotFlash(false), 2000)

        if (payload.eventType === 'INSERT') toast('Nueva reservación recibida 📅', 'info')
        if (payload.eventType === 'UPDATE' && (payload.new as { status?: string } | null)?.status === 'cancelled') {
          toast('Un cliente canceló su reservación ❌', 'warning')
        }

        await loadReservations()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setDotSubscribed(true)
      })

    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const count = (s: string) => allReservations.filter((r) => r.status === s).length
  const filtered = filterStatus ? allReservations.filter((r) => r.status === filterStatus) : allReservations

  return (
    <>
      <Topbar title="Reservaciones">
        <div
          className={`realtime-dot${dotFlash ? ' dot--active' : ''}`}
          style={dotSubscribed ? { opacity: 1 } : undefined}
          title="Actualizaciones en tiempo real"
        >
          <span className="dot" /> En vivo
        </div>
        <input type="date" className="form-control" style={{ width: 160 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        <select className="form-control" style={{ width: 160 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="confirmed">Confirmada</option>
          <option value="seated">En Mesa</option>
          <option value="cancelled">Cancelada</option>
          <option value="no_show">No Show</option>
        </select>
      </Topbar>

      <div className="admin-content">
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
          <div className="stat-card stat-green">
            <div className="stat-label">Total Hoy</div>
            <div className="stat-value">{allReservations.length}</div>
          </div>
          <div className="stat-card stat-amber">
            <div className="stat-label">Pendientes</div>
            <div className="stat-value">{count('pending')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Confirmadas</div>
            <div className="stat-value">{count('confirmed')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">En Mesa</div>
            <div className="stat-value">{count('seated')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Canceladas</div>
            <div className="stat-value">{count('cancelled')}</div>
          </div>
        </div>

        <div className="card mt-24">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Personas</th>
                  <th>Mesa</th>
                  <th>Zona</th>
                  <th>Notas</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-muted text-center" style={{ padding: 40 }}>Sin reservaciones para esta fecha / filtro.</td></tr>
                ) : (
                  filtered.map((r) => {
                    const sc = STATUS_CONFIG[r.status] ?? { label: r.status, cls: 'badge-muted', icon: '' }
                    const p = r.profiles
                    const tb = r.restaurant_tables
                    return (
                      <tr key={r.id} style={r.status === 'cancelled' ? { opacity: 0.6 } : undefined}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p?.full_name || '(Sin nombre)'}</div>
                          {p && p.loyalty_points > 0 ? <span className="badge badge-amber text-xs">{p.loyalty_points} pts</span> : null}
                        </td>
                        <td>{p?.phone || <span className="text-muted">—</span>}</td>
                        <td>{fmt.date(r.reservation_date)}</td>
                        <td style={{ fontWeight: 600 }}>{r.reservation_time.slice(0, 5)}</td>
                        <td style={{ textAlign: 'center' }}>{r.party_size}</td>
                        <td>{tb ? `Mesa ${tb.number}` : <span className="text-muted">Sin asignar</span>}</td>
                        <td>{tb?.location ?? <span className="text-muted">—</span>}</td>
                        <td className="text-sm text-muted" style={{ maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.notes || '—'}
                        </td>
                        <td><span className={`badge ${sc.cls}`}>{sc.icon} {sc.label}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="btn btn-outline btn-sm" onClick={() => setDetailReservation(r)}>Ver</button>
                            {r.status === 'pending' && (
                              <button className="btn btn-primary btn-sm" onClick={() => updateStatus(r.id, 'confirmed')}>✓ Confirmar</button>
                            )}
                            {r.status === 'confirmed' && (
                              <button className="btn btn-amber btn-sm" onClick={() => updateStatus(r.id, 'seated')}>🪑 Sentar</button>
                            )}
                            {['pending', 'confirmed'].includes(r.status) && (
                              <button className="btn btn-danger btn-sm" onClick={() => updateStatus(r.id, 'cancelled')}>✕</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={`modal-backdrop${detailReservation ? '' : ' hidden'}`}>
        <div className="modal" style={{ maxWidth: 580 }}>
          <div className="modal-header">
            <h3>Detalle de Reservación</h3>
            <button className="modal-close" onClick={() => setDetailReservation(null)}>✕</button>
          </div>
          {detailReservation && (() => {
            const r = detailReservation
            const sc = STATUS_CONFIG[r.status] ?? { label: r.status, cls: 'badge-muted', icon: '' }
            const p = r.profiles
            const tb = r.restaurant_tables
            return (
              <>
                <div className="modal-body">
                  <div className="flex-col gap-16">
                    <div className="card" style={{ borderColor: 'var(--green-dim)' }}>
                      <h4 className="mb-12" style={{ color: 'var(--green)' }}>👤 Información del Cliente</h4>
                      <div className="flex-col gap-8 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted">Nombre</span>
                          <span style={{ fontWeight: 600 }}>{p?.full_name || 'Sin nombre'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Teléfono</span>
                          <span>{p?.phone || '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Puntos de lealtad</span>
                          <span className="neon-amber" style={{ fontWeight: 700 }}>{p?.loyalty_points ?? 0} pts</span>
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <h4 className="mb-12" style={{ color: 'var(--amber)' }}>📅 Detalle de la Reservación</h4>
                      <div className="flex-col gap-8 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted">Fecha</span>
                          <span style={{ fontWeight: 600 }}>{fmt.date(r.reservation_date)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Hora</span>
                          <span style={{ fontWeight: 600 }}>{r.reservation_time.slice(0, 5)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Personas</span>
                          <span>{r.party_size}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Mesa asignada</span>
                          <span>{tb ? `Mesa ${tb.number} (${tb.location})` : 'Sin asignar'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Estado</span>
                          <span className={`badge ${sc.cls}`}>{sc.icon} {sc.label}</span>
                        </div>
                        {r.notes && (
                          <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                            <div className="text-muted" style={{ marginBottom: 4 }}>Notas del cliente:</div>
                            <div style={{ color: 'var(--amber)' }}>&quot;{r.notes}&quot;</div>
                          </div>
                        )}
                        <div className="flex justify-between" style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                          <span className="text-muted">Creada</span>
                          <span>{fmt.datetime(r.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline" onClick={() => setDetailReservation(null)}>Cerrar</button>
                  {!tb && <button className="btn btn-amber" onClick={() => openAssignTable(r.id)}>🪑 Asignar Mesa</button>}
                  {r.status === 'pending' && (
                    <button className="btn btn-primary" onClick={() => { updateStatus(r.id, 'confirmed'); setDetailReservation(null) }}>✓ Confirmar</button>
                  )}
                  {r.status === 'confirmed' && (
                    <button className="btn btn-amber" onClick={() => { updateStatus(r.id, 'seated'); setDetailReservation(null) }}>🪑 Sentar</button>
                  )}
                  {['pending', 'confirmed'].includes(r.status) && (
                    <button className="btn btn-danger" onClick={() => { updateStatus(r.id, 'no_show'); setDetailReservation(null) }}>👻 No Show</button>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      </div>

      <div className={`modal-backdrop${assignOpen ? '' : ' hidden'}`}>
        <div className="modal" style={{ maxWidth: 400 }}>
          <div className="modal-header">
            <h3>Asignar Mesa</h3>
            <button className="modal-close" onClick={() => setAssignOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Mesa</label>
              <select className="form-control" value={assignTableId} onChange={(e) => setAssignTableId(e.target.value)}>
                <option value="">Sin asignar</option>
                {availableTables.map((t) => (
                  <option key={t.id} value={t.id}>Mesa {t.number} — {t.location} (cap. {t.capacity})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={() => setAssignOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmAssignTable}>Confirmar y Asignar</button>
          </div>
        </div>
      </div>
    </>
  )
}
