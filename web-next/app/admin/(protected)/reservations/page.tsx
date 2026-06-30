import type { Metadata } from 'next'
import ReservationsClient from './ReservationsClient'

export const metadata: Metadata = { title: 'Reservaciones' }

export default function ReservationsPage() {
  return <ReservationsClient />
}
