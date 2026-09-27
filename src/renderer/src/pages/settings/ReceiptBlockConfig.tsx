import { useTranslation } from 'react-i18next'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Hash,
  Image,
  ListOrdered,
  Minus,
  Pencil,
  QrCode,
  Share2,
  Sparkles,
  Type
} from 'lucide-react'
import { Button, Field, Input, SegmentedControl, Select, Toggle } from '../../components/ui'
import type { SocialMediaEntry } from '../../../../shared/settings-rules'

export interface BlockConfig {
  fontSize?: 'small' | 'medium' | 'large'
  alignment?: 'left' | 'center' | 'right'
  bold?: boolean
  text?: string
  textAr?: string
  textFr?: string
  decorationType?: string
  qrContent?: string
  /** URL encoded into the QR block. Read by printer.ipc.ts `case 'qr_code'`. */
  qrUrl?: string
  customValue?: string
  language?: string
}

export interface Block {
  id: string
  type: string
  enabled: boolean
  config: BlockConfig
  sortOrder: number
}

export type BlockTextField = 'text' | 'textAr' | 'textFr' | 'qrUrl'

export const BLOCK_TYPES = [
  { value: 'logo', icon: Image },
  { value: 'restaurant_name', icon: Type },
  { value: 'order_details', icon: ListOrdered },
  { value: 'items_table', icon: Hash },
  { value: 'total', icon: Hash },
  { value: 'qr_code', icon: QrCode },
  { value: 'social_media', icon: Share2 },
  { value: 'custom_text', icon: Type },
  { value: 'divider', icon: Minus },
  { value: 'edge_decoration', icon: Sparkles }
]

interface ReceiptBlockConfigProps {
  block: Block
  onChange: (key: keyof BlockConfig, value: unknown) => void
  socialMedia: SocialMediaEntry[]
  logoDataUrl: string | null
  onEditSocial: () => void
  isTouch: boolean
  onRequestKeyboard: (field: BlockTextField) => void
}

type FontSize = NonNullable<BlockConfig['fontSize']>
type Alignment = NonNullable<BlockConfig['alignment']>

/** Expanded options of one receipt block (inside the block list). */
export function ReceiptBlockConfig({ block, onChange, socialMedia, logoDataUrl, onEditSocial, isTouch, onRequestKeyboard }: ReceiptBlockConfigProps) {
  const { t } = useTranslation()
  const { type, config } = block

  // Touch mode: fields are read-only and open the on-screen keyboard instead.
  const textInput = (field: BlockTextField, label: string, extra?: { dir?: string; placeholder?: string }) => (
    <Input
      label={label}
      placeholder={extra?.placeholder}
      value={config[field] || ''}
      readOnly={isTouch}
      onClick={isTouch ? () => onRequestKeyboard(field) : undefined}
      onChange={isTouch ? undefined : (e) => onChange(field, e.target.value)}
      dir={extra?.dir}
    />
  )

  const styleSelect = (fallback: string, values: string[]) => (
    <div className="max-w-xs">
      <Select
        label={t('receiptEditor.style')}
        value={config.decorationType || fallback}
        onChange={(e) => onChange('decorationType', e.target.value)}
        options={values.map((v) => ({ value: v, label: t(`receiptEditor.styles.${v === 'none' ? 'line' : v === 'food-emoji' ? 'foodEmoji' : v}`) }))}
      />
    </div>
  )

  return (
    <div className="space-y-4 rounded-b-xl border-t border-line bg-surface-2 p-4">
      {/* Common options — hidden for types that don't use them */}
      {!['divider', 'edge_decoration', 'logo'].includes(type) && (
        <>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Field label={t('receiptEditor.size')}>
              <SegmentedControl<FontSize>
                fullWidth
                size={isTouch ? 'md' : 'sm'}
                ariaLabel={t('receiptEditor.size')}
                value={config.fontSize || 'medium'}
                onChange={(v) => onChange('fontSize', v)}
                options={[
                  { value: 'small', label: t('settings.fontSmall') },
                  { value: 'medium', label: t('settings.fontMedium') },
                  { value: 'large', label: t('settings.fontLarge') }
                ]}
              />
            </Field>
            <Field label={t('receiptEditor.align')}>
              {/* Paper alignment (not reading direction): icons are never mirrored. The printer centres
                  blocks with no alignment set, so the control must show that too. */}
              <SegmentedControl<Alignment>
                fullWidth
                size={isTouch ? 'md' : 'sm'}
                ariaLabel={t('receiptEditor.align')}
                value={config.alignment || 'center'}
                onChange={(v) => onChange('alignment', v)}
                options={[
                  { value: 'left', label: null, icon: <AlignLeft />, ariaLabel: t('receiptEditor.alignLeft') },
                  { value: 'center', label: null, icon: <AlignCenter />, ariaLabel: t('receiptEditor.alignCenter') },
                  { value: 'right', label: null, icon: <AlignRight />, ariaLabel: t('receiptEditor.alignRight') }
                ]}
              />
            </Field>
          </div>
          <div className="grid gap-x-6 sm:grid-cols-2">
            {type !== 'qr_code' && (
              <Toggle size="md" checked={config.bold || false} onChange={(v) => onChange('bold', v)} label={t('receiptEditor.bold')} />
            )}
            {(type === 'order_details' || type === 'items_table') && (
              <Toggle
                size="md"
                checked={config.language === 'bilingual'}
                onChange={(v) => onChange('language', v ? 'bilingual' : undefined)}
                label={t('receiptEditor.bilingual')}
              />
            )}
          </div>
        </>
      )}

      {type === 'logo' && (
        <div className="flex items-center gap-4 text-sm text-muted">
          {logoDataUrl && (
            <span className="receipt-paper h-14 w-14 shrink-0 rounded-xl border border-line p-1.5">
              <img src={logoDataUrl} alt="" className="h-full w-full object-contain" />
            </span>
          )}
          <span>{logoDataUrl ? t('receiptEditor.logoFromSettings') : t('receiptEditor.noLogo')}</span>
        </div>
      )}

      {type === 'custom_text' && (
        <div className="grid gap-3">
          {textInput('text', t('receiptEditor.textMain'))}
          {textInput('textAr', t('receiptEditor.textAr'), { dir: 'rtl' })}
          {textInput('textFr', t('receiptEditor.textFr'))}
        </div>
      )}

      {type === 'divider' && styleSelect('none', ['none', 'dots', 'stars', 'food-emoji'])}
      {type === 'edge_decoration' && styleSelect('food-emoji', ['food-emoji', 'stars', 'dots', 'fire', 'hearts'])}

      {type === 'qr_code' && (
        <div className="space-y-2">
          {textInput('qrUrl', t('receiptEditor.v4.qrLink'), { dir: 'ltr', placeholder: t('receiptEditor.qrUrlPlaceholder') })}
          {config.qrContent === 'phone' && !config.qrUrl && <p className="text-xs text-muted">{t('receiptEditor.qrPhoneHint')}</p>}
        </div>
      )}

      {type === 'social_media' && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-ink-2">
            {socialMedia.length === 0 ? (
              <span className="text-muted">{t('receiptEditor.noSocial')}</span>
            ) : (
              socialMedia.map((s) => (
                <span key={`${s.platform}-${s.handle}`} className="me-3 inline-block">
                  <span className="text-muted">{s.platform}:</span> <bdi dir="ltr">{s.handle}</bdi>
                </span>
              ))
            )}
          </p>
          <Button variant="soft" size={isTouch ? 'lg' : 'sm'} icon={<Pencil className="h-4 w-4" />} onClick={onEditSocial}>
            {t('common.edit')}
          </Button>
        </div>
      )}
    </div>
  )
}
