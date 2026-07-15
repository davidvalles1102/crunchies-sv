'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import Modal from '@/app/components/Modal'

interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  danger?: boolean
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

interface ActiveConfirm {
  message: string
  title: string
  confirmLabel: string
  danger: boolean
  resolve: (value: boolean) => void
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveConfirm | null>(null)

  const confirm: ConfirmFn = useCallback((message, options) => {
    return new Promise<boolean>((resolve) => {
      setActive({
        message,
        title: options?.title ?? 'Confirmar acción',
        confirmLabel: options?.confirmLabel ?? 'Confirmar',
        danger: options?.danger ?? true,
        resolve,
      })
    })
  }, [])

  const handleConfirm = () => {
    active?.resolve(true)
    setActive(null)
  }

  const handleCancel = () => {
    active?.resolve(false)
    setActive(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!active} onClose={handleCancel} title={active?.title ?? ''} maxWidth={420}>
        <div className="modal-header">
          <h3>{active?.title}</h3>
          <button className="modal-close" aria-label="Cerrar" onClick={handleCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>{active?.message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={handleCancel}>Cancelar</button>
          <button
            className={active?.danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={handleConfirm}
          >
            {active?.confirmLabel}
          </button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>')
  return ctx
}
