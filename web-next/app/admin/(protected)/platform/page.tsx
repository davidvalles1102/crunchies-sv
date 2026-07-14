import type { Metadata } from 'next'
import PlatformClient from './PlatformClient'

export const metadata: Metadata = { title: 'Plataforma — Negocios' }

export default function PlatformPage() {
  return <PlatformClient />
}
