import type { Metadata } from 'next'
import CreditClient from './CreditClient'

export const metadata: Metadata = { title: 'Fiado — Crédito de clientes' }

export default function CreditPage() {
  return <CreditClient />
}
