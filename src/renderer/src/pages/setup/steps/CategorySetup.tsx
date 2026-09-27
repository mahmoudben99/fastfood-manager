import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, LayoutGrid, Plus, X } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { IconButton } from '../../../components/ui/IconButton'
import { Input } from '../../../components/ui/Input'
import { SegmentedControl } from '../../../components/ui/SegmentedControl'
import { EmptyState } from '../../../components/ui/EmptyState'
import { VirtualKeyboard } from '../../../components/VirtualKeyboard'
import { StepLayout } from '../parts/StepLayout'
import type { SetupData } from '../SetupWizard'

const EMOJI_SUGGESTIONS = ['🌮', '🍔', '🥪', '🍕', '🍽️', '📦', '🥤', '🍟', '🥗', '🍗', '🌯', '🧆', '🥙', '🍰', '☕', '🍝', '🥘', '🍲']

const FOOD_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' }
]

interface Props {
  data: SetupData
  updateData: (partial: Partial<SetupData>) => void
}

/** Touch mode: which text the on-screen keyboard is editing (the "new" field or a category row). */
type KeyboardTarget = { kind: 'new' } | { kind: 'category'; index: number }

export function CategorySetup({ data, updateData }: Props) {
  const { t } = useTranslation()
  const [newName, setNewName] = useState('')
  const isTouch = data.inputMode === 'touchscreen'
  const [keyboardTarget, setKeyboardTarget] = useState<KeyboardTarget | null>(null)

  const getCatDisplayName = (cat: { name: string; name_ar?: string; name_fr?: string }) => {
    if (data.foodLanguage === 'ar' && cat.name_ar) return cat.name_ar
    if (data.foodLanguage === 'fr' && cat.name_fr) return cat.name_fr
    return cat.name
  }

  const addCategory = () => {
    if (!newName.trim()) return
    updateData({
      categories: [...data.categories, { name: newName.trim(), icon: '🍽️' }]
    })
    setNewName('')
  }

  const removeCategory = (index: number) => {
    setKeyboardTarget(null)
    updateData({
      categories: data.categories.filter((_, i) => i !== index)
    })
  }

  const updateCategoryName = (index: number, value: string) => {
    const updated = [...data.categories]
    // Write the field that's actually being displayed/edited for the chosen food language,
    // otherwise (in ar/fr) the keystroke landed on the English `name` while the input showed
    // name_ar/name_fr, so edits silently vanished on the next render.
    const cat = { ...updated[index] }
    if (data.foodLanguage === 'ar') cat.name_ar = value
    else if (data.foodLanguage === 'fr') cat.name_fr = value
    else cat.name = value
    updated[index] = cat
    updateData({ categories: updated })
  }

  const updateCategoryIcon = (index: number, icon: string) => {
    const updated = [...data.categories]
    updated[index] = { ...updated[index], icon }
    updateData({ categories: updated })
  }

  const keyboardValue = (): string => {
    if (!keyboardTarget) return ''
    if (keyboardTarget.kind === 'new') return newName
    const cat = data.categories[keyboardTarget.index]
    return cat ? getCatDisplayName(cat) : ''
  }

  const handleKeyboardChange = (value: string) => {
    if (!keyboardTarget) return
    if (keyboardTarget.kind === 'new') setNewName(value)
    else if (data.categories[keyboardTarget.index]) updateCategoryName(keyboardTarget.index, value)
  }

  return (
    <StepLayout icon={<LayoutGrid />} title={t('setup.categories.title')}>
      {/* Food name language picker (the long explanation lives in the info tooltip) */}
      <section>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-2">
          {t('setup.categories.foodLanguage')}
          <span
            role="img"
            aria-label={t('setup.categories.foodLanguageHint')}
            title={t('setup.categories.foodLanguageHint')}
            className="inline-flex text-muted"
          >
            <Info className="h-4 w-4" />
          </span>
        </p>
        <div dir="ltr">
          <SegmentedControl
            size="lg"
            fullWidth
            value={data.foodLanguage}
            onChange={(value) => updateData({ foodLanguage: value })}
            options={FOOD_LANGUAGES}
            ariaLabel={t('setup.categories.foodLanguage')}
          />
        </div>
      </section>

      <section className="mt-5 border-t border-line pt-5">
        {/* Add new */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <Input
              inputSize="lg"
              dir="auto"
              value={newName}
              readOnly={isTouch}
              onClick={isTouch ? () => setKeyboardTarget({ kind: 'new' }) : undefined}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('setup.categories.namePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
              className={isTouch ? 'cursor-pointer' : undefined}
            />
          </div>
          <Button variant="soft" size="lg" onClick={addCategory} disabled={!newName.trim()} icon={<Plus className="h-5 w-5" />}>
            {t('setup.categories.add')}
          </Button>
        </div>

        {/* Category list */}
        {data.categories.length > 0 ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.categories.map((cat, i) => (
              <li
                key={i}
                className="contain-card flex items-center gap-2 rounded-2xl border border-line bg-surface-2 p-2 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15"
              >
                {/* Emoji: tap cycles through the suggestions */}
                <button
                  type="button"
                  className="tap h-12 w-12 shrink-0 rounded-xl border border-line bg-surface text-2xl flex items-center justify-center hover:border-primary"
                  onClick={() => {
                    const next = EMOJI_SUGGESTIONS[(EMOJI_SUGGESTIONS.indexOf(cat.icon || '🍽️') + 1) % EMOJI_SUGGESTIONS.length]
                    updateCategoryIcon(i, next)
                  }}
                  aria-label={t('setup.categories.changeIcon')}
                  title={t('setup.categories.changeIcon')}
                >
                  {cat.icon || '🍽️'}
                </button>
                <input
                  data-ui="input"
                  dir="auto"
                  value={getCatDisplayName(cat)}
                  readOnly={isTouch}
                  onClick={isTouch ? () => setKeyboardTarget({ kind: 'category', index: i }) : undefined}
                  onChange={(e) => updateCategoryName(i, e.target.value)}
                  aria-label={t('setup.categories.namePlaceholder')}
                  className="min-h-12 min-w-0 flex-1 bg-transparent px-2 text-base font-semibold text-ink focus:outline-none"
                />
                <IconButton
                  icon={<X />}
                  label={t('common.remove')}
                  variant="danger"
                  size="lg"
                  onClick={() => removeCategory(i)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={<LayoutGrid />}
            title={t('setup.categories.empty')}
            description={t('setup.hint.categories')}
          />
        )}
      </section>

      {/* Virtual Keyboard for touchscreen mode (category names can be Arabic) */}
      {isTouch && keyboardTarget && (
        <VirtualKeyboard
          visible
          type="text"
          extended
          initialLayout={data.foodLanguage === 'ar' ? 'arabic' : 'latin'}
          value={keyboardValue()}
          onChange={handleKeyboardChange}
          onClose={() => setKeyboardTarget(null)}
        />
      )}
    </StepLayout>
  )
}
