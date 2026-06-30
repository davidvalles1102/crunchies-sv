'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getSession, getProfile } from '@/lib/supabase/auth'
import { useToast } from '../components/ToastProvider'
import { fmt } from '@/lib/format'
import type { Profile } from '@/lib/types'

type Reservation = {
  id: string
  reservation_date: string
  reservation_time: string
  party_size: number
  status: string
  restaurant_tables: { number: number } | null
}

type LoyaltyTx = {
  id: string
  type: 'earned' | 'redeemed'
  points: number
  created_at: string
}

const STATUS_CLS: Record<string, string> = {
  pending: 'badge-amber', confirmed: 'badge-green', seated: 'badge-info', cancelled: 'badge-danger',
}

export default function ProfileClient() {
  const supabase = createClient()
  const router = useRouter()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')

  const [totalVisits, setTotalVisits] = useState(0)
  const [totalSpent, setTotalSpent] = useState(0)
  const [totalRedeemed, setTotalRedeemed] = useState(0)
  const [reservations, setReservations] = useState<Reservation[] | null>(null)
  const [loyaltyTx, setLoyaltyTx] = useState<LoyaltyTx[] | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editMsg, setEditMsg] = useState<{ text: string; type: 'error' } | null>(null)

  const loadStats = useCallback(async (customerId: string) => {
    const { data } = await supabase
      .from('orders')
      .select('total')
      .eq('customer_id', customerId)
      .in('status', ['paid', 'delivered'])
    setTotalVisits(data?.length ?? 0)
    setTotalSpent(data?.reduce((s, o) => s + Number(o.total), 0) ?? 0)
  }, [supabase])

  const loadReservations = useCallback(async (customerId: string) => {
    const { data } = await supabase
      .from('reservations')
      .select('*, restaurant_tables(number)')
      .eq('customer_id', customerId)
      .order('reservation_date', { ascending: false })
      .limit(5)
    setReservations((data as Reservation[]) ?? [])
  }, [supabase])

  const loadLoyalty = useCallback(async (customerId: string) => {
    const { data } = await supabase
      .from('loyalty_transactions')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(15)
    const tx = (data as LoyaltyTx[]) ?? []
    setTotalRedeemed(tx.filter((d) => d.type === 'redeemed').reduce((s, d) => s + d.points, 0))
    setLoyaltyTx(tx)
  }, [supabase])

  useEffect(() => {
    ;(async () => {
      const session = await getSession()
      if (!session) { setLoading(false); return }

      let p = await getProfile(session.user.id)
      if (!p) {
        const meta = session.user.user_metadata ?? {}
        const { data } = await supabase.from('profiles').upsert({
          id: session.user.id,
          full_name: meta.full_name || '',
          phone: meta.phone || '',
          role: 'customer',
          loyalty_points: 0,
        }, { onConflict: 'id' }).select().maybeSingle()
        p = data ?? { id: session.user.id, full_name: meta.full_name || '', phone: meta.phone || '', role: 'customer', loyalty_points: 0 }
      }

      setProfile(p as Profile)
      setEmail(session.user.email ?? '')
      setEditName(p.full_name || '')
      setEditPhone(p.phone || '')
      setLoading(false)

      await Promise.all([loadStats(p.id), loadReservations(p.id), loadLoyalty(p.id)])
    })()
  }, [supabase, loadStats, loadReservations, loadLoyalty])

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setEditMsg(null)

    const { error } = await supabase.from('profiles')
      .update({ full_name: editName.trim(), phone: editPhone.trim() })
      .eq('id', profile.id)

    if (error) {
      setEditMsg({ text: error.message, type: 'error' })
      return
    }

    setProfile({ ...profile, full_name: editName.trim(), phone: editPhone.trim() })
    setEditOpen(false)
    toast('Perfil actualizado')
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return null

  if (!profile) {
    return (
      <div className="auth-gate-full">
        <p className="text-secondary">Debes iniciar sesión para ver tu perfil.</p>
        <Link href="/auth" className="btn btn-primary mt-16">Ingresar</Link>
      </div>
    )
  }

  const initials = (profile.full_name || 'U').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <>
      <div className="profile-layout">
        <aside className="profile-sidebar">
          <div className="avatar-wrap">
            <div className="avatar-circle">{initials}</div>
          </div>
          <h2 className="text-center mt-8">{profile.full_name || 'Sin nombre'}</h2>
          <p className="text-muted text-sm text-center">{email}</p>

          <div className="points-card mt-24">
            <div className="points-label">Puntos de Lealtad</div>
            <div className="points-value neon-green">{profile.loyalty_points ?? 0}</div>
            <div className="points-sub">≈ ${((profile.loyalty_points ?? 0) * 0.01).toFixed(2)} en consumo</div>
          </div>

          <button className="btn btn-outline btn-full mt-16" onClick={() => setEditOpen(true)}>Editar Perfil</button>
          <button className="btn btn-ghost btn-full mt-8" onClick={logout}>Cerrar Sesión</button>
        </aside>

        <div className="profile-main">
          <div className="profile-stats">
            <div className="stat-card stat-green">
              <div className="stat-label">Total Visitas</div>
              <div className="stat-value">{totalVisits}</div>
            </div>
            <div className="stat-card stat-amber">
              <div className="stat-label">Total Gastado</div>
              <div className="stat-value">{fmt.currency(totalSpent)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Puntos Canjeados</div>
              <div className="stat-value">{totalRedeemed}</div>
            </div>
          </div>

          <div className="card mt-24">
            <h3 className="mb-16">Mis Reservaciones</h3>
            <div>
              {reservations === null ? (
                <p className="text-muted text-sm">Cargando...</p>
              ) : reservations.length === 0 ? (
                <p className="text-muted text-sm">Sin reservaciones.</p>
              ) : (
                reservations.map((r) => (
                  <div key={r.id} className="reservation-item">
                    <div>
                      <div style={{ fontWeight: 600 }}>{fmt.date(r.reservation_date)} {r.reservation_time.slice(0, 5)}</div>
                      <div className="reservation-item__meta">
                        {r.party_size} personas{r.restaurant_tables ? ` · Mesa ${r.restaurant_tables.number}` : ''}
                      </div>
                    </div>
                    <span className={`badge ${STATUS_CLS[r.status] ?? 'badge-muted'}`}>{r.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card mt-24">
            <h3 className="mb-16">Historial de Puntos</h3>
            <div>
              {loyaltyTx === null ? (
                <p className="text-muted text-sm">Cargando...</p>
              ) : loyaltyTx.length === 0 ? (
                <p className="text-muted text-sm">Sin movimientos.</p>
              ) : (
                loyaltyTx.map((d) => (
                  <div key={d.id} className={`loyalty-item ${d.type}`}>
                    <span>{fmt.date(d.created_at)}</span>
                    <span className="loyalty-item__points">{d.type === 'earned' ? '+' : '-'}{d.points} pts</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={`modal-backdrop${editOpen ? '' : ' hidden'}`}>
        <div className="modal">
          <div className="modal-header">
            <h3>Editar Perfil</h3>
            <button className="modal-close" onClick={() => setEditOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <form className="flex-col gap-16" onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre completo</label>
                <input type="text" className="form-control" required value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input type="tel" className="form-control" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </div>
              {editMsg && <div className="alert alert-error">{editMsg.text}</div>}
              <button type="submit" className="btn btn-primary btn-full">Guardar Cambios</button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
