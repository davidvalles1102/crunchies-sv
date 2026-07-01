import type { Metadata } from 'next'
import StaffClient from './StaffClient'

export const metadata: Metadata = { title: 'Staff — Portales' }

export default function StaffPage() {
  return <StaffClient />
}
