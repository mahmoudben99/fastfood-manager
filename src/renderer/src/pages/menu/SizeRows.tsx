import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'

export interface SizeRow {
  label: string
  price: string
  /** Recipe multiplier for this size, as typed ("1", "1.5", "0,75"). */
  multiplier: string
}

export const PRESET_SIZES = ['S', 'M', 'L', 'XL']

export function presetSizeRows(): SizeRow[] {
  return PRESET_SIZES.map((label) => ({ label, price: '', multiplier: '1' }))
}

interface SizeRowsProps {
  sizes: SizeRow[]
  onChange: (sizes: SizeRow[]) => void
  hasRecipe: boolean
}

const inputClass =
  'border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'

export function SizeRows({ sizes, onChange, hasRecipe }: SizeRowsProps) {
  const { t } = useTranslation()
  const update = (index: number, patch: Partial<SizeRow>) =>
    onChange(sizes.map((size, i) => (i === index ? { ...size, ...patch } : size)))

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{t('menu.sizes.title')}</label>
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        <span className="w-24">{t('menu.sizes.label')}</span>
        <span className="flex-1">{t('menu.price')}</span>
        <span className="w-28">{t('menu.sizes.multiplier')}</span>
        <span className="w-8" />
      </div>
      {sizes.map((size, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={size.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder={t('menu.sizes.label')}
            className={`w-24 ${inputClass}`}
          />
          <input
            type="number"
            value={size.price}
            onChange={(e) => update(i, { price: e.target.value })}
            placeholder={t('menu.price')}
            step="0.01"
            min="0"
            className={`flex-1 ${inputClass}`}
          />
          <div className="w-28 flex items-center gap-1">
            <span className="text-gray-400 text-sm">×</span>
            <input
              type="text"
              inputMode="decimal"
              value={size.multiplier}
              onChange={(e) => update(i, { multiplier: e.target.value })}
              placeholder="1"
              className={`w-full ${inputClass}`}
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(sizes.filter((_, idx) => idx !== i))}
            className="w-8 p-2 hover:bg-red-100 rounded text-gray-400 hover:text-red-500"
            title={t('common.remove')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <p className="text-xs text-gray-500">
        {hasRecipe ? t('menu.sizes.multiplierHint') : t('menu.sizes.multiplierNoRecipe')}
      </p>
      <button
        type="button"
        onClick={() => onChange([...sizes, { label: '', price: '', multiplier: '1' }])}
        className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 font-medium"
      >
        <Plus className="h-4 w-4" />
        {t('menu.sizes.add')}
      </button>
    </div>
  )
}
