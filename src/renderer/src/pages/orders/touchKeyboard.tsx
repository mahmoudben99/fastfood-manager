import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'
import { useAppStore } from '../../store/appStore'

/**
 * On-screen keyboard for touch mode. A field opens it with its current value and a setter; the
 * host keeps the value it is editing, so fields backed by local state and by the store both work.
 * Setters must be stable or functional (never close over a stale object).
 */
interface KeyboardTarget {
  type: 'numeric' | 'text'
  value: string
  onChange: (value: string) => void
}

interface TouchKeyboardApi {
  enabled: boolean
  open: (target: KeyboardTarget) => void
  close: () => void
}

const TouchKeyboardContext = createContext<TouchKeyboardApi>({ enabled: false, open: () => {}, close: () => {} })

export function TouchKeyboardProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [target, setTarget] = useState<KeyboardTarget | null>(null)
  const language = useAppStore((s) => s.language)
  const open = useCallback((next: KeyboardTarget) => setTarget(next), [])
  const close = useCallback(() => setTarget(null), [])
  const api = useMemo(() => ({ enabled, open, close }), [enabled, open, close])
  return (
    <TouchKeyboardContext.Provider value={api}>
      {children}
      {enabled && target && (
        <VirtualKeyboard
          visible
          type={target.type}
          value={target.value}
          extended={target.type === 'text'}
          initialLayout={language === 'ar' && target.type === 'text' ? 'arabic' : 'latin'}
          onChange={(value) => {
            target.onChange(value)
            setTarget((t) => (t ? { ...t, value } : t))
          }}
          onClose={close}
        />
      )}
    </TouchKeyboardContext.Provider>
  )
}

export function useTouchKeyboard(): TouchKeyboardApi {
  return useContext(TouchKeyboardContext)
}

/**
 * Props for a text field: in touch mode the field is read-only and a tap opens the on-screen
 * keyboard; with a physical keyboard it is a normal controlled input.
 */
export function useTouchField(
  value: string,
  onChange: (value: string) => void,
  type: 'numeric' | 'text' = 'text'
): { value: string; readOnly?: boolean; onClick?: () => void; onChange: (e: { target: { value: string } }) => void } {
  const kb = useTouchKeyboard()
  return {
    value,
    onChange: (e) => onChange(e.target.value),
    ...(kb.enabled ? { readOnly: true, onClick: () => kb.open({ type, value, onChange }) } : {})
  }
}
