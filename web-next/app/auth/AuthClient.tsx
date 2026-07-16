'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Tab = 'login' | 'register' | 'forgot' | 'reset'

export default function AuthClient() {
  const supabase = createClient()
  const router = useRouter()
  const params = useSearchParams()

  const [tab, setTab] = useState<Tab>(params.get('mode') === 'register' ? 'register' : 'login')

  // Login
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Register
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [registerSuccess, setRegisterSuccess] = useState('')
  const [registerLoading, setRegisterLoading] = useState(false)

  // Forgot
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMsg, setForgotMsg] = useState<{ text: string; type: 'error' | 'success' } | null>(null)

  // Reset
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [resetMsg, setResetMsg] = useState<{ text: string; type: 'error' | 'success' } | null>(null)
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setTab('reset')
        return
      }
      if (event === 'SIGNED_IN' && session && window.location.hash.includes('access_token')) {
        router.push('/profile')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase, router])

  useEffect(() => {
    if (window.location.hash.includes('access_token')) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/profile')
    })
  }, [supabase, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    })

    if (error) {
      setLoginError(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message)
      setLoginLoading(false)
      return
    }

    router.push(params.get('next') || '/profile')
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegisterError('')
    setRegisterSuccess('')

    if (regPassword !== regPasswordConfirm) {
      setRegisterError('Las contraseñas no coinciden.')
      return
    }

    setRegisterLoading(true)
    const { error } = await supabase.auth.signUp({
      email: regEmail.trim(),
      password: regPassword,
      options: { data: { full_name: regName.trim(), phone: regPhone.trim() } },
    })
    setRegisterLoading(false)

    if (error) {
      setRegisterError(error.message)
      return
    }

    setRegisterSuccess('¡Cuenta creada! Revisa tu correo para verificar tu cuenta.')
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: window.location.origin + '/auth',
    })
    setForgotMsg(error
      ? { text: error.message, type: 'error' }
      : { text: 'Si el correo existe, recibirás el enlace en breve.', type: 'success' })
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetMsg(null)

    if (resetPassword !== resetPasswordConfirm) {
      setResetMsg({ text: 'Las contraseñas no coinciden.', type: 'error' })
      return
    }

    setResetLoading(true)
    const { error } = await supabase.auth.updateUser({ password: resetPassword })

    if (error) {
      setResetMsg({ text: error.message, type: 'error' })
      setResetLoading(false)
      return
    }

    setResetMsg({ text: '¡Contraseña actualizada! Redirigiendo al login...', type: 'success' })
    await supabase.auth.signOut()
    setTimeout(() => { setTab('login'); router.replace('/auth') }, 2000)
  }

  return (
    <div className="auth-card">
      <Link href="/" className="auth-logo">CRUNCHIES</Link>

      {tab !== 'reset' && (
        <div className="auth-tabs">
          <button className={`auth-tab${tab === 'login' ? ' active' : ''}`} onClick={() => setTab('login')}>Iniciar Sesión</button>
          <button className={`auth-tab${tab === 'register' ? ' active' : ''}`} onClick={() => setTab('register')}>Crear Cuenta</button>
        </div>
      )}

      {tab === 'login' && (
        <form className="auth-form" autoComplete="off" onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Correo electrónico</label>
            <input id="login-email" type="email" className="form-control" placeholder="tucorreo@email.com" required
              value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Contraseña</label>
            <input id="login-password" type="password" className="form-control" placeholder="••••••••" required
              value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
          </div>
          {loginError && <div className="alert alert-error">{loginError}</div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={loginLoading}>
            {loginLoading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
          <p className="text-center text-sm text-muted mt-16">
            ¿Olvidaste tu contraseña?{' '}
            <a href="#" className="text-green" onClick={(e) => { e.preventDefault(); setTab('forgot') }}>Restablecer</a>
          </p>
        </form>
      )}

      {tab === 'register' && (
        <form className="auth-form" autoComplete="off" onSubmit={handleRegister}>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-name">Nombre completo</label>
            <input id="reg-name" type="text" className="form-control" placeholder="Tu nombre" required
              value={regName} onChange={(e) => setRegName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Correo electrónico</label>
            <input id="reg-email" type="email" className="form-control" placeholder="tucorreo@email.com" required
              value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-phone">Teléfono</label>
            <input id="reg-phone" type="tel" className="form-control" placeholder="+503 0000-0000"
              value={regPhone} onChange={(e) => setRegPhone(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">Contraseña</label>
            <input id="reg-password" type="password" className="form-control" placeholder="Mínimo 6 caracteres" required minLength={6}
              value={regPassword} onChange={(e) => setRegPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-password-confirm">Confirmar contraseña</label>
            <input id="reg-password-confirm" type="password" className="form-control" placeholder="Repite tu contraseña" required
              value={regPasswordConfirm} onChange={(e) => setRegPasswordConfirm(e.target.value)} />
          </div>
          {registerError && <div className="alert alert-error">{registerError}</div>}
          {registerSuccess && <div className="alert alert-success">{registerSuccess}</div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={registerLoading}>
            {registerLoading ? 'Creando cuenta...' : 'Crear Cuenta'}
          </button>
        </form>
      )}

      {tab === 'forgot' && (
        <form className="auth-form" onSubmit={handleForgot}>
          <p className="text-secondary text-sm mb-16">Te enviaremos un enlace para restablecer tu contraseña.</p>
          <div className="form-group">
            <label className="form-label" htmlFor="forgot-email">Correo electrónico</label>
            <input id="forgot-email" type="email" className="form-control" placeholder="tucorreo@email.com" required
              value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
          </div>
          {forgotMsg && <div className={`alert alert-${forgotMsg.type}`}>{forgotMsg.text}</div>}
          <button type="submit" className="btn btn-primary btn-full">Enviar enlace</button>
          <button type="button" className="btn btn-ghost btn-full mt-8" onClick={() => setTab('login')}>← Volver al login</button>
        </form>
      )}

      {tab === 'reset' && (
        <form className="auth-form" onSubmit={handleReset}>
          <p className="text-secondary text-sm mb-16">Crea tu nueva contraseña.</p>
          <div className="form-group">
            <label className="form-label" htmlFor="reset-password">Nueva contraseña</label>
            <input id="reset-password" type="password" className="form-control" placeholder="Mínimo 6 caracteres" required minLength={6}
              value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="reset-password-confirm">Confirmar contraseña</label>
            <input id="reset-password-confirm" type="password" className="form-control" placeholder="Repite tu contraseña" required
              value={resetPasswordConfirm} onChange={(e) => setResetPasswordConfirm(e.target.value)} />
          </div>
          {resetMsg && <div className={`alert alert-${resetMsg.type}`}>{resetMsg.text}</div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={resetLoading}>
            {resetLoading ? 'Guardando...' : 'Guardar Nueva Contraseña'}
          </button>
        </form>
      )}
    </div>
  )
}
