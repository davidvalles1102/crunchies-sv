'use client'

import { useEffect, useState } from 'react'
import { getPinSession, type PinSession } from './pin-auth'

// Estos portales se sirven server-rendered (ver `ƒ` en el build de
// Next.js) y sessionStorage no existe en el servidor — leerlo en el
// inicializador de useState hace que el HTML del servidor (siempre
// "sin sesion") no coincida con el primer render del cliente cuando SI
// hay una sesion guardada, y React tira un hydration mismatch. La
// sesion se hidrata en un efecto (solo corre en el cliente, despues de
// que el HTML del servidor ya se pinto), nunca durante el render.
export function usePinSession(role: PinSession['role']) {
  const [session, setSessionState] = useState<PinSession | null>(null)

  useEffect(() => {
    const s = getPinSession()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratacion desde sessionStorage, no puede resolverse en el render (SSR no tiene window)
    if (s?.role === role) setSessionState(s)
  }, [role])

  return [session, setSessionState] as const
}
