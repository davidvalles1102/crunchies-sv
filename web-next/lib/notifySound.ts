'use client'

// Beep nativo via WebAudio — sin archivo de audio que alojar. El primer
// toque del PIN pad ya cuenta como gesto del usuario, asi que el
// AudioContext queda desbloqueado para el resto de la sesion en cocina.
let audioCtx: AudioContext | null = null

export function playNewOrderBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    audioCtx ??= new Ctx()
    const ctx = audioCtx
    if (ctx.state === 'suspended') void ctx.resume()

    for (const delay of [0, 0.18]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      const t = ctx.currentTime + delay
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      osc.start(t)
      osc.stop(t + 0.16)
    }
  } catch {
    // audio bloqueado (sin gesto previo del usuario) — no bloqueante
  }
}
