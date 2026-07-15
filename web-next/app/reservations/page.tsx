import type { Metadata } from 'next'
import NavBar from '../components/NavBar'
import ReservationsClient from './ReservationsClient'

export const metadata: Metadata = { title: 'Reservaciones' }

export default function ReservationsPage() {
  return (
    <>
      <NavBar />

      <main id="main-content">
        <div className="page-hero page-hero--sm">
          <h1>Reserva tu <span className="neon-amber">Mesa</span></h1>
          <p className="text-secondary">Asegura tu lugar para una experiencia única</p>
        </div>

        <ReservationsClient />

        <section className="info-section">
          <p className="info-section__title">¿Tienes dudas?</p>
          <div className="info-grid">
            <div className="info-card">
              <div className="info-icon">🕐</div>
              <h4>Horarios</h4>
              <p>Lun–Vie: 11:00 AM – 2:30 PM · 6:00 PM – 10:30 PM<br />Sáb–Dom: 11:00 AM – 10:30 PM</p>
            </div>
            <div className="info-card">
              <div className="info-icon">📞</div>
              <h4>¿Necesitas ayuda?</h4>
              <p>Llámanos o escríbenos<br /><span className="neon-amber" style={{ fontWeight: 700 }}>+503 7311 8276</span></p>
            </div>
            <div className="info-card">
              <div className="info-icon">📋</div>
              <h4>Política de reservas</h4>
              <p>Espera máxima 15 min.<br />Cancela con 2 h de anticipación.</p>
            </div>
          </div>
        </section>
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
