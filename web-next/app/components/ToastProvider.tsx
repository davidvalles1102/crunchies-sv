'use client'

import { createContext, useCallback, useContext, useState } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'
type ToastItem = { id: number; message: string; type: ToastType; closing: boolean }

const ToastContext = createContext<(message: string, type?: ToastType) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, type, closing: false }])

    setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, closing: true } : x)))
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id))
      }, 300)
    }, 3500)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div id="toast-container">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.type}`}
            style={t.closing ? { animation: 'fadeOut .3s ease forwards' } : undefined}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
