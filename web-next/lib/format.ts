export const fmt = {
  currency: (n: number) => '$ ' + Math.round(+(n ?? 0)).toLocaleString('es-CO'),
  date: (d: string) => {
    const s = String(d)
    const dt = s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s)
    return dt.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
  },
  time: (d: string) => new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
  datetime: (d: string) => `${fmt.date(d)} ${fmt.time(d)}`,
}
