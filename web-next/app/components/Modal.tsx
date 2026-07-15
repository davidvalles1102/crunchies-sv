'use client'

import { useEffect, useRef } from 'react'

interface ModalProps {
  open?: boolean
  onClose: () => void
  title: string
  maxWidth?: number | string
  style?: React.CSSProperties
  children: React.ReactNode
}

export default function Modal({ open = true, onClose, title, maxWidth, style, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const dialog = dialogRef.current
    if (!dialog) return

    const getFocusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ))

    getFocusable()[0]?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return

      const els = getFocusable()
      if (!els.length) return

      if (e.shiftKey) {
        if (document.activeElement === els[0]) { e.preventDefault(); els[els.length - 1].focus() }
      } else {
        if (document.activeElement === els[els.length - 1]) { e.preventDefault(); els[0].focus() }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const modalStyle: React.CSSProperties = {
    ...(maxWidth != null ? { maxWidth } : {}),
    ...style,
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={Object.keys(modalStyle).length > 0 ? modalStyle : undefined}
      >
        {children}
      </div>
    </div>
  )
}
