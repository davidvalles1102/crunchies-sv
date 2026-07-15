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
    const onVisible = () => { if (document.visibilityState === 'visible') refetchRef.current() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const poll = setInterval(() => refetchRef.current(), pollMs)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      clearInterval(poll)
    }
  }, [pollMs])
}
