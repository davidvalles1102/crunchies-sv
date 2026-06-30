import type { Metadata } from 'next'
import NavBar from '../components/NavBar'
import ReservationsClient from './ReservationsClient'

export const metadata: Metadata = { title: 'Reservaciones' }

export default function ReservationsPage() {
  return (
    <>
      <NavBar />

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
            <p>Lun – Jue: 12 pm – 10 pm<br />Vie – Dom: 12 pm – 12 am</p>
          </div>
          <div className="info-card">
            <div className="info-icon">📞</div>
            <h4>¿Necesitas ayuda?</h4>
            <p>Llámanos o escríbenos<br /><span className="neon-amber" style={{ fontWeight: 700 }}>+57 000 000 0000</span></p>
          </div>
          <div className="info-card">
            <div className="info-icon">📋</div>
            <h4>Política de reservas</h4>
            <p>Espera máxima 15 min.<br />Cancela con 2 h de anticipación.</p>
          </div>
        </div>
      </section>

      <footer className="cust-footer">
        <div className="footer-brand">CRUNCHIES</div>
        <div className="footer-details">
          <span>📍 Piamonte, Cauca, Colombia</span>
          <span>📞 312 828 2045</span>
          <span>🕐 Lun–Dom: 6:30 am – 3:30 pm · 4:00 pm – 11:00 pm</span>
        </div>
        <div className="footer-divider"></div>
        <p className="footer-copy">© 2026 Crunchies — Todos los derechos reservados</p>
      </footer>
    </>
  )
}
