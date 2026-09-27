import { useState, useEffect } from 'react'
import { Delete, Check, Space, ChevronUp } from 'lucide-react'

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

export function VirtualKeyboard({ value, onChange, onClose, type, visible, extended = false, initialLayout = 'latin' }: VirtualKeyboardProps) {
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

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end" onClick={onClose}>
      {/* Translucent backdrop */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Keyboard panel */}
      <div
        className="relative bg-gray-800 border-t border-gray-600 p-2 animate-slide-up-keyboard"
        onClick={(e) => e.stopPropagation()}
      >
        {type === 'numeric' ? (
          /* Numpad layout */
          <div className="max-w-xs mx-auto">
            {NUM_ROWS.map((row, ri) => (
              <div key={ri} className="flex gap-2 mb-2 justify-center">
                {row.map((key) => (
                  <button
                    key={key}
                    onClick={() => handleKey(key)}
                    className={`flex-1 max-w-[80px] h-14 rounded-lg font-bold text-xl flex items-center justify-center active:scale-95 transition-all ${
                      key === 'C'
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : key === 'DEL'
                          ? 'bg-gray-600 hover:bg-gray-500 text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                    }`}
                  >
                    {key === 'DEL' ? <Delete className="h-6 w-6" /> : key}
                  </button>
                ))}
              </div>
            ))}
            {/* Done button */}
            <button
              onClick={onClose}
              className="w-full h-14 rounded-lg font-bold text-xl bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center gap-2 active:scale-95 transition-all mt-1"
            >
              <Check className="h-6 w-6" />
              Done
            </button>
          </div>
        ) : (
          /* Full QWERTY layout */
          <div className="max-w-3xl mx-auto">
            {textRows(layout, extended).map((row, ri) => (
              <div key={ri} className="flex gap-1 mb-1 justify-center">
                {row.map((key) => {
                  const isSpecial = ['SHIFT', 'DEL', 'SPACE', 'DONE', 'LANG'].includes(key)
                  const displayKey = key === 'SHIFT' ? (shifted ? '⬆' : '⇧')
                    : key === 'LANG' ? (layout === 'latin' ? 'ع' : 'ABC')
                    : key === 'DEL' ? '' : key === 'SPACE' ? '' : key === 'DONE' ? '' : (shifted ? key : key.toLowerCase())

                  return (
                    <button
                      key={key}
                      onClick={() => handleKey(key)}
                      className={`h-12 rounded-lg font-semibold text-base flex items-center justify-center active:scale-95 transition-all ${
                        key === 'SPACE'
                          ? 'flex-[4] bg-gray-100 hover:bg-gray-200 text-gray-500'
                          : key === 'DONE'
                            ? 'flex-[2] bg-orange-500 hover:bg-orange-600 text-white'
                            : key === 'SHIFT'
                              ? `flex-[1.4] ${shifted ? 'bg-orange-400 text-white' : 'bg-gray-600 hover:bg-gray-500 text-white'}`
                              : key === 'LANG'
                                ? 'flex-[1.4] bg-gray-600 hover:bg-gray-500 text-white'
                              : key === 'DEL'
                                ? 'flex-[1.4] bg-gray-600 hover:bg-gray-500 text-white'
                                : ri === 0
                                  ? 'flex-1 bg-gray-500 hover:bg-gray-400 text-white'
                                  : 'flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900'
                      }`}
                    >
                      {key === 'DEL' ? <Delete className="h-5 w-5" />
                        : key === 'SPACE' ? <Space className="h-5 w-5" />
                        : key === 'DONE' ? <><Check className="h-5 w-5 me-1" /> Done</>
                        : key === 'SHIFT' ? <ChevronUp className="h-5 w-5" />
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
