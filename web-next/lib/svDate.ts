// El Salvador = UTC-6, sin horario de verano. `new Date().toISOString()`
// da la fecha en UTC — desde las 6pm hora local en adelante, UTC ya paso
// a la fecha del dia siguiente. Cualquier filtro de "hoy" (o boundary de
// T00:00:00 sin offset, que Postgres interpreta en UTC) calculado con el
// Date nativo queda mal durante todo el servicio de cena, justo cuando
// mas se usa. Ver DashboardClient.tsx, que ya lo resolvia asi de forma
// local antes de que esto se extrajera aca.
const SV_OFFSET_MS = 6 * 60 * 60 * 1000

// Fecha calendario "de hoy" en hora de El Salvador, como "YYYY-MM-DD".
export function svToday(): string {
  return new Date(Date.now() - SV_OFFSET_MS).toISOString().split('T')[0]
}

// Instante UTC que corresponde a las 00:00 hora SV de la fecha dada.
export function svDayStartUTC(dateStr: string): string {
  return `${dateStr}T06:00:00.000Z`
}

// Instante UTC que corresponde a las 00:00 hora SV del dia SIGUIENTE —
// usar con `.lt()` en vez de calcular un "23:59:59" propenso a errores.
export function svNextDayStartUTC(dateStr: string): string {
  const d = new Date(svDayStartUTC(dateStr))
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}

// Fecha calendario SV de hace N dias, como "YYYY-MM-DD" — para filtros
// tipo "ultimos N dias" contra columnas `date` (no timestamptz).
export function svDaysAgo(days: number): string {
  const d = new Date(svDayStartUTC(svToday()))
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().split('T')[0]
}
