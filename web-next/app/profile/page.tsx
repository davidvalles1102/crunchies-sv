import type { Metadata } from 'next'
import NavBar from '../components/NavBar'
import ProfileClient from './ProfileClient'

export const metadata: Metadata = { title: 'Mi Perfil' }

export default function ProfilePage() {
  return (
    <>
      <NavBar />
      <main id="main-content">
        <ProfileClient />
      </main>

      <footer className="cust-footer">
        <div className="footer-brand">CRUNCHIES</div>
        <div className="footer-details">
          <span>📍 Ave La Reyna, Entre PJE 7 Y 1de Mayo, San Salvador, El Salvador</span>
          <span>📞 +503 7311 8276</span>
          <span>🕐 Lun–Vie: 11:00 AM – 2:30 PM · 6:00 PM – 10:30 PM | Sáb–Dom: 11:00 AM – 10:30 PM</span>
        </div>
        <div className="footer-divider"></div>
        <p className="footer-copy">© 2026 Crunchies — Todos los derechos reservados</p>
      </footer>
    </>
  )
}
