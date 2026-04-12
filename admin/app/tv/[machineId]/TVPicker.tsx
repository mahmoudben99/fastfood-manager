'use client'

import { useEffect, useState } from 'react'

// Same gradient palette as the local Ambiance Screen — keep in sync
// with src/renderer/src/pages/ambiance/AmbianceScreen.tsx GRADIENT_PRESETS
const GRADIENT_PRESETS: string[][] = [
  ['#0f0c29', '#302b63', '#24243e'],
  ['#000428', '#004e92', '#000428'],
  ['#1a0a00', '#b33000', '#ff6a00'],
  ['#0a1a0a', '#1b4332', '#2d6a4f'],
  ['#1a0033', '#4a0080', '#7b2ff7'],
  ['#1a0000', '#6b0020', '#c0003a'],
  ['#1a0f00', '#3e2723', '#6d4c41'],
  ['#0a1628', '#1a3a5c', '#2e6b8a'],
  ['#1a0500', '#8b2500', '#d44500'],
  ['#001a1a', '#004d4d', '#008080'],
  ['#1a1400', '#4a3800', '#8b6914'],
  ['#1a0010', '#4a0028', '#8b1460'],
  ['#0d0d0d', '#2c2c2c', '#4a4a4a'],
  ['#1a0a00', '#3d1c00', '#6b3a1f'],
  ['#000000', '#0a0a0a', '#111111'],
  ['#fff1eb', '#ace0f9', '#ffd6a5'],
  ['#fce4ec', '#e8eaf6', '#f3e5f5'],
  ['#e8f5e9', '#b2dfdb', '#c8e6c9'],
  ['#fff3e0', '#ffe0b2', '#ffccbc'],
  ['#e3f2fd', '#bbdefb', '#b3e5fc']
]

interface ProfileEntry {
  name: string
  gradientPreset: number
  accentColor: string
  textColor: string
  restaurantName: string
}

interface Props {
  machineId: string
  profiles: ProfileEntry[]
  forcePicker: boolean
}

const STORAGE_KEY = (machineId: string) => `ffm-tv-picker-${machineId}`

export function TVPicker({ machineId, profiles, forcePicker }: Props) {
  const [autoRedirectIn, setAutoRedirectIn] = useState<number | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)

  // On mount: if a previous choice is remembered and the user didn't force the picker,
  // start a 2-second auto-redirect countdown so the user can cancel.
  useEffect(() => {
    if (forcePicker) return
    try {
      const remembered = localStorage.getItem(STORAGE_KEY(machineId))
      if (remembered && profiles.some((p) => p.name === remembered)) {
        setChosen(remembered)
        setAutoRedirectIn(2)
      }
    } catch {
      /* ignore */
    }
  }, [machineId, profiles, forcePicker])

  // Countdown tick
  useEffect(() => {
    if (autoRedirectIn === null) return
    if (autoRedirectIn <= 0) {
      if (chosen) {
        window.location.href = `/api/tv-html?machineId=${machineId}&profile=${encodeURIComponent(chosen)}`
      }
      return
    }
    const t = setTimeout(() => setAutoRedirectIn((n) => (n === null ? null : n - 1)), 1000)
    return () => clearTimeout(t)
  }, [autoRedirectIn, chosen, machineId])

  const pick = (name: string) => {
    try {
      localStorage.setItem(STORAGE_KEY(machineId), name)
    } catch {
      /* ignore */
    }
    window.location.href = `/api/tv-html?machineId=${machineId}&profile=${encodeURIComponent(name)}`
  }

  const cancelAuto = () => {
    setAutoRedirectIn(null)
    setChosen(null)
    try {
      localStorage.removeItem(STORAGE_KEY(machineId))
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-5xl w-full">
        <header className="mb-10 text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            {profiles[0]?.restaurantName || 'Choose your display'}
          </h1>
          <p className="text-gray-400 mt-2">
            Pick which display this TV should show. Your choice is remembered for next time.
          </p>
        </header>

        {autoRedirectIn !== null && chosen && (
          <div className="mb-6 mx-auto max-w-md bg-orange-500/10 border border-orange-500/40 rounded-xl p-4 text-center">
            <p className="text-sm">
              Loading <span className="font-semibold">{chosen}</span> in {autoRedirectIn}s…
            </p>
            <button
              onClick={cancelAuto}
              className="mt-2 text-orange-300 underline text-sm hover:text-orange-200"
            >
              Tap to choose a different display
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles.map((p) => {
            const grad = GRADIENT_PRESETS[p.gradientPreset] || GRADIENT_PRESETS[0]
            const bg = `linear-gradient(135deg, ${grad[0]}, ${grad[1]}, ${grad[2]})`
            return (
              <button
                key={p.name}
                onClick={() => pick(p.name)}
                className="group relative aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl transition-transform hover:scale-[1.03] focus:outline-none focus:ring-4 focus:ring-orange-500/50"
                style={{ background: bg }}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                  <span
                    className="text-2xl md:text-3xl font-bold drop-shadow-lg"
                    style={{ color: p.textColor }}
                  >
                    {p.name === 'default' ? 'Main Display' : p.name}
                  </span>
                  <span
                    className="mt-2 text-sm uppercase tracking-widest opacity-80"
                    style={{ color: p.accentColor }}
                  >
                    Tap to show
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: p.accentColor }} />
              </button>
            )
          })}
        </div>

        <footer className="text-center text-xs text-gray-500 mt-10">
          {profiles.length} display{profiles.length === 1 ? '' : 's'} configured · machine {machineId.slice(0, 8)}
        </footer>
      </div>
    </div>
  )
}
