import type { Metadata } from 'next'
import { Suspense } from 'react'
import AuthClient from './AuthClient'

export const metadata: Metadata = { title: 'Cuenta' }

export default function AuthPage() {
  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-bg__grid"></div>
        <div className="auth-bg__glow auth-bg__glow--orange"></div>
        <div className="auth-bg__glow auth-bg__glow--amber"></div>
      </div>

      <Suspense fallback={null}>
        <AuthClient />
      </Suspense>
    </div>
  )
}
