import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Delete, Check, Space, ArrowBigUp, Languages } from 'lucide-react'
import { cn } from './ui/cn'

interface VirtualKeyboardProps {
  value: string
  onChange: (value: string) => void
  onClose: () => void
  type: 'numeric' | 'text'
  visible: boolean
  /** Text keyboard only: adds a symbols row (@ . / : …) and an Arabic/Latin layout toggle. */
  extended?: boolean
  /** Text keyboard only: layout shown first (Arabic requires `extended` to switch back). */
  initialLayout?: 'latin' | 'arabic'
}

const NUM_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['C', '0', '.', 'DEL']
]

const LETTER_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DEL'],
  ['SPACE', 'DONE']
]

const ARABIC_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['أ', 'إ', 'آ', 'ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز'],
  ['ظ', 'د', 'ذ', 'DEL']
]

const SYMBOL_ROW = ['@', '.', '-', '_', '/', ':', '#', '&', '!', '?', ',']

const SPECIAL_KEYS = ['SHIFT', 'DEL', 'SPACE', 'DONE', 'LANG']

// Key looks (tokens only, so the panel follows light/dark by itself).
// Height is set per keyboard (h-14 = 56px text keys, h-16 = 64px numpad): cn() does not dedupe.
// Short screens (<= 800px tall: 1366x768 / 1280x720 windows) drop one step (48 / 56px) so the
// 7-row Arabic layout leaves room for the field being edited. (Literal classes: Tailwind scans text.)
const KEY_BASE =
  'tap rounded-xl font-semibold flex items-center justify-center select-none focus-visible:outline-2 focus-visible:outline-focus'
const KEY_CHAR = 'bg-surface text-ink border border-line shadow-e1 hover:bg-surface-2 active:bg-surface-3'
const KEY_DIGIT = 'bg-surface-3 text-ink border border-line hover:brightness-95 active:brightness-90'
const KEY_FN = 'bg-surface-3 text-ink-2 border border-line-strong hover:text-ink active:brightness-95'
const KEY_DONE = 'bg-ember text-on-primary shadow-glow hover:brightness-[1.07] active:brightness-95'

export function VirtualKeyboard({ value, onChange, onClose, type, visible, extended = false, initialLayout = 'latin' }: VirtualKeyboardProps) {
  const { t } = useTranslation()
  const [shifted, setShifted] = useState(false)
  const [layout, setLayout] = useState<'latin' | 'arabic'>(initialLayout)

  // Each field can ask for its own layout (e.g. the Arabic text of a receipt block).
  useEffect(() => {
    setLayout(initialLayout)
  }, [initialLayout])

  // Scroll the active input into view above the keyboard
  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        const active = document.activeElement as HTMLElement
        if (active && active.tagName !== 'BODY' && active.tagName !== 'BUTTON') {
          active.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 150)
    }
  }, [visible])

  if (!visible) return null

  const handleKey = (key: string) => {
    if (key === 'DEL') {
      onChange(value.slice(0, -1))
    } else if (key === 'C' && type === 'numeric') {
      // 'C' is the numpad's clear key. On the text keyboard it is the letter C — it used to wipe
      // the whole field instead of typing "c".
      onChange('')
    } else if (key === 'DONE') {
      onClose()
    } else if (key === 'SHIFT') {
      setShifted(!shifted)
    } else if (key === 'LANG') {
      setLayout(layout === 'latin' ? 'arabic' : 'latin')
    } else if (key === 'SPACE') {
      onChange(value + ' ')
    } else if (key === '.') {
      onChange(value + '.')
    } else {
      const char = shifted ? key.toUpperCase() : key.toLowerCase()
      onChange(value + char)
      if (shifted) setShifted(false)
    }
  }

  const doneLabel = t('ui.keyboard.done')

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end" onClick={onClose}>
      {/* Light scrim: the field being edited stays readable above the panel */}
      <div className="absolute inset-0 bg-overlay/50 animate-fade-in" />

      {/* Keyboard panel. Keys are always laid out LTR (QWERTY / Arabic keyboards / numpad are
          physical layouts), so an Arabic UI doesn't mirror them. */}
      <div
        role="group"
        aria-label={t('ui.keyboard.label')}
        dir="ltr"
        className="relative rounded-t-3xl border-t border-line bg-surface-2 px-3 pt-3 pb-3 shadow-e4 animate-slide-up-keyboard"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line-strong [@media(max-height:800px)]:hidden" />
        {type === 'numeric' ? (
          /* Numpad layout */
          <div className="mx-auto max-w-sm">
            {NUM_ROWS.map((row, ri) => (
              <div key={ri} className="mb-2 flex justify-center gap-2">
                {row.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKey(key)}
                    aria-label={key === 'DEL' ? t('ui.keyboard.backspace') : key === 'C' ? t('ui.keyboard.clear') : undefined}
                    className={cn(
                      KEY_BASE,
                      'num h-16 flex-1 text-2xl [@media(max-height:800px)]:h-14',
                      key === 'C'
                        ? 'bg-danger-soft text-danger-ink border border-line hover:brightness-95'
                        : key === 'DEL'
                          ? KEY_FN
                          : KEY_CHAR
                    )}
                  >
                    {key === 'DEL' ? <Delete className="h-7 w-7" /> : key}
                  </button>
                ))}
              </div>
            ))}
            {/* Done button */}
            <button type="button" onClick={onClose} className={cn(KEY_BASE, KEY_DONE, 'mt-1 h-14 w-full gap-2 text-xl [@media(max-height:800px)]:h-12')}>
              <Check className="h-6 w-6" strokeWidth={2.5} />
              {doneLabel}
            </button>
          </div>
        ) : (
          /* Full QWERTY / Arabic layout */
          <div className="mx-auto max-w-4xl">
            {textRows(layout, extended).map((row, ri) => (
              <div key={ri} className="mb-1.5 flex justify-center gap-1.5">
                {row.map((key) => {
                  const isSpecial = SPECIAL_KEYS.includes(key)
                  const displayKey = key === 'LANG' ? (layout === 'latin' ? 'ع' : 'ABC') : shifted ? key : key.toLowerCase()
                  const label =
                    key === 'DEL' ? t('ui.keyboard.backspace')
                      : key === 'SPACE' ? t('ui.keyboard.space')
                      : key === 'SHIFT' ? t('ui.keyboard.shift')
                      : key === 'LANG' ? t('ui.keyboard.switchLayout')
                      : undefined

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleKey(key)}
                      aria-label={label}
                      aria-pressed={key === 'SHIFT' ? shifted : undefined}
                      className={cn(
                        KEY_BASE,
                        'h-14 min-w-0 text-lg [@media(max-height:800px)]:h-12',
                        key === 'SPACE'
                          ? cn('flex-[4]', KEY_CHAR)
                          : key === 'DONE'
                            ? cn('flex-[2] gap-1.5', KEY_DONE)
                            : key === 'SHIFT'
                              ? cn('flex-[1.4]', shifted ? 'bg-primary-soft-2 text-primary-ink border border-primary/40' : KEY_FN)
                              : key === 'LANG'
                                ? cn('flex-[1.4] gap-1.5', KEY_FN)
                                : key === 'DEL'
                                  ? cn('flex-[1.4]', KEY_FN)
                                  : ri === 0 && !isSpecial
                                    ? cn('num flex-1', KEY_DIGIT)
                                    : cn('flex-1', KEY_CHAR)
                      )}
                    >
                      {key === 'DEL' ? <Delete className="h-6 w-6" />
                        : key === 'SPACE' ? <Space className="h-6 w-6" />
                        : key === 'DONE' ? <><Check className="h-5 w-5" strokeWidth={2.5} />{doneLabel}</>
                        : key === 'SHIFT' ? <ArrowBigUp className={cn('h-6 w-6', shifted && 'fill-current')} />
                        : key === 'LANG' ? <><Languages className="h-5 w-5" />{displayKey}</>
                        : displayKey}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Rows of the text keyboard. The default (non-extended) layout is unchanged for existing screens. */
function textRows(layout: 'latin' | 'arabic', extended: boolean): string[][] {
  if (!extended) return LETTER_ROWS
  const base = layout === 'arabic' ? ARABIC_ROWS : LETTER_ROWS.slice(0, -1)
  return [...base, SYMBOL_ROW, ['LANG', 'SPACE', 'DONE']]
}
