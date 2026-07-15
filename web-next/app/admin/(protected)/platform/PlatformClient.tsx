'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmt } from '@/lib/format'
import { useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import { useToast } from '../../../components/ToastProvider'
import { useConfirm } from '@/app/components/ConfirmProvider'

type Tenant = {
  id: string
  slug: string
  name: string
  status: 'active' | 'suspended' | 'trial' | 'archived'
  plan: string
  timezone: string
  currency: string
  created_at: string
}

const STATUS_CFG: Record<Tenant['status'], { label: string; cls: string }> = {
  active:    { label: 'Activo',     cls: 'badge-green' },
  trial:     { label: 'Prueba',     cls: 'badge-amber' },
  suspended: { label: 'Suspendido', cls: 'badge-danger' },
  archived:  { label: 'Archivado',  cls: 'badge-muted' },
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export default function PlatformClient() {
  useRequireRole(['admin'])
  const supabase = createClient()
  const toast = useToast()
  const confirm = useConfirm()

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState('')
  const [plan, setPlan] = useState('starter')
  const [creating, setCreating] = useState(false)

  const loadTenants = useCallback(async () => {
    const { data, error } = await supabase.from('tenants').select('*').order('created_at', { ascending: false })
    if (!error) setTenants((data as Tenant[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const timer = setTimeout(() => { void loadTenants() }, 0)
    return () => clearTimeout(timer)
  }, [loadTenants])

  async function createTenant(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedSlug = slug.trim()
    const trimmedEmail = ownerEmail.trim()
    if (!trimmedName || !trimmedSlug || !trimmedEmail) {
      toast('Nombre, slug y email del dueño son requeridos', 'warning')
      return
    }

    setCreating(true)
    const { error } = await supabase.rpc('create_tenant', {
      p_slug: trimmedSlug,
      p_name: trimmedName,
      p_owner_email: trimmedEmail,
      p_plan: plan,
    })

    if (error) {
      const msg = error.message.includes('owner_not_found')
        ? 'No existe ninguna cuenta con ese email. El dueño debe registrarse primero en /auth.'
        : error.message.includes('duplicate') || error.message.includes('unique')
          ? 'Ese slug ya está en uso por otro negocio.'
          : error.message
      toast(msg, 'error')
    } else {
      toast(`${trimmedName} creado ✓`)
      setName('')
      setSlug('')
      setSlugTouched(false)
      setOwnerEmail('')
      setPlan('starter')
      await loadTenants()
    }
    setCreating(false)
  }

  async function toggleSuspend(t: Tenant) {
    const nextStatus = t.status === 'suspended' ? 'active' : 'suspended'
    const label = nextStatus === 'suspended' ? 'suspender' : 'reactivar'
    if (!await confirm(`¿Seguro que quieres ${label} "${t.name}"?`, { confirmLabel: nextStatus === 'suspended' ? 'Suspender' : 'Reactivar' })) return

    const { error } = await supabase.rpc('set_tenant_status', { p_tenant_id: t.id, p_status: nextStatus })
    if (error) {
      toast('Error al cambiar el estado', 'error')
    } else {
      toast(nextStatus === 'suspended' ? `${t.name} suspendido` : `${t.name} reactivado`)
      await loadTenants()
    }
  }

  return (
    <>
      <Topbar title="Plataforma — Negocios" />

      <div className="admin-content">
        <div className="flex-col gap-8 mb-24">
          {loading ? (
            <p className="text-muted text-sm">Cargando...</p>
          ) : tenants.length === 0 ? (
            <p className="text-muted text-sm">Sin negocios registrados todavía.</p>
          ) : (
            tenants.map((t) => {
              const cfg = STATUS_CFG[t.status]
              const isSuspended = t.status === 'suspended'
              return (
                <div key={t.id} className="staff-card">
                  <div className="staff-card__info">
                    <div className="staff-card__name">{t.name}</div>
                    <div className="staff-card__meta">
                      <span className={`badge text-xs ${cfg.cls}`} style={{ padding: '2px 8px', borderRadius: 4 }}>{cfg.label}</span>
                      <span style={{ marginLeft: 8 }}>/{t.slug} · plan {t.plan} · creado {fmt.datetime(t.created_at)}</span>
                    </div>
                  </div>
                  {t.status !== 'archived' && (
                    <div className="staff-card__actions">
                      <button
                        className={`btn btn-sm ${isSuspended ? 'btn-outline' : 'btn-danger'}`}
                        onClick={() => toggleSuspend(t)}
                      >
                        {isSuspended ? 'Reactivar' : 'Suspender'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="card" style={{ maxWidth: 560 }}>
          <h4 style={{ marginBottom: 16 }}>➕ Nuevo negocio</h4>
          <form className="flex-col gap-12" onSubmit={createTenant}>
            <div className="form-group">
              <label className="form-label">Nombre del negocio</label>
              <input
                type="text" className="form-control" required placeholder="Ej: Pupusería Doña Ana"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!slugTouched) setSlug(slugify(e.target.value))
                }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Slug (identificador único)</label>
              <input
                type="text" className="form-control" required placeholder="pupuseria-dona-ana"
                value={slug}
                onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true) }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email del dueño</label>
              <input
                type="email" className="form-control" required placeholder="dueno@negocio.com"
                value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)}
              />
              <div className="text-xs text-muted mt-4">El dueño debe registrarse antes en /auth con este email.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Plan</label>
              <select className="form-control" value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="multi-sucursal">Multi-sucursal</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creando...' : '✓ Crear negocio'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
