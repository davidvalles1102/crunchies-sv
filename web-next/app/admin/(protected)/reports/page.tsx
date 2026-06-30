import type { Metadata } from 'next'
import ReportsClient from './ReportsClient'

export const metadata: Metadata = { title: 'Reportes' }

export default function ReportsPage() {
  return <ReportsClient />
}
