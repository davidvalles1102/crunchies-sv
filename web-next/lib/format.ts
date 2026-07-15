export const TAX_RATE = 0 // default cuando no se pasa una tasa explícita — ver tenant_settings.tax_rate

function round2(n: number) {
  return Math.round(n * 100) / 100
}

// taxRate es la tasa efectiva del tenant (tenant_settings.tax_enabled ? tax_rate : 0).
// Se mantiene el default en 0 para no cambiar el comportamiento de ningún
// call site que todavía no pasa la tasa explícitamente.
export function calcTotals(subtotal: number, taxRate: number = TAX_RATE) {
  const tax = round2(subtotal * taxRate)
  const total = round2(subtotal + tax)
  return { subtotal: round2(subtotal), tax, total }
}

export const fmt = {
  currency: (n: number) => '$' + (+(n ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  date: (d: string) => {
    const s = String(d)
    const dt = s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s)
    return dt.toLocaleDateString('es-SV', { year: 'numeric', month: 'short', day: 'numeric' })
  },
  time: (d: string) => new Date(d).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }),
  datetime: (d: string) => `${fmt.date(d)} ${fmt.time(d)}`,
}
