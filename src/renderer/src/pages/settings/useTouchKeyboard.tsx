import { ChangeEvent, ReactNode, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'

interface FieldOptions {
  type?: 'text' | 'numeric'
  /** Applied to every keystroke (e.g. digits only for PINs). */
  transform?: (value: string) => string
  /** Text keyboard: symbols row + Arabic/Latin toggle (default: true for text). */
  extended?: boolean
  layout?: 'latin' | 'arabic'
}

interface Registered {
  value: string
  set: (value: string) => void
  opts: FieldOptions
}

/**
 * Touch-mode text entry for a settings section. `bind()` returns the props for an <Input>:
 * keyboard mode → normal onChange; touch mode → read-only field that opens the on-screen keyboard.
 * Call `keyboard()` as the LAST child of the same component so it sees this render's values.
 */
export function useTouchKeyboard() {
  const isTouch = useAppStore((s) => s.inputMode) === 'touchscreen'
  const [active, setActive] = useState<string | null>(null)
  const fields = useRef<Record<string, Registered>>({})

  const register = (key: string, value: string, set: (value: string) => void, opts: FieldOptions = {}) => {
    fields.current[key] = { value, set, opts }
  }

  const bind = (key: string, value: string, set: (value: string) => void, opts: FieldOptions = {}) => {
    register(key, value, set, opts)
    if (isTouch) return { value, readOnly: true, onClick: () => setActive(key) }
    return {
      value,
      onChange: (e: ChangeEvent<HTMLInputElement>) => set(opts.transform ? opts.transform(e.target.value) : e.target.value)
    }
  }

  const keyboard = (): ReactNode => {
    if (!isTouch || !active) return null
    const field = fields.current[active]
    if (!field) return null
    const type = field.opts.type ?? 'text'
    return (
      <VirtualKeyboard
        visible
        type={type}
        extended={field.opts.extended ?? type === 'text'}
        initialLayout={field.opts.layout}
        value={field.value}
        onChange={(v) => field.set(field.opts.transform ? field.opts.transform(v) : v)}
        onClose={() => setActive(null)}
      />
    )
  }

  return { isTouch, bind, register, open: setActive, close: () => setActive(null), keyboard }
}

export const digitsOnly = (v: string) => v.replace(/\D/g, '')
