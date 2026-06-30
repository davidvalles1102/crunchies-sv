import type { Metadata } from 'next'
import NavBar from '../components/NavBar'
import MisPedidosClient from './MisPedidosClient'

export const metadata: Metadata = { title: 'Mis Pedidos' }

export default function MisPedidosPage() {
  return (
    <>
      <NavBar />
      <MisPedidosClient />

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
