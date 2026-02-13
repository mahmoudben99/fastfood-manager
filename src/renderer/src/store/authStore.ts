import { create } from 'zustand'

interface AuthState {
  isUnlocked: boolean
  unlockTimestamp: number | null
  unlock: () => void
  lock: () => void
  checkAutoLock: () => void
}

const AUTO_LOCK_MS = 10 * 60 * 1000 // 10 minutes

export const useAuthStore = create<AuthState>((set, get) => ({
  isUnlocked: false,
  unlockTimestamp: null,

  unlock: () => set({ isUnlocked: true, unlockTimestamp: Date.now() }),

  lock: () => set({ isUnlocked: false, unlockTimestamp: null }),

  checkAutoLock: () => {
    const { isUnlocked, unlockTimestamp } = get()
    if (isUnlocked && unlockTimestamp && Date.now() - unlockTimestamp > AUTO_LOCK_MS) {
      set({ isUnlocked: false, unlockTimestamp: null })
    }
  }
}))
