'use client'

import { useEffect, useRef } from 'react'

// Red de seguridad para pantallas que dependen de Supabase Realtime: en
// movil, cuando la pestaña pasa a segundo plano o la pantalla se apaga,
// el navegador suspende/throttlea el websocket y este puede morir sin
// avisar — realtime-js no siempre reconecta a tiempo. Esto refresca al
// volver a foco/visible Y ademas hace polling de respaldo, para que la
// pantalla nunca quede desactualizada mas de `pollMs` sin depender de que
// el socket siga vivo.
export function useLiveRefetch(refetch: () => void, { pollMs = 20000 }: { pollMs?: number } = {}) {
  const refetchRef = useRef(refetch)
  useEffect(() => { refetchRef.current = refetch })

  useEffect(() => {
    // Un poll de respaldo corre solo, sin usuario esperando resultado — si
    // el celular esta sin señal/wifi justo en ese instante, `refetch()`
    // rechaza (TypeError: Failed to fetch) y sin este catch esa promesa
    // no manejada tira el overlay de error de Next.js y "rompe" la
    // pantalla. Se ignora: el siguiente poll (o el proximo refetch al
    // recuperar visibilidad) simplemente lo vuelve a intentar.
    const safeRefetch = () => { Promise.resolve(refetchRef.current()).catch(() => {}) }
    const onVisible = () => { if (document.visibilityState === 'visible') safeRefetch() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const poll = setInterval(safeRefetch, pollMs)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      clearInterval(poll)
    }
  }, [pollMs])
}
