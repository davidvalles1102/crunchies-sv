import type { Metadata } from 'next'
import FiscalExportClient from './FiscalExportClient'

export const metadata: Metadata = { title: 'Exportación contable' }

export default function FiscalExportPage() {
  return <FiscalExportClient />
}
