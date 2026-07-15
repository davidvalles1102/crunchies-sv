import './portal.css'
import type { ReactNode } from 'react'

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <main id="main-content">{children}</main>
}
