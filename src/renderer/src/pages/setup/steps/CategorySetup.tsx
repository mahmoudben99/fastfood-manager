import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import type { SetupData } from '../SetupWizard'

const EMOJI_SUGGESTIONS = ['🌮', '🍔', '🥪', '🍕', '🍽️', '📦', '🥤', '🍟', '🥗', '🍗', '🌯', '🧆', '🥙', '🍰', '☕', '🍝', '🥘', '🍲']

const FOOD_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'ar', label: 'العربية', flag: '🇩🇿' }
]

interface Props {
  data: SetupData
  updateData: (partial: Partial<SetupData>) => void
}

export function CategorySetup({ data, updateData }: Props) {
  const { t } = useTranslation()
  const [newName, setNewName] = useState('')

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
    updateData({
      categories: data.categories.filter((_, i) => i !== index)
    })
  }

  const updateCategoryName = (index: number, name: string) => {
    const updated = [...data.categories]
    updated[index] = { ...updated[index], name }
    updateData({ categories: updated })
  }

  const updateCategoryIcon = (index: number, icon: string) => {
    const updated = [...data.categories]
    updated[index] = { ...updated[index], icon }
    updateData({ categories: updated })
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">{t('setup.categories.title')}</h2>
        <p className="text-gray-500 mt-1">{t('setup.categories.subtitle')}</p>
      </div>

      {/* Food name language picker */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-700 mb-3">{t('setup.categories.foodLanguage')}</p>
        <div className="flex gap-2">
          {FOOD_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => updateData({ foodLanguage: lang.code })}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-colors border-2 ${
                data.foodLanguage === lang.code
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span className="text-lg">{lang.flag}</span>
              {lang.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">{t('setup.categories.foodLanguageHint')}</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        {/* Add new */}
        <div className="flex gap-2 mb-4">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('setup.categories.namePlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
          />
          <Button onClick={addCategory} disabled={!newName.trim()}>
            <Plus className="h-4 w-4" />
            {t('setup.categories.add')}
          </Button>
        </div>

        {/* Category list */}
        <div className="space-y-2">
          {data.categories.map((cat, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg border border-gray-200 group"
            >
              {/* Emoji picker */}
              <div className="relative">
                <button
                  className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-xl hover:border-orange-400 transition-colors shrink-0"
                  onClick={() => {
                    const next = EMOJI_SUGGESTIONS[(EMOJI_SUGGESTIONS.indexOf(cat.icon || '🍽️') + 1) % EMOJI_SUGGESTIONS.length]
                    updateCategoryIcon(i, next)
                  }}
                  title="Click to change emoji"
                >
                  {cat.icon || '🍽️'}
                </button>
              </div>
              <input
                value={getCatDisplayName(cat)}
                onChange={(e) => updateCategoryName(i, e.target.value)}
                className="flex-1 bg-transparent border-none focus:outline-none text-sm font-medium text-gray-900"
              />
              <button
                onClick={() => removeCategory(i)}
                className="p-2 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition-opacity"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {data.categories.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">{t('common.noResults')}</p>
        )}
      </div>
    </div>
  )
}
