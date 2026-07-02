import type { Metadata } from 'next'
import LoginClient from './LoginClient'

export const metadata: Metadata = { title: 'Staff Login' }

export default function AdminLoginPage() {
  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="login-grid"></div>
        <div className="login-glow login-glow--orange"></div>
        <div className="login-glow login-glow--amber"></div>
      </div>
      <LoginClient />
    </div>
  )
}
