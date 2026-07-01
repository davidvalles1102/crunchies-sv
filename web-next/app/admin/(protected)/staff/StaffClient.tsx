'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'

type StaffMember = {
  id: string
  full_name: string
  role: 'kitchen' | 'delivery' | 'waiter'
  pin: string
  active: boolean
  last_login: string | null
  created_at: string
}

type OrderEvent = {
  id: string
  order_id: string
  event: string
  staff_id: string
  created_at: string
  metadata: Record<string, unknown>
}

type StaffPerf = {
  member: StaffMember
  sentToKitchen: number
  tablesClosed: number
  totalRevenue: number
  deliveriesCompleted: number
  avgDeliveryMinutes: number | null
}

const ROLE_CFG = {
  kitchen:  { label: '👨‍🍳 Cocina',   cls: 'role-badge-kitchen' },
  delivery: { label: '🛵 Delivery',  cls: 'role-badge-delivery' },
  waiter:   { label: '🪑 Mesero',    cls: 'role-badge-waiter' },
}

function genPin() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export default function StaffClient() {
  useRequireRole(['admin'])
  const supabase = createClient()
  const toast = useToast()

  const [tab, setTab] = useState<'team' | 'performance'>('team')
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [perf, setPerf] = useState<StaffPerf[]>([])
  const [perfDays, setPerfDays] = useState(7)

  // Create form
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<'kitchen' | 'delivery' | 'waiter'>('waiter')
  const [newPin, setNewPin] = useState(genPin())
  const [creating, setCreating] = useState(false)

  useEffect(() => { loadStaff() }, [])
  useEffect(() => { if (tab === 'performance') loadPerf() }, [tab, perfDays])

  async function loadStaff() {
    const { data } = await supabase
      .from('staff_members')
      .select('*')
      .order('role')
      .order('full_name')
    setStaff((data as StaffMember[]) || [])
  }

  async function loadPerf() {
    const since = new Date(Date.now() - perfDays * 86400000).toISOString()

    const { data: members } = await supabase.from('staff_members').select('*').eq('active', true)
    const { data: events } = await supabase
      .from('order_events')
      .select('*')
      .gte('created_at', since)

    const allMembers = (members as StaffMember[]) || []
    const allEvents = (events as OrderEvent[]) || []

    const computed: StaffPerf[] = allMembers.map((m) => {
      const myEvents = allEvents.filter((e) => e.staff_id === m.id)

      // Waiter metrics
      const sentToKitchen = myEvents.filter((e) => e.event === 'sent_to_kitchen').length
      const tablesClosed = myEvents.filter((e) => e.event === 'table_closed').length
      const totalRevenue = myEvents
        .filter((e) => e.event === 'paid')
        .reduce((s, e) => s + ((e.metadata?.total as number) || 0), 0)

      // Delivery metrics
      const deliveriesCompleted = myEvents.filter((e) => e.event === 'delivery_delivered').length
      const receivedMap: Record<string, string> = {}
      myEvents.filter((e) => e.event === 'delivery_received').forEach((e) => { receivedMap[e.order_id] = e.created_at })
      const deliveryTimes = myEvents
        .filter((e) => e.event === 'delivery_delivered' && receivedMap[e.order_id])
        .map((e) => (new Date(e.created_at).getTime() - new Date(receivedMap[e.order_id]).getTime()) / 60000)

      const avgDeliveryMinutes = deliveryTimes.length
        ? Math.round(deliveryTimes.reduce((s, t) => s + t, 0) / deliveryTimes.length)
        : null

      return { member: m, sentToKitchen, tablesClosed, totalRevenue, deliveriesCompleted, avgDeliveryMinutes }
    })

    setPerf(computed)
  }

  async function createStaff(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name || !newPin || newPin.length !== 6) { toast('Nombre y PIN de 6 dígitos requeridos', 'warning'); return }
    setCreating(true)
    const { error } = await supabase.from('staff_members').insert({ full_name: name, role: newRole, pin: newPin })
    if (error) {
      toast(error.message.includes('unique') ? 'Ese PIN ya existe, genera otro' : error.message, 'error')
    } else {
      toast(`${name} agregado ✓`)
      setNewName('')
      setNewPin(genPin())
      await loadStaff()
    }
    setCreating(false)
  }

  async function toggleActive(m: StaffMember) {
    const { error } = await supabase.from('staff_members').update({ active: !m.active }).eq('id', m.id)
    if (error) { toast('Error', 'error'); return }
    toast(m.active ? `${m.full_name} desactivado` : `${m.full_name} activado`)
    await loadStaff()
  }

  async function deleteStaff(m: StaffMember) {
    if (!confirm(`¿Eliminar a ${m.full_name}? Los logs de eventos se conservan.`)) return
    const { error } = await supabase.from('staff_members').delete().eq('id', m.id)
    if (error) { toast('Error al eliminar', 'error'); return }
    toast(`${m.full_name} eliminado`)
    await loadStaff()
  }

  return (
    <>
      <Topbar title="Staff — Portales PIN">
        <div style={{ display: 'flex', gap: 6 }}>
          {(['team', 'performance'] as const).map((t) => (
            <button
              key={t}
              className="btn btn-outline btn-sm"
              style={tab === t ? { borderColor: 'var(--green)', color: 'var(--green)' } : undefined}
              onClick={() => setTab(t)}
            >
              {t === 'team' ? '👥 Equipo' : '📈 Rendimiento'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a href="/portal/kitchen" target="_blank" className="btn btn-outline btn-sm">👨‍🍳 Portal Cocina</a>
          <a href="/portal/delivery" target="_blank" className="btn btn-outline btn-sm">🛵 Portal Delivery</a>
          <a href="/portal/waiter" target="_blank" className="btn btn-outline btn-sm">🪑 Portal Mesero</a>
        </div>
      </Topbar>

      <div className="admin-content">
        {tab === 'team' && (
          <>
            {/* Staff list */}
            <div className="flex-col gap-8 mb-24">
              {staff.length === 0 ? (
                <p className="text-muted text-sm">Sin staff registrado. Crea el primero abajo.</p>
              ) : (
                staff.map((m) => {
                  const cfg = ROLE_CFG[m.role]
                  return (
                    <div key={m.id} className={`staff-card${!m.active ? ' staff-card--inactive' : ''}`}>
                      <div className="staff-card__info">
                        <div className="staff-card__name">
                          {m.full_name}
                          {!m.active && <span className="badge badge-muted text-xs" style={{ marginLeft: 8 }}>Inactivo</span>}
                        </div>
                        <div className="staff-card__meta">
                          <span className={`badge text-xs ${cfg.cls}`} style={{ padding: '2px 8px', borderRadius: 4 }}>{cfg.label}</span>
                          {m.last_login && <span style={{ marginLeft: 8 }}>Último acceso: {fmt.datetime(m.last_login)}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="staff-card__pin">{m.pin}</div>
                        <div className="staff-card__actions">
                          <button className="btn btn-outline btn-sm" onClick={() => toggleActive(m)}>
                            {m.active ? 'Desactivar' : 'Activar'}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteStaff(m)}>✕</button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Create form */}
            <div className="card" style={{ maxWidth: 560 }}>
              <h4 style={{ marginBottom: 16 }}>➕ Nuevo miembro del staff</h4>
              <form className="flex-col gap-12" onSubmit={createStaff}>
                <div className="form-group">
                  <label className="form-label">Nombre completo</label>
                  <input type="text" className="form-control" required placeholder="Ej: María García" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Rol</label>
                  <select className="form-control" value={newRole} onChange={(e) => setNewRole(e.target.value as typeof newRole)}>
                    <option value="waiter">🪑 Mesero</option>
                    <option value="kitchen">👨‍🍳 Cocina</option>
                    <option value="delivery">🛵 Delivery</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">PIN de 6 dígitos</label>
                  <div className="flex gap-8">
                    <input
                      type="text" className="form-control" required
                      pattern="\d{6}" maxLength={6} placeholder="000000"
                      style={{ fontFamily: 'monospace', fontSize: '1.2rem', letterSpacing: '.2em', maxWidth: 140 }}
                      value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewPin(genPin())}>🎲 Generar</button>
                  </div>
                  <div className="text-xs text-muted mt-4">El PIN debe ser único entre todo el staff.</div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Guardando...' : '✓ Crear miembro'}
                </button>
              </form>
            </div>
          </>
        )}

        {tab === 'performance' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
              <span className="text-sm text-muted">Período:</span>
              {[7, 14, 30].map((d) => (
                <button key={d} className={`btn btn-outline btn-sm${perfDays === d ? ' active' : ''}`}
                  style={perfDays === d ? { borderColor: 'var(--green)', color: 'var(--green)' } : undefined}
                  onClick={() => setPerfDays(d)}>
                  {d} días
                </button>
              ))}
            </div>

            {perf.length === 0 ? (
              <p className="text-muted text-sm">Sin datos de rendimiento aún.</p>
            ) : (
              <div className="perf-grid">
                {perf.map(({ member, sentToKitchen, tablesClosed, totalRevenue, deliveriesCompleted, avgDeliveryMinutes }) => {
                  const cfg = ROLE_CFG[member.role]
                  return (
                    <div key={member.id} className="perf-card">
                      <div className="perf-card__name">
                        {member.full_name}
                        <span className={`badge text-xs ${cfg.cls}`} style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4 }}>{cfg.label}</span>
                      </div>

                      {member.role === 'waiter' && (
                        <>
                          <div className="perf-stat"><span>Comandas enviadas</span><span className="perf-stat__val">{sentToKitchen}</span></div>
                          <div className="perf-stat"><span>Mesas cerradas</span><span className="perf-stat__val">{tablesClosed}</span></div>
                          <div className="perf-stat"><span>Revenue manejado</span><span className="perf-stat__val">{fmt.currency(totalRevenue)}</span></div>
                        </>
                      )}
                      {member.role === 'delivery' && (
                        <>
                          <div className="perf-stat"><span>Entregas completadas</span><span className="perf-stat__val">{deliveriesCompleted}</span></div>
                          <div className="perf-stat">
                            <span>Tiempo prom. entrega</span>
                            <span className="perf-stat__val">{avgDeliveryMinutes !== null ? `${avgDeliveryMinutes} min` : '—'}</span>
                          </div>
                        </>
                      )}
                      {member.role === 'kitchen' && (
                        <div className="text-xs text-muted">
                          El rendimiento de cocina se mide globalmente desde el panel de reportes.
                        </div>
                      )}

                      {member.last_login && (
                        <div className="text-xs text-muted" style={{ marginTop: 8 }}>Último acceso: {fmt.datetime(member.last_login)}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
