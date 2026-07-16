'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useAdmin, useRequireRole } from '../../AdminContext'
import Modal from '@/app/components/Modal'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'

const INACTIVE_DAYS = 30
const NEW_DAYS = 7
const VIP_POINTS = 500

type Customer = {
  id: string
  full_name: string | null
  phone: string | null
  loyalty_points: number
  created_at: string
  visits: number
  total_spent: number
  last_visit: string | null
  is_vip: boolean
  is_inactive: boolean
  is_new: boolean
  days_since_last_visit: number | null
}

type LoyaltyTx = { id: string; type: 'earned' | 'redeemed'; points: number; created_at: string }
type ReservationRow = { id: string; reservation_date: string; reservation_time: string; status: string }
type OrderHistoryRow = {
  id: string
  order_type: string
  total: number
  created_at: string
  order_items: { item_name: string; quantity: number; item_price: number }[]
}
type CustomerNote = { id: string; note: string; created_at: string; profiles: { full_name: string | null } | null }

type Filter = 'all' | 'vip' | 'inactive' | 'new'

export default function CustomersClient() {
  useRequireRole(['admin'])
  const { tenant } = useAdmin()
  const supabase = createClient()
  const toast = useToast()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const [selected, setSelected] = useState<Customer | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loyalty, setLoyalty] = useState<LoyaltyTx[]>([])
  const [reservations, setReservations] = useState<ReservationRow[]>([])
  const [orderHistory, setOrderHistory] = useState<OrderHistoryRow[]>([])
  const [notes, setNotes] = useState<CustomerNote[]>([])

  const [newNote, setNewNote] = useState('')
  const [pointsAdjust, setPointsAdjust] = useState('')
  const [pointsNote, setPointsNote] = useState('')
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false)

  const loadCustomers = async () => {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .or('role.eq.customer,role.is.null')
      .order('loyalty_points', { ascending: false })

    const { data: orders } = await supabase
      .from('orders')
      .select('customer_id, total, created_at')
      .in('status', ['paid', 'delivered'])
      .not('customer_id', 'is', null)

    const visitMap: Record<string, number> = {}
    const spentMap: Record<string, number> = {}
    const lastVisitMap: Record<string, string> = {}
    orders?.forEach((o) => {
      const cid = o.customer_id as string
      visitMap[cid] = (visitMap[cid] || 0) + 1
      spentMap[cid] = (spentMap[cid] || 0) + Number(o.total)
      if (!lastVisitMap[cid] || o.created_at > lastVisitMap[cid]) lastVisitMap[cid] = o.created_at
    })

    const now = Date.now()
    const list: Customer[] = (profiles || []).map((p) => {
      const lastVisit = lastVisitMap[p.id] || null
      const daysSinceLast = lastVisit ? Math.floor((now - new Date(lastVisit).getTime()) / 86400_000) : null
      const daysSinceSignup = Math.floor((now - new Date(p.created_at).getTime()) / 86400_000)
      return {
        id: p.id,
        full_name: p.full_name,
        phone: p.phone,
        loyalty_points: p.loyalty_points || 0,
        created_at: p.created_at,
        visits: visitMap[p.id] || 0,
        total_spent: spentMap[p.id] || 0,
        last_visit: lastVisit,
        is_vip: (p.loyalty_points || 0) >= VIP_POINTS,
        is_inactive: lastVisit !== null && (daysSinceLast as number) >= INACTIVE_DAYS,
        is_new: daysSinceSignup <= NEW_DAYS,
        days_since_last_visit: daysSinceLast,
      }
    })

    setCustomers(list)
  }

  useEffect(() => {
    ;(async () => {
      await loadCustomers()
      const { data: settings } = await supabase.from('tenant_settings').select('loyalty_enabled')
        .eq('tenant_id', tenant.tenant_id).maybeSingle<{ loyalty_enabled: boolean }>()
      setLoyaltyEnabled(!!settings?.loyalty_enabled)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPoints = customers.reduce((s, c) => s + (c.loyalty_points || 0), 0)
  const vipCount = customers.filter((c) => c.is_vip).length
  const inactiveCount = customers.filter((c) => c.is_inactive).length

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    const matchQuery = (c.full_name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
    const matchFilter = filter === 'all' ? true
      : filter === 'vip' ? c.is_vip
      : filter === 'inactive' ? c.is_inactive
      : filter === 'new' ? c.is_new
      : true
    return matchQuery && matchFilter
  })

  const openCustomer = async (c: Customer) => {
    setSelected(c)
    setDetailLoading(true)
    setNewNote(''); setPointsAdjust(''); setPointsNote('')

    const [{ data: loyaltyData }, { data: reservationsData }, { data: orderHistoryData }, { data: notesData }] = await Promise.all([
      supabase.from('loyalty_transactions').select('*').eq('customer_id', c.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('reservations').select('*').eq('customer_id', c.id).order('reservation_date', { ascending: false }).limit(5),
      supabase.from('orders').select('*, order_items(item_name, quantity, item_price)').eq('customer_id', c.id).in('status', ['paid', 'delivered']).order('created_at', { ascending: false }).limit(15),
      supabase.from('customer_notes').select('*, profiles!customer_notes_created_by_fkey(full_name)').eq('customer_id', c.id).order('created_at', { ascending: false }),
    ])

    setLoyalty((loyaltyData as LoyaltyTx[]) ?? [])
    setReservations((reservationsData as ReservationRow[]) ?? [])
    setOrderHistory((orderHistoryData as OrderHistoryRow[]) ?? [])
    setNotes((notesData as CustomerNote[]) ?? [])
    setDetailLoading(false)
  }

  const favorite = (() => {
    const counts: Record<string, number> = {}
    orderHistory.forEach((o) => o.order_items?.forEach((i) => { counts[i.item_name] = (counts[i.item_name] || 0) + i.quantity }))
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return sorted[0] ?? null
  })()

  const daysSinceLast = selected?.days_since_last_visit ?? null

  const addCustomerNote = async () => {
    if (!selected) return
    const note = newNote.trim()
    if (!note) { toast('Escribe una nota', 'warning'); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('customer_notes').insert({ customer_id: selected.id, note, created_by: user.id, tenant_id: tenant.tenant_id })
    if (error) { toast('Error al guardar la nota', 'error'); return }

    toast('Nota agregada')
    setNewNote('')
    await openCustomer(selected)
  }

  const applyPointsAdjust = async () => {
    if (!selected) return
    const pts = parseInt(pointsAdjust)
    if (!pts || isNaN(pts)) { toast('Ingresa un valor válido', 'warning'); return }

    // UPDATE atomico (ver adjust_loyalty_points) en vez de calcular el
    // balance aca con selected.loyalty_points, que puede estar desfasado
    // si el cliente ya gasto/gano puntos en otra caja mientras este panel
    // estaba abierto.
    const { data: newBalance, error } = await supabase.rpc('adjust_loyalty_points', {
      p_customer_id: selected.id, p_delta: pts, p_tenant_id: tenant.tenant_id,
    })
    if (error) { toast('Error', 'error'); return }

    toast(`Puntos ${pts > 0 ? 'agregados' : 'descontados'} correctamente`)
    await loadCustomers()
    await openCustomer({ ...selected, loyalty_points: newBalance as number })
  }

  const exportCSV = () => {
    const header = ['Nombre', 'Teléfono', ...(loyaltyEnabled ? ['Puntos'] : []), 'Visitas', 'Total Gastado', 'Última Visita', 'Estado', 'Registro']
    const rows: (string | number)[][] = [header]
    customers.forEach((c) => {
      const estado = (loyaltyEnabled && c.is_vip) ? 'VIP' : c.is_inactive ? 'Inactivo' : c.is_new ? 'Nuevo' : ''
      rows.push([
        c.full_name || '', c.phone || '',
        ...(loyaltyEnabled ? [c.loyalty_points || 0] : []),
        c.visits, c.total_spent.toFixed(2), c.last_visit ? fmt.date(c.last_visit) : '', estado, fmt.date(c.created_at),
      ])
    })
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    link.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  return (
    <>
      <Topbar title="Clientes">
        <input type="text" className="form-control" placeholder="Buscar por nombre o correo..." style={{ width: 280 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-outline btn-sm" onClick={exportCSV}>↓ Exportar</button>
      </Topbar>

      <div className="admin-content">
        <div className="stats-grid" style={{ gridTemplateColumns: loyaltyEnabled ? 'repeat(4,1fr)' : 'repeat(2,1fr)' }}>
          <div className="stat-card stat-green">
            <div className="stat-label">Total Clientes</div>
            <div className="stat-value">{customers.length}</div>
          </div>
          {loyaltyEnabled && (
            <>
              <div className="stat-card stat-amber">
                <div className="stat-label">Puntos en Circulación</div>
                <div className="stat-value">{totalPoints.toLocaleString()}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Clientes VIP (+500 pts)</div>
                <div className="stat-value">{vipCount}</div>
              </div>
            </>
          )}
          <div className="stat-card stat-danger">
            <div className="stat-label">Inactivos (30+ días)</div>
            <div className="stat-value">{inactiveCount}</div>
          </div>
        </div>

        <div className="category-tabs mt-24">
          <button className={`cat-tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>Todos</button>
          {loyaltyEnabled && (
            <button className={`cat-tab${filter === 'vip' ? ' active' : ''}`} onClick={() => setFilter('vip')}>⭐ VIP</button>
          )}
          <button className={`cat-tab${filter === 'inactive' ? ' active' : ''}`} onClick={() => setFilter('inactive')}>🔴 Inactivos</button>
          <button className={`cat-tab${filter === 'new' ? ' active' : ''}`} onClick={() => setFilter('new')}>🆕 Nuevos</button>
        </div>

        <div className="card mt-24">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th><th>Teléfono</th>{loyaltyEnabled && <th>Puntos</th>}<th>Visitas</th><th>Gasto Total</th><th>Última visita</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={loyaltyEnabled ? 7 : 6} className="text-muted text-center" style={{ padding: 32 }}>Sin clientes encontrados.</td></tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.full_name || '(Sin nombre)'}</div>
                        <div className="flex gap-4 mt-4">
                          {loyaltyEnabled && c.is_vip && <span className="badge badge-amber text-xs">VIP</span>}
                          {c.is_inactive && <span className="badge badge-danger text-xs">Inactivo</span>}
                          {c.is_new && <span className="badge badge-info text-xs">Nuevo</span>}
                        </div>
                      </td>
                      <td>{c.phone || '—'}</td>
                      {loyaltyEnabled && <td><span className="neon-green" style={{ fontWeight: 700 }}>{c.loyalty_points || 0}</span> <span className="text-muted text-xs">pts</span></td>}
                      <td>{c.visits}</td>
                      <td>{fmt.currency(c.total_spent)}</td>
                      <td>{c.last_visit ? fmt.date(c.last_visit) : '—'}</td>
                      <td><button className="btn btn-outline btn-sm" onClick={() => openCustomer(c)}>Ver</button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.full_name || 'Cliente'} maxWidth={580}>
          <div className="modal-header">
            <h3>{selected?.full_name || 'Cliente'}</h3>
            <button className="modal-close" aria-label="Cerrar" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div className="modal-body">
            {detailLoading ? (
              <p className="text-muted text-sm">Cargando...</p>
            ) : (
              <div>
                <div className="stats-grid" style={{ gridTemplateColumns: loyaltyEnabled ? 'repeat(4,1fr)' : 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                  {loyaltyEnabled && (
                    <div className="stat-card" style={{ padding: 12 }}><div className="stat-label">Puntos</div><div className="stat-value" style={{ fontSize: '1.4rem', color: 'var(--orange)' }}>{selected?.loyalty_points ?? 0}</div></div>
                  )}
                  <div className="stat-card" style={{ padding: 12 }}><div className="stat-label">Visitas</div><div className="stat-value" style={{ fontSize: '1.4rem' }}>{selected?.visits ?? 0}</div></div>
                  <div className="stat-card" style={{ padding: 12 }}><div className="stat-label">Gastado</div><div className="stat-value" style={{ fontSize: '1.4rem', color: 'var(--amber)' }}>{fmt.currency(selected?.total_spent ?? 0)}</div></div>
                  <div className="stat-card" style={{ padding: 12 }}><div className="stat-label">Última visita</div><div className="stat-value" style={{ fontSize: '1.4rem' }}>{daysSinceLast === null ? '—' : `${daysSinceLast}d`}</div></div>
                </div>

                {favorite && (
                  <div className="alert" style={{ background: 'var(--amber-dim)', borderColor: 'var(--amber-dim)', color: 'var(--amber)', marginBottom: 16 }}>
                    ⭐ Plato favorito: <strong>{favorite[0]}</strong> ({favorite[1]}x pedido)
                  </div>
                )}

                <h4 style={{ marginBottom: 8 }}>Historial de Pedidos</h4>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {orderHistory.length === 0 ? (
                    <p className="text-muted text-sm">Sin pedidos registrados.</p>
                  ) : (
                    orderHistory.map((o) => {
                      const typeLabel = o.order_type === 'delivery' ? '🛵' : o.order_type === 'takeout' ? '🥡' : '🍽️'
                      const itemsText = (o.order_items || []).map((i) => `${i.quantity}× ${i.item_name}`).join(', ')
                      return (
                        <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.85rem' }}>
                          <div className="flex justify-between"><span>{typeLabel} {fmt.date(o.created_at)}</span><span style={{ fontWeight: 700 }}>{fmt.currency(o.total)}</span></div>
                          <div className="text-muted text-xs mt-4">{itemsText || 'Sin items'}</div>
                        </div>
                      )
                    })
                  )}
                </div>

                {loyaltyEnabled && (
                  <>
                    <h4 style={{ margin: '16px 0 8px' }}>Historial de Puntos</h4>
                    {loyalty.length === 0 ? (
                      <p className="text-muted text-sm">Sin movimientos.</p>
                    ) : (
                      loyalty.map((l) => (
                        <div key={l.id} className={`loyalty-item ${l.type}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.85rem' }}>
                          <span>{fmt.date(l.created_at)}</span>
                          <span style={{ fontWeight: 700, color: l.type === 'earned' ? 'var(--orange)' : 'var(--amber)' }}>{l.type === 'earned' ? '+' : '-'}{l.points} pts</span>
                        </div>
                      ))
                    )}
                  </>
                )}

                <h4 style={{ margin: '16px 0 8px' }}>Reservaciones</h4>
                {reservations.length === 0 ? (
                  <p className="text-muted text-sm">Sin reservaciones.</p>
                ) : (
                  reservations.map((r) => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.85rem' }}>
                      <span>{fmt.date(r.reservation_date)} {r.reservation_time.slice(0, 5)}</span>
                      <span className={`badge badge-${r.status === 'confirmed' ? 'green' : r.status === 'cancelled' ? 'danger' : 'amber'}`}>{r.status}</span>
                    </div>
                  ))
                )}

                <h4 style={{ margin: '16px 0 8px' }}>📝 Notas (alergias, preferencias, incidentes)</h4>
                <div>
                  {notes.length === 0 ? (
                    <p className="text-muted text-sm">Sin notas.</p>
                  ) : (
                    notes.map((n) => (
                      <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.85rem' }}>
                        <div>{n.note}</div>
                        <div className="text-muted text-xs mt-4">{n.profiles?.full_name ?? '—'} · {fmt.datetime(n.created_at)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="card mt-16">
              <h4 className="mb-12">Agregar Nota</h4>
              <div className="flex gap-8">
                <input type="text" className="form-control" placeholder="Ej: Alérgico a mariscos" style={{ flex: 1 }} value={newNote} onChange={(e) => setNewNote(e.target.value)} />
                <button className="btn btn-outline btn-sm" onClick={addCustomerNote}>+ Agregar</button>
              </div>
            </div>

            {loyaltyEnabled && (
              <div className="card mt-16" style={{ borderColor: 'var(--amber-dim)' }}>
                <h4 className="mb-12">Ajuste Manual de Puntos</h4>
                <div className="flex gap-8">
                  <input type="number" className="form-control" placeholder="ej: 50 o -50" style={{ flex: 1 }} value={pointsAdjust} onChange={(e) => setPointsAdjust(e.target.value)} />
                  <input type="text" className="form-control" placeholder="Motivo..." style={{ flex: 1 }} value={pointsNote} onChange={(e) => setPointsNote(e.target.value)} />
                  <button className="btn btn-amber btn-sm" onClick={applyPointsAdjust}>Aplicar</button>
                </div>
              </div>
            )}
          </div>
      </Modal>
    </>
  )
}
