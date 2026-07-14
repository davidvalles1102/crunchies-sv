'use client'

import { useAdmin } from '../AdminContext'

export default function Topbar({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  const { tenant } = useAdmin()

  return (
    <header className="admin-topbar">
      <button
        className="topbar__toggle"
        onClick={() => document.getElementById('sidebar')?.classList.toggle('open')}
      >
        ☰
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <h1 className="topbar__title">{title}</h1>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', lineHeight: 1.2, marginTop: -2 }}>
          {tenant.name}
        </div>
      </div>
      <div className="topbar__right">{children}</div>
    </header>
  )
}
