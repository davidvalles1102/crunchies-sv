import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { resolveRootTenantId } from '@/lib/tenant'

// ponytail: in-memory rate limiter; resets on redeploy — use Upstash Redis if brute-force becomes a real concern
const ipAttempts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10
const RATE_WINDOW = 15 * 60 * 1000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipAttempts.get(ip)
  if (!entry || now > entry.resetAt) {
    ipAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

const ROLE_CREDENTIALS: Record<string, { email: string; password: string }> = {
  kitchen:  { email: process.env.PORTAL_KITCHEN_EMAIL!,  password: process.env.PORTAL_KITCHEN_PASSWORD! },
  delivery: { email: process.env.PORTAL_DELIVERY_EMAIL!, password: process.env.PORTAL_DELIVERY_PASSWORD! },
  waiter:   { email: process.env.PORTAL_WAITER_EMAIL!,   password: process.env.PORTAL_WAITER_PASSWORD! },
}

const ROOT_TENANT_SLUG = 'crunchies-root'
const ROOT_TENANT_NAME = 'Crunchies Mi Rancho'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta en 15 minutos.' }, { status: 429 })
  }

  let pin: string
  try {
    const body = await req.json()
    pin = String(body.pin ?? '')
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }

  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN inválido' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: staff, error: rpcError } = await supabase.rpc('verify_staff_pin', { p_pin: pin })
  if (rpcError) {
    console.error('[portal/auth] verify_staff_pin:', rpcError.message)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }

  if (!staff) {
    return NextResponse.json({ error: 'PIN inválido o inactivo' }, { status: 401 })
  }

  if ((staff as { error?: string }).error === 'locked') {
    return NextResponse.json({ error: 'Cuenta bloqueada. Intenta en 15 minutos.' }, { status: 429 })
  }

  const s = staff as { staff_id: string; full_name: string; role: string }
  const creds = ROLE_CREDENTIALS[s.role]

  if (!creds?.email || !creds?.password) {
    console.error('[portal/auth] Missing env credentials for role:', s.role)
    return NextResponse.json({ error: 'Configuración incompleta en servidor' }, { status: 500 })
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  })

  if (authError || !authData.session) {
    console.error('[portal/auth] signInWithPassword:', authError?.message)
    return NextResponse.json({ error: 'Error de autenticación del servidor', debug: authError?.message ?? 'no session' }, { status: 500 })
  }

  // El uuid real de tenants.id — null si tenant_foundation.sql aun no corrio
  // en este entorno (pin-auth.ts trata un tenantId nulo como "sin tenant").
  const tenantId = await resolveRootTenantId(supabase)

  return NextResponse.json({
    staffId:      s.staff_id,
    fullName:     s.full_name,
    role:         s.role,
    tenantId,
    tenantSlug:   tenantId ? ROOT_TENANT_SLUG : null,
    tenantName:   tenantId ? ROOT_TENANT_NAME : null,
    accessToken:  authData.session.access_token,
    refreshToken: authData.session.refresh_token,
  })
}
