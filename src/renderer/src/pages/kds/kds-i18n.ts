import i18n from '../../i18n'
import { KDS_STRINGS } from '../../../../shared/kds-strings'

/**
 * Registers the kitchen-display strings under `kds.*` in every language. They live in
 * src/shared/kds-strings.ts because the LAN kitchen page (served to tablets/TVs) uses the
 * exact same dictionary. Imported once for its side effect (App.tsx).
 */
for (const lang of ['en', 'fr', 'ar'] as const) {
  i18n.addResourceBundle(lang, 'translation', { kds: KDS_STRINGS[lang] }, true, false)
}

/** Short beeps for a new kitchen ticket, and a softer chime for a ready number on the board. */
let audio: AudioContext | null = null

function tones(frequencies: number[], step: number, length: number, type: OscillatorType, volume: number): void {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    frequencies.forEach((frequency, index) => {
      const oscillator = audio!.createOscillator()
      const gain = audio!.createGain()
      const start = audio!.currentTime + index * step
      oscillator.type = type
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
      oscillator.connect(gain)
      gain.connect(audio!.destination)
      oscillator.start(start)
      oscillator.stop(start + length + 0.02)
    })
  } catch {
    /* no audio device */
  }
}

export const playNewTicketBeep = (): void => tones([880, 1175], 0.22, 0.18, 'square', 0.25)
export const playReadyChime = (): void => tones([784, 988, 1319], 0.18, 0.5, 'sine', 0.3)
