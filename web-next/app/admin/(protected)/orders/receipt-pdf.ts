import { jsPDF } from 'jspdf'
import { fmt } from '@/lib/format'
import { modifiersSummary } from '@/lib/modifiers'
import type { ReceiptData } from './types'

const METHOD_LABEL: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', points: 'Puntos', credit: 'Fiado' }

export function buildReceiptPDF(data: ReceiptData): jsPDF {
  const itemsH = data.items.reduce((h, i) => h + Math.ceil(i.name.length / 26) * 5.2, 0)
  const pageH = Math.max(170, 118 + itemsH)

  const doc = new jsPDF({ unit: 'mm', format: [80, pageH] })
  const W = 80
  let y = 0

  const fnt = (size: number, style: 'normal' | 'bold' = 'normal', r = 30, g = 30, b = 30) => {
    doc.setFontSize(size); doc.setFont('helvetica', style); doc.setTextColor(r, g, b)
  }
  const ctr = (text: string, size: number, bold = false) => {
    fnt(size, bold ? 'bold' : 'normal')
    doc.text(text, W / 2, y, { align: 'center' })
    y += size * 0.35 + 1.5
  }
  const hr = (light = false) => {
    const c = light ? 220 : 170
    doc.setDrawColor(c, c, c)
    doc.line(5, y, W - 5, y); y += 4
  }
  const row2 = (left: string, right: string, size = 8.5, bold = false) => {
    const c = bold ? 20 : 60
    fnt(size, bold ? 'bold' : 'normal', c, c, c)
    doc.text(String(left), 5, y)
    doc.text(String(right), W - 5, y, { align: 'right' })
    y += size * 0.38 + 1.5
  }

  doc.setFillColor(37, 211, 102); doc.rect(0, 0, W, 3.5, 'F')
  y = 11

  fnt(15, 'bold', 20, 20, 20); ctr('CRUNCHIES', 15, true)
  fnt(8.5, 'normal', 100, 100, 100); ctr('Restaurante & Delivery', 8.5)
  y += 1; hr()

  const locLabel = data.orderType === 'dine_in'
    ? `Mesa ${data.tableNum ?? '—'}`
    : data.orderType === 'takeout' ? 'Para Llevar' : 'Domicilio'
  row2('Recibo:', data.receiptNo, 8)
  row2('Fecha:', fmt.datetime(data.date.toISOString()), 8)
  row2('Pedido:', locLabel, 8)
  y += 1; hr()

  fnt(7.5, 'bold', 90, 90, 90)
  doc.text('DESCRIPCIÓN', 5, y)
  doc.text('VALOR', W - 5, y, { align: 'right' })
  y += 5; hr(true)

  data.items.forEach((item) => {
    const label = item.modifiers?.length ? `${item.qty}× ${item.name} (${modifiersSummary(item.modifiers)})` : `${item.qty}× ${item.name}`
    const price = fmt.currency(item.price * item.qty)
    fnt(8.5, 'normal', 30, 30, 30)
    const lines: string[] = doc.splitTextToSize(label, 50)
    lines.forEach((ln, idx) => {
      doc.text(ln, idx === 0 ? 5 : 8, y)
      if (idx === 0) { fnt(8.5, 'bold', 30, 30, 30); doc.text(price, W - 5, y, { align: 'right' }) }
      y += 5
    })
  })
  y += 1; hr()

  if (data.redeemedPts > 0) row2(`Puntos canjeados (-${data.redeemedPts} pts)`, `-${fmt.currency(data.redeemedValue)}`, 8.5)
  y += 1
  doc.setFillColor(245, 245, 245); doc.rect(3, y - 3.5, W - 6, 9.5, 'F')
  row2('TOTAL', fmt.currency(data.chargeTotal ?? data.total), 12, true)
  y += 2; hr()

  row2('Método de pago:', METHOD_LABEL[data.method] ?? data.method, 8.5)
  if (data.method === 'cash' && data.change > 0) {
    row2('Efectivo recibido:', fmt.currency(data.cashIn), 8)
    row2('Cambio:', fmt.currency(data.change), 8)
  }
  if (data.customerName && data.earnedPts > 0) row2('Puntos otorgados:', `+${data.earnedPts} pts`, 8)
  hr()

  y += 2
  fnt(10, 'bold', 30, 30, 30); ctr('¡Gracias por su visita!', 10, true)
  fnt(7.5, 'normal', 150, 150, 150); ctr('crunchies.vercel.app', 7.5)

  doc.setFillColor(37, 211, 102); doc.rect(0, pageH - 3.5, W, 3.5, 'F')
  return doc
}
