import { jsPDF } from 'jspdf'
import { fmt } from '@/lib/format'
import { modifiersSummary } from '@/lib/modifiers'
import type { Payment } from '@/lib/types'

const METHOD_LABEL: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', points: 'Puntos', credit: 'Fiado' }

export function buildPaymentPDF(p: Payment): jsPDF {
  const orderItems = p.orders?.order_items ?? []
  const itemsH = orderItems.reduce((h, i) => h + Math.ceil((i.item_name || '').length / 26) * 5.2, 0)
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

  row2('Recibo:', p.receipt_number, 8)
  row2('Fecha:', fmt.datetime(p.created_at), 8)
  row2('Mesa:', p.orders?.restaurant_tables?.number ? `Mesa ${p.orders.restaurant_tables.number}` : '—', 8)
  row2('Cajero:', p.profiles?.full_name ?? '—', 8)
  y += 1; hr()

  if (orderItems.length) {
    fnt(7.5, 'bold', 90, 90, 90)
    doc.text('DESCRIPCIÓN', 5, y); doc.text('VALOR', W - 5, y, { align: 'right' })
    y += 5; hr(true)
    orderItems.forEach((item) => {
      const mods = (item.order_item_modifiers || []).map((m) => ({ option_name: m.option_name, price_delta: m.price_delta }))
      const label = mods.length ? `${item.quantity}× ${item.item_name} (${modifiersSummary(mods)})` : `${item.quantity}× ${item.item_name}`
      const price = fmt.currency(item.item_price * item.quantity)
      fnt(8.5, 'normal', 30, 30, 30)
      const lines: string[] = doc.splitTextToSize(label, 50)
      lines.forEach((ln, idx) => {
        doc.text(ln, idx === 0 ? 5 : 8, y)
        if (idx === 0) { fnt(8.5, 'bold', 30, 30, 30); doc.text(price, W - 5, y, { align: 'right' }) }
        y += 5
      })
    })
    y += 1; hr()
  }

  y += 1
  doc.setFillColor(245, 245, 245); doc.rect(3, y - 3.5, W - 6, 9.5, 'F')
  row2('TOTAL', fmt.currency(p.amount), 12, true)
  y += 2; hr()

  row2('Método de pago:', METHOD_LABEL[p.method] ?? p.method, 8.5)
  if (p.change_amount > 0) row2('Cambio:', fmt.currency(p.change_amount), 8)
  hr()

  y += 2
  fnt(10, 'bold', 30, 30, 30); ctr('¡Gracias por su visita!', 10, true)
  fnt(7.5, 'normal', 150, 150, 150); ctr('crunchies.vercel.app', 7.5)

  doc.setFillColor(37, 211, 102); doc.rect(0, pageH - 3.5, W, 3.5, 'F')
  return doc
}
