'use client'

import { useEffect } from 'react'

type WakeLockSentinel = { release: () => Promise<void> }
type NavigatorWithWakeLock = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> } }

// Mantiene la pantalla encendida mientras el portal esta abierto — sin
// esto, un telefono/tablet que se apaga deja de ejecutar JS y el socket
// de Realtime muere junto con la pantalla. Falla en silencio si el
// navegador no soporta la API o el usuario/OS la deniega (no bloqueante).
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    const nav = navigator as NavigatorWithWakeLock
    if (!enabled || !nav.wakeLock) return undefined

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    async function requestLock() {
      try {
        sentinel = (await nav.wakeLock?.request('screen')) ?? null
      } catch {
        // denegado o pantalla ya bloqueada al momento del request — no critico
      }
    }
    requestLock()

    // El wake lock se libera automaticamente si la pestaña pierde
    // visibilidad — hay que volver a pedirlo al recuperar el foco.
    const onVisible = () => {
      if (!cancelled && document.visibilityState === 'visible' && !sentinel) requestLock()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => {})
    }
  }, [enabled])
}
