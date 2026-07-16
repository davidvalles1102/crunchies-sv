export class TimeoutError extends Error {}

// Sin esto, una llamada de red colgada (celular con conexion inestable, tunel
// lento, wifi del restaurante) deja la promesa sin resolver ni rechazar para
// siempre — un boton de "Guardando..."/"Procesando..." se queda asi para
// siempre sin error visible. Ver LoginClient.tsx, donde se encontro el
// primer caso real de esto.
// PromiseLike (no Promise) a proposito: los query builders de supabase-js
// (ej. supabase.from(...).insert(...)) son "thenable" pero no instancias
// reales de Promise — con el tipo Promise<T> aqui, TS no puede inferir T
// a traves de Promise.race y todo colapsa a `unknown` en el caller.
export function withTimeout<T>(promise: PromiseLike<T>, ms = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new TimeoutError('timeout')), ms)),
  ])
}
