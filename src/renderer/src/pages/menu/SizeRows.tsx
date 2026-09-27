import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Button, IconButton, Input } from '../../components/ui'
import { CurrencyTag, useTouchKeyboard } from './catalogShared'

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

/** New item in several sizes: one menu item per size (label, price, recipe multiplier). */
export function SizeRows({ sizes, onChange, hasRecipe }: SizeRowsProps) {
  const { t } = useTranslation()
  const kb = useTouchKeyboard()
  const update = (index: number, patch: Partial<SizeRow>) =>
    onChange(sizes.map((size, i) => (i === index ? { ...size, ...patch } : size)))

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-ink">{t('menu.sizes.title')}</p>
      <div className="grid grid-cols-[6rem_1fr_7.5rem_2.75rem] gap-2 text-xs font-semibold text-muted px-1">
        <span>{t('menu.sizes.label')}</span>
        <span>{t('menu.price')}</span>
        <span>{t('menu.sizes.multiplier')}</span>
        <span />
      </div>
      {sizes.map((size, i) => (
        <div key={i} className="grid grid-cols-[6rem_1fr_7.5rem_2.75rem] gap-2 items-center">
          <Input aria-label={t('menu.sizes.label')} placeholder={t('menu.sizes.label')} className="text-center font-bold" {...kb.bind(size.label, (v) => update(i, { label: v }))} />
          <Input aria-label={t('menu.price')} placeholder="0" inputMode="decimal" className="num" trailing={<CurrencyTag />} {...kb.bind(size.price, (v) => update(i, { price: v }), 'numeric')} />
          <Input aria-label={t('menu.sizes.multiplier')} placeholder="1" inputMode="decimal" className="num" leading={<span className="text-sm font-bold">×</span>} {...kb.bind(size.multiplier, (v) => update(i, { multiplier: v }), 'numeric')} />
          <IconButton icon={<Trash2 />} variant="danger" label={t('common.remove')} onClick={() => onChange(sizes.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <p className="text-xs text-muted">{hasRecipe ? t('menu.sizes.multiplierHint') : t('menu.sizes.multiplierNoRecipe')}</p>
      <Button variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => onChange([...sizes, { label: '', price: '', multiplier: '1' }])}>
        {t('menu.sizes.add')}
      </Button>
      {kb.keyboard}
    </div>
  )
}
