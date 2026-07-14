'use client'

import { useCallback, useState } from 'react'
import { loginWithPin, type PinSession } from '@/lib/pin-auth'

type Props = {
  portalName: string
  icon: string
  expectedRole: 'kitchen' | 'delivery' | 'waiter'
  onSuccess: (session: PinSession) => void
}

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function PinPad({ portalName, icon, expectedRole, onSuccess }: Props) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = useCallback(async (pin: string) => {
    setLoading(true)
    setError('')
    const { session, error } = await loginWithPin(pin)
    if (!session || session.role !== expectedRole) {
      setError(error ?? 'PIN inválido o sin acceso a este portal')
      setDigits('')
      setLoading(false)
      return
    }
    onSuccess(session)
  }, [expectedRole, onSuccess])

  function pressKey(k: string) {
    if (loading) return
    if (k === '⌫') { setDigits((d) => d.slice(0, -1)); setError(''); return }
    if (k === '') return
    if (digits.length < 6) {
      const next = digits + k
      setDigits(next)
      if (next.length === 6) void submit(next)
    }
  }

  return (
    <div className="pin-screen">
      <div className="pin-icon">{icon}</div>
      <div className="pin-portal-name">{portalName}</div>
      <p className="pin-sub">Ingresa tu PIN de 6 dígitos</p>

      <div className="pin-display">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`pin-dot${i < digits.length ? ' pin-dot--filled' : ''}`} />
        ))}
      </div>

      {loading
        ? <div className="pin-loading">Verificando...</div>
        : <div className="pin-error">{error}</div>}

      <div className="pin-pad">
        {KEYS.map((k, i) =>
          k === '' ? (
            <div key={i} aria-hidden="true" className="pin-key pin-key--empty" />
          ) : (
            <button
              key={i}
              className={`pin-key${k === '⌫' ? ' pin-key--del' : ''}`}
              onClick={() => pressKey(k)}
              type="button"
              aria-label={k === '⌫' ? 'Borrar último dígito' : k}
            >
              {k}
            </button>
          )
        )}
      </div>
    </div>
  )
}
