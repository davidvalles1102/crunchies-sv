'use client'

// Beep nativo via WebAudio — sin archivo de audio que alojar. El primer
// toque del PIN pad ya cuenta como gesto del usuario, asi que el
// AudioContext queda desbloqueado para el resto de la sesion en cocina.
let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    audioCtx ??= new Ctx()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

// Cocina: doble beep agudo (880Hz) — orden nueva en preparación
export function playNewOrderBeep() {
  const ctx = getCtx()
  if (!ctx) return
  try {
    for (const [delay, freq] of [[0, 880], [0.18, 880]] as [number, number][]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      const t = ctx.currentTime + delay
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      osc.start(t)
      osc.stop(t + 0.16)
    }
  } catch { /* audio bloqueado */ }
}

// Mesero: chime de 3 notas ascendentes (Do-Mi-Sol) — comanda lista para entregar
export function playReadyChime() {
  const ctx = getCtx()
  if (!ctx) return
  try {
    for (const [delay, freq] of [[0, 523], [0.2, 659], [0.4, 784]] as [number, number][]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      const t = ctx.currentTime + delay
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
      osc.start(t)
      osc.stop(t + 0.22)
    }
  } catch { /* audio bloqueado */ }
}
