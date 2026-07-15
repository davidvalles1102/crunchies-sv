import type { Metadata } from 'next'
import InventoryClient from './InventoryClient'

export const metadata: Metadata = { title: 'Inventario' }

export default function InventoryPage() {
  return <InventoryClient />
}
