import type { Metadata } from 'next'
import CashClient from './CashClient'

export const metadata: Metadata = { title: 'Caja — Cierre de turno' }

export default function CashPage() {
  return <CashClient />
}
