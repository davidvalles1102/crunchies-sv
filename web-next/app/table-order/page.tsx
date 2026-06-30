import type { Metadata } from 'next'
import { Suspense } from 'react'
import TableOrderClient from './TableOrderClient'

export const metadata: Metadata = { title: 'Ordenar en Mesa' }

export default function TableOrderPage() {
  return (
    <Suspense fallback={null}>
      <TableOrderClient />
    </Suspense>
  )
}
