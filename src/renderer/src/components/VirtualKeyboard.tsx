import { useState } from 'react'
import { Delete, Check, Space, ChevronUp } from 'lucide-react'

interface VirtualKeyboardProps {
  value: string
  onChange: (value: string) => void
  onClose: () => void
  type: 'numeric' | 'text'
  visible: boolean
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

export function VirtualKeyboard({ value, onChange, onClose, type, visible }: VirtualKeyboardProps) {
  const [shifted, setShifted] = useState(false)

  if (!visible) return null

  const handleKey = (key: string) => {
    if (key === 'DEL') {
      onChange(value.slice(0, -1))
    } else if (key === 'C') {
      onChange('')
    } else if (key === 'DONE') {
      onClose()
    } else if (key === 'SHIFT') {
      setShifted(!shifted)
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
        {/* Input preview */}
        <div className="flex items-center gap-2 mb-2 px-2">
          <div className="flex-1 bg-white rounded-lg px-4 py-3 text-lg font-medium text-gray-900 min-h-[48px] flex items-center">
            {value || <span className="text-gray-400">...</span>}
            <span className="animate-pulse text-orange-500 ml-0.5">|</span>
          </div>
          <button
            onClick={onClose}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-6 py-3 font-bold text-lg flex items-center gap-2 active:scale-95 transition-transform"
          >
            <Check className="h-5 w-5" />
            Done
          </button>
        </div>

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
          </div>
        ) : (
          /* Full QWERTY layout */
          <div className="max-w-3xl mx-auto">
            {LETTER_ROWS.map((row, ri) => (
              <div key={ri} className="flex gap-1 mb-1 justify-center">
                {row.map((key) => {
                  const isSpecial = ['SHIFT', 'DEL', 'SPACE', 'DONE'].includes(key)
                  const displayKey = key === 'SHIFT' ? (shifted ? '⬆' : '⇧')
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
                              : key === 'DEL'
                                ? 'flex-[1.4] bg-gray-600 hover:bg-gray-500 text-white'
                                : ri === 0
                                  ? 'flex-1 bg-gray-500 hover:bg-gray-400 text-white'
                                  : 'flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900'
                      }`}
                    >
                      {key === 'DEL' ? <Delete className="h-5 w-5" />
                        : key === 'SPACE' ? <Space className="h-5 w-5" />
                        : key === 'DONE' ? <><Check className="h-5 w-5 mr-1" /> Done</>
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
