import type { Metadata } from 'next'
import MenuManagementClient from './MenuManagementClient'

export const metadata: Metadata = { title: 'Menú' }

export default function MenuManagementPage() {
  return <MenuManagementClient />
}
