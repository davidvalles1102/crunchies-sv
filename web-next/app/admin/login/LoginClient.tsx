'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getSession, getProfile } from '@/lib/supabase/auth'
import { withTimeout, TimeoutError } from '@/lib/withTimeout'

const ALLOWED_ROLES = ['admin', 'waiter', 'kitchen']

function redirectPath(role: string) {
  return role === 'kitchen' ? '/admin/kitchen' : '/admin/dashboard'
}

export default function LoginClient() {
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [busyLabel, setBusyLabel] = useState('Cargando...')

  useEffect(() => {
    ;(async () => {
      try {
        const session = await withTimeout(getSession(), 4000)
        if (session) {
          const profile = await withTimeout(getProfile(session.user.id), 4000)
          if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
            await supabase.auth.signOut()
            setBusy(false)
            setBusyLabel('Ingresar al Panel')
            return
          }
          router.push(redirectPath(profile.role))
          return
        }
      } catch {
        // ignore, just show the form
      }
      setBusy(false)
      setBusyLabel('Ingresar al Panel')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setBusyLabel('Verificando...')
    setError('')

    try {
      const { data, error: signInErr } = await withTimeout(supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      }))

      if (signInErr) {
        setError('Credenciales incorrectas.')
        setBusy(false)
        setBusyLabel('Ingresar al Panel')
        return
      }

      const profile = await withTimeout(getProfile(data.user.id))
      if (!profile) {
        await supabase.auth.signOut()
        setError('Perfil no encontrado. Ejecuta el SQL de configuración en Supabase.')
        setBusy(false)
        setBusyLabel('Ingresar al Panel')
        return
      }
      if (!ALLOWED_ROLES.includes(profile.role)) {
        await supabase.auth.signOut()
        setError('Sin permiso para acceder al panel.')
        setBusy(false)
        setBusyLabel('Ingresar al Panel')
        return
      }

      router.push(redirectPath(profile.role))
    } catch (ex) {
      setError(
        ex instanceof TimeoutError
          ? 'El servidor no respondió a tiempo. Revisa tu conexión e intenta de nuevo.'
          : 'Error inesperado: ' + (ex instanceof Error ? ex.message : String(ex))
      )
      setBusy(false)
      setBusyLabel('Ingresar al Panel')
    }
  }

  return (
    <div className="login-card">
      <div className="login-logo">
        CRUNCHIES<br />
        <span className="text-muted text-sm" style={{ fontWeight: 500, fontFamily: 'var(--font)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
          Panel de Personal
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Correo</label>
          <input type="email" className="form-control" placeholder="correo@crunchies.com" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-group mt-16">
          <label className="form-label">Contraseña</label>
          <input type="password" className="form-control" placeholder="••••••••" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="alert alert-error mt-16">{error}</div>}
        <button type="submit" className="btn btn-primary btn-full btn-lg" style={{ marginTop: 20 }} disabled={busy}>
          {busyLabel}
        </button>
      </form>

      <p className="text-muted text-sm text-center mt-16">
        Solo para personal autorizado del restaurante.
      </p>
    </div>
  )
}
