import type { Metadata } from 'next'
import DeliveryClient from './DeliveryClient'

export const metadata: Metadata = { title: 'Delivery' }

export default function DeliveryPage() {
  return <DeliveryClient />
}
