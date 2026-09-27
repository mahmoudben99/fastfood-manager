import { ChangeEvent, ReactNode, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { VirtualKeyboard } from '../VirtualKeyboard'
import { useAppStore } from '../../store/appStore'

interface Target {
  id: string
  type: 'text' | 'numeric'
  value: string
  set: (value: string) => void
}

export interface TouchFieldProps {
  value: string
  readOnly?: boolean
  inputMode?: 'none' | 'text' | 'tel' | 'numeric'
  onChange?: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onClick?: () => void
  'data-kb-active'?: boolean
}

/**
 * Text fields that work on a touch till: in touchscreen mode (setting input_mode) a tap opens the
 * app's VirtualKeyboard (Arabic layout first in Arabic), otherwise the field is a normal input.
 * Usage: `const kb = useTouchKeyboard()` · `<Input {...kb.field('name', name, setName)} />` · `{kb.keyboard}`.
 */
export function useTouchKeyboard(): {
  isTouch: boolean
  field: (id: string, value: string, set: (value: string) => void, type?: 'text' | 'numeric') => TouchFieldProps
  keyboard: ReactNode
  close: () => void
} {
  const { i18n } = useTranslation()
  const isTouch = useAppStore((s) => s.inputMode === 'touchscreen')
  const [target, setTarget] = useState<Target | null>(null)
  const close = useCallback(() => setTarget(null), [])

  const field = (id: string, value: string, set: (value: string) => void, type: 'text' | 'numeric' = 'text'): TouchFieldProps =>
    isTouch
      ? {
          value,
          readOnly: true,
          inputMode: 'none',
          onClick: () => setTarget({ id, type, value, set }),
          'data-kb-active': target?.id === id || undefined
        }
      : { value, onChange: (event) => set(event.target.value) }

  const keyboard = isTouch && target ? (
    <VirtualKeyboard
      visible
      type={target.type}
      extended={target.type === 'text'}
      initialLayout={i18n.language === 'ar' ? 'arabic' : 'latin'}
      value={target.value}
      onChange={(value) => {
        target.set(value)
        setTarget({ ...target, value })
      }}
      onClose={close}
    />
  ) : null

  return { isTouch, field, keyboard, close }
}
