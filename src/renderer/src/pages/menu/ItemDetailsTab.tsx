import { useTranslation } from 'react-i18next'
import { ImagePlus, Layers, PackageOpen, Trash2 } from 'lucide-react'
import { Button, Input, Select, Toggle } from '../../components/ui'
import { categoryTint } from '../../theme/categoryColors'
import { CurrencyTag, InlineNotice, parseAmount, useFoodName, useTouchKeyboard } from './catalogShared'
import type { CategoryRow } from './menuTypes'
import { SizeRows, type SizeRow } from './SizeRows'

export type DetailField = 'name' | 'name_ar' | 'name_fr' | 'price'

interface ItemDetailsTabProps {
  isNew: boolean
  fields: Record<DetailField, string>
  setField: (field: DetailField, value: string) => void
  category: string
  setCategory: (value: string) => void
  categories: CategoryRow[]
  emoji: string
  setEmoji: (value: string) => void
  imagePath: string
  setImagePath: (value: string) => void
  onUploadImage: () => void
  multiSize: boolean
  setMultiSize: (value: boolean) => void
  sizes: SizeRow[]
  setSizes: (rows: SizeRow[]) => void
  hasRecipe: boolean
  isCombo: boolean
  setIsCombo: (value: boolean) => void
  /** The item is a combo in the database (turning it off will remove its parts on save). */
  wasCombo: boolean
  showErrors: boolean
}

export function ItemDetailsTab(props: ItemDetailsTabProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const kb = useTouchKeyboard()
  const { fields, setField, showErrors } = props
  const priceInvalid = showErrors && !props.multiSize && !(parseAmount(fields.price) >= 0)

  return (
    <div className="space-y-6">
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label={t('menu.name')} error={showErrors && !fields.name.trim() ? t('menu.form.nameRequired') : undefined} {...kb.bind(fields.name, (v) => setField('name', v))} />
          <Input label={t('menu.nameAr')} dir="rtl" {...kb.bind(fields.name_ar, (v) => setField('name_ar', v), 'text', true)} />
          <Input label={t('menu.nameFr')} {...kb.bind(fields.name_fr, (v) => setField('name_fr', v))} />
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {!props.multiSize && (
          <Input
            label={props.isCombo ? t('menu.form.comboPrice') : t('menu.price')}
            inputMode="decimal"
            className="num text-lg font-bold"
            trailing={<CurrencyTag />}
            error={priceInvalid ? t('menu.invalidPrice') : undefined}
            {...kb.bind(fields.price, (v) => setField('price', v), 'numeric')}
          />
        )}
        <Select
          label={t('menu.category')}
          value={props.category}
          onChange={(e) => props.setCategory(e.target.value)}
          options={props.categories.map((c) => ({ value: String(c.id), label: `${c.icon ? c.icon + ' ' : ''}${getName(c)}` }))}
        />
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-4" title={t('menu.emojiHint')}>
          <div
            className="h-24 w-24 shrink-0 rounded-2xl border border-line overflow-hidden flex items-center justify-center text-5xl"
            style={{ background: categoryTint(Number(props.category) || null, 18) }}
          >
            {props.imagePath ? (
              <img src={`app-image://${props.imagePath}`} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              props.emoji || '🍽️'
            )}
          </div>
          <div className="w-28">
            <Input
              label={t('menu.emoji')}
              value={props.emoji}
              onChange={(e) => props.setEmoji(e.target.value)}
              placeholder="🍔"
              maxLength={8}
              className="text-center"
              style={{ fontSize: '1.5rem' }}
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-6">
            <Button variant="secondary" size="lg" icon={<ImagePlus className="h-5 w-5" />} onClick={props.onUploadImage}>
              {props.imagePath ? t('menu.form.changePhoto') : t('menu.uploadImage')}
            </Button>
            {props.imagePath && (
              <Button variant="ghost" size="lg" icon={<Trash2 className="h-5 w-5" />} onClick={() => props.setImagePath('')}>
                {t('menu.form.removePhoto')}
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface-2/50 divide-y divide-line">
        {props.isNew && (
          <div className="px-4">
            <Toggle
              checked={props.multiSize}
              disabled={props.isCombo}
              onChange={(v) => props.setMultiSize(v)}
              label={
                <span className="inline-flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary-ink" />
                  {t('menu.sizes.toggle')}
                </span>
              }
            />
          </div>
        )}
        {props.multiSize && props.isNew && (
          <div className="p-4">
            <SizeRows sizes={props.sizes} onChange={props.setSizes} hasRecipe={props.hasRecipe} />
          </div>
        )}
        <div className="px-4" title={t('menu.form.isComboHint')}>
          <Toggle
            checked={props.isCombo}
            disabled={props.multiSize}
            onChange={(v) => props.setIsCombo(v)}
            label={
              <span className="inline-flex items-center gap-2">
                <PackageOpen className="h-4 w-4 text-primary-ink" />
                {t('menu.form.isCombo')}
              </span>
            }
          />
        </div>
        {props.wasCombo && !props.isCombo && (
          <div className="p-4">
            <InlineNotice tone="warning">{t('menu.form.uncomboWarning')}</InlineNotice>
          </div>
        )}
      </section>
      {kb.keyboard}
    </div>
  )
}
