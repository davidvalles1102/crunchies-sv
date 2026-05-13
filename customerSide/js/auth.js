import { supabase } from '../../shared/supabase-client.js'
import { toast } from './utils.js'

const params = new URLSearchParams(location.search)

// Tabs
const tabLogin    = document.getElementById('tab-login')
const tabRegister = document.getElementById('tab-register')
const loginForm   = document.getElementById('loginForm')
const registerForm= document.getElementById('registerForm')
const forgotForm  = document.getElementById('forgotForm')
const resetForm   = document.getElementById('resetForm')
const forgotLink  = document.getElementById('forgotLink')
const backToLogin = document.getElementById('backToLogin')
const authTabs    = document.querySelector('.auth-tabs')

function showTab(tab) {
  loginForm.classList.add('hidden')
  registerForm.classList.add('hidden')
  forgotForm.classList.add('hidden')
  resetForm.classList.add('hidden')
  tabLogin.classList.remove('active')
  tabRegister.classList.remove('active')

  if (tab === 'login')    { loginForm.classList.remove('hidden');    tabLogin.classList.add('active'); }
  if (tab === 'register') { registerForm.classList.remove('hidden'); tabRegister.classList.add('active'); }
  if (tab === 'forgot')   { forgotForm.classList.remove('hidden'); }
  if (tab === 'reset')    { resetForm.classList.remove('hidden'); authTabs.classList.add('hidden'); }
}

tabLogin.addEventListener('click',    () => showTab('login'))
tabRegister.addEventListener('click', () => showTab('register'))
forgotLink?.addEventListener('click', (e) => { e.preventDefault(); showTab('forgot') })
backToLogin?.addEventListener('click', () => showTab('login'))

if (params.get('mode') === 'register') showTab('register')

// ─── Handle Supabase email callback (confirm signup / password recovery) ──────
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    showTab('reset')
    return
  }
  if (event === 'SIGNED_IN' && session) {
    // Came from email confirmation link → go to profile
    if (window.location.hash.includes('access_token')) {
      window.location.href = 'profile.html'
    }
  }
})

// ─── Login ───────────────────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = document.getElementById('loginBtn')
  const err = document.getElementById('loginError')
  btn.disabled = true
  btn.textContent = 'Ingresando...'
  err.classList.add('hidden')

  const { error } = await supabase.auth.signInWithPassword({
    email:    document.getElementById('loginEmail').value.trim(),
    password: document.getElementById('loginPassword').value
  })

  if (error) {
    err.textContent = error.message === 'Invalid login credentials'
      ? 'Correo o contraseña incorrectos.'
      : error.message
    err.classList.remove('hidden')
    btn.disabled = false
    btn.textContent = 'Iniciar Sesión'
    return
  }

  window.location.href = params.get('next') || 'profile.html'
})

// ─── Register ────────────────────────────────────────────────────
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn  = document.getElementById('registerBtn')
  const err  = document.getElementById('registerError')
  const succ = document.getElementById('registerSuccess')
  err.classList.add('hidden')
  succ.classList.add('hidden')

  const name     = document.getElementById('regName').value.trim()
  const email    = document.getElementById('regEmail').value.trim()
  const phone    = document.getElementById('regPhone').value.trim()
  const password = document.getElementById('regPassword').value
  const confirm  = document.getElementById('regPasswordConfirm').value

  if (password !== confirm) {
    err.textContent = 'Las contraseñas no coinciden.'
    err.classList.remove('hidden')
    return
  }

  btn.disabled = true
  btn.textContent = 'Creando cuenta...'

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name, phone } }
  })

  if (error) {
    err.textContent = error.message
    err.classList.remove('hidden')
    btn.disabled = false
    btn.textContent = 'Crear Cuenta'
    return
  }

  // Profile is created automatically by the Supabase trigger on auth.users INSERT

  succ.textContent = '¡Cuenta creada! Revisa tu correo para verificar tu cuenta.'
  succ.classList.remove('hidden')
  btn.disabled = false
  btn.textContent = 'Crear Cuenta'
})

// ─── Forgot Password ─────────────────────────────────────────────
forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const msg   = document.getElementById('forgotMsg')
  const email = document.getElementById('forgotEmail').value.trim()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/customerSide/auth.html'
  })

  msg.classList.remove('hidden', 'alert-error', 'alert-success')
  if (error) {
    msg.textContent = error.message
    msg.classList.add('alert-error')
  } else {
    msg.textContent = 'Si el correo existe, recibirás el enlace en breve.'
    msg.classList.add('alert-success')
  }
})

// ─── Reset Password (after clicking email link) ───────────────────
resetForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn     = document.getElementById('resetBtn')
  const msg     = document.getElementById('resetMsg')
  const password = document.getElementById('resetPassword').value
  const confirm  = document.getElementById('resetPasswordConfirm').value

  msg.classList.remove('hidden', 'alert-error', 'alert-success')

  if (password !== confirm) {
    msg.textContent = 'Las contraseñas no coinciden.'
    msg.classList.add('alert-error')
    return
  }

  btn.disabled = true
  btn.textContent = 'Guardando...'

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    msg.textContent = error.message
    msg.classList.add('alert-error')
    btn.disabled = false
    btn.textContent = 'Guardar Nueva Contraseña'
    return
  }

  msg.textContent = '¡Contraseña actualizada! Redirigiendo al login...'
  msg.classList.add('alert-success')

  await supabase.auth.signOut()
  setTimeout(() => { window.location.href = 'auth.html' }, 2000)
})

// ─── Redirect if already logged in (not during email callback) ────
;(async () => {
  if (window.location.hash.includes('access_token')) return
  const { data: { session } } = await supabase.auth.getSession()
  if (session) window.location.href = 'profile.html'
})()
