'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/client'
import { useRequireRole } from '../../AdminContext'
import Topbar from '../../components/Topbar'
import LiveClock from '../../components/LiveClock'
import { useToast } from '../../../components/ToastProvider'
import type { RestaurantTable } from '@/lib/types'
import styles from './tables.module.css'

const STATUS_LABEL: Record<string, string> = { available: 'Disponible', occupied: 'Ocupada', reserved: 'Reservada', maintenance: 'Mantenimiento' }
const STATUS_BADGE: Record<string, string> = { available: 'badge-green', occupied: 'badge-danger', reserved: 'badge-amber', maintenance: 'badge-muted' }
const ACTIVE_ORDER_STATUS_LABEL: Record<string, string> = { open: 'abierta', in_kitchen: 'en cocina', ready: 'lista', delivered: 'entregada' }

type ActiveQR = { type: 'table'; id: string; number: number } | { type: 'menu' }

export default function TablesClient() {
  useRequireRole(['admin'])
  const supabase = createClient()
  const toast = useToast()

  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [activeQR, setActiveQR] = useState<ActiveQR | null>(null)
  const [qrUrl, setQrUrl] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('restaurant_tables').select('*').order('number')
      setTables((data as RestaurantTable[]) ?? [])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!activeQR || !canvasRef.current || !qrUrl) return
    QRCode.toCanvas(canvasRef.current, qrUrl, { width: 256, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
  }, [activeQR, qrUrl])

  const showQR = (table: RestaurantTable) => {
    setActiveQR({ type: 'table', id: table.id, number: table.number })
    setQrUrl(`${window.location.origin}/table-order?table=${table.id}`)
  }

  const showMenuQR = () => {
    setActiveQR({ type: 'menu' })
    setQrUrl(`${window.location.origin}/`)
  }

  const closeModal = () => { setActiveQR(null); setQrUrl('') }

  const downloadQr = () => {
    if (!activeQR || !canvasRef.current) return
    const a = document.createElement('a')
    a.href = canvasRef.current.toDataURL('image/png')
    a.download = activeQR.type === 'menu' ? 'menu-vitrina-qr.png' : `mesa-${activeQR.number}-qr.png`
    a.click()
  }

  const releaseTable = async (table: RestaurantTable) => {
    const { data: active } = await supabase
      .from('orders')
      .select('id, status')
      .eq('table_id', table.id)
      .in('status', ['open', 'in_kitchen', 'ready', 'delivered'])
      .limit(1)

    if (active?.length) {
      const label = ACTIVE_ORDER_STATUS_LABEL[active[0].status] ?? active[0].status
      const go = confirm(`⚠️ Mesa ${table.number} tiene una orden ${label}.\n\n¿Liberar la mesa de todas formas?`)
      if (!go) return
    }

    const { error } = await supabase.from('restaurant_tables').update({ status: 'available' }).eq('id', table.id)
    if (error) { toast('Error al liberar la mesa', 'error'); return }
    setTables((prev) => prev.map((t) => t.id === table.id ? { ...t, status: 'available' } : t))
    toast(`Mesa ${table.number} liberada ✓`, 'success')
  }

  const toggleMaintenance = async (table: RestaurantTable) => {
    const newStatus = table.status === 'maintenance' ? 'available' : 'maintenance'
    const { error } = await supabase.from('restaurant_tables').update({ status: newStatus }).eq('id', table.id)
    if (error) { toast('Error al actualizar la mesa', 'error'); return }
    setTables((prev) => prev.map((t) => t.id === table.id ? { ...t, status: newStatus } : t))
    toast(newStatus === 'maintenance' ? 'Mesa en mantenimiento' : 'Mesa activada')
  }

  return (
    <>
      <Topbar title="Mesas & QR">
        <button className="btn btn-outline btn-sm" onClick={showMenuQR}>📋 QR del Menú (Vitrina)</button>
        <LiveClock className="text-muted text-sm" />
      </Topbar>

      <div className="admin-content">
        <div className={styles['tables-grid']}>
          {tables.length === 0 ? (
            <p className="text-muted">No hay mesas registradas en la base de datos.</p>
          ) : (
            tables.map((t) => (
              <div key={t.id} className={`${styles['tbl-card']} ${styles[`tbl-card--${t.status}`] ?? ''}`}>
                <div className={styles['tbl-card__top']}>
                  <div className={styles['tbl-card__num']}>Mesa {t.number}</div>
                  <span className={`badge ${STATUS_BADGE[t.status] ?? 'badge-muted'}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                </div>
                <div className={styles['tbl-card__meta']}>📍 {t.location} &nbsp;·&nbsp; 👤 {t.capacity} personas</div>
                <div className={styles['tbl-card__actions']}>
                  <button className="btn btn-primary btn-sm" onClick={() => showQR(t)}>📱 Ver QR</button>
                  {t.status === 'occupied' ? (
                    <button className="btn btn-danger btn-sm" onClick={() => releaseTable(t)}>🔓 Liberar</button>
                  ) : (
                    <button className="btn btn-outline btn-sm" onClick={() => toggleMaintenance(t)}>
                      {t.status === 'maintenance' ? '✓ Activar' : '⚙ Mantenimiento'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`modal-backdrop${activeQR ? '' : ' hidden'}`}>
        <div className="modal" style={{ maxWidth: 360 }}>
          <div className="modal-header">
            <h3>{activeQR?.type === 'menu' ? '📋 QR — Menú (Vitrina)' : `QR — Mesa ${activeQR?.type === 'table' ? activeQR.number : ''}`}</h3>
            <button className="modal-close" onClick={closeModal}>✕</button>
          </div>
          <div className={`modal-body ${styles['qr-body']}`}>
            {activeQR?.type === 'menu' && (
              <p className="text-muted text-sm">Solo para ver el menú — sin carrito ni pedido. Ideal para vitrina, redes sociales o publicidad.</p>
            )}
            <div style={{ borderRadius: 'var(--r-md)', overflow: 'hidden', border: '6px solid #fff', display: 'inline-block', background: '#fff', width: 256, height: 256 }}>
              <canvas ref={canvasRef} width={256} height={256}></canvas>
            </div>
            <p className={styles['qr-url']}>{qrUrl}</p>
            <button className="btn btn-primary btn-full" onClick={downloadQr}>⬇ Descargar PNG</button>
          </div>
        </div>
      </div>
    </>
  )
}
