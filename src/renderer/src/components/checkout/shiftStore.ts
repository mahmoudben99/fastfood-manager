import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { Shift } from '../../../../shared/shift-report'
import { errorText } from './methods'

interface ShiftState {
  /** Open shift of this register, null = none. */
  shift: Shift | null
  loaded: boolean
  error: string | null
  /** Setting shift_blind_close (approvals.getPolicy().blindClose). */
  blindClose: boolean
  refresh: () => Promise<Shift | null>
  setShift: (shift: Shift | null) => void
}

/** Current shift, shared by every ShiftBar instance (pill + panel stay in sync). */
export const useShiftStore = create<ShiftState>((set) => ({
  shift: null,
  loaded: false,
  error: null,
  blindClose: true,
  refresh: async () => {
    try {
      const [shift, policy] = await Promise.all([
        window.api.shifts.getCurrent(),
        window.api.approvals.getPolicy().catch(() => null)
      ])
      set({ shift, loaded: true, error: null, ...(policy ? { blindClose: policy.blindClose } : {}) })
      return shift
    } catch (error) {
      set({ loaded: true, error: errorText(error, 'Shift unavailable') })
      return null
    }
  },
  setShift: (shift) => set({ shift, loaded: true, error: null })
}))

/** Re-renders every `intervalMs` (elapsed-time labels). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
