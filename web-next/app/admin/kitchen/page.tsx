import type { Metadata } from 'next'
import KitchenClient from './KitchenClient'

export const metadata: Metadata = { title: 'Cocina' }

export default function KitchenPage() {
  return <KitchenClient />
}
