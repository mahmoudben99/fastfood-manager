import { useTranslation } from 'react-i18next'
import { Type, Image, ListOrdered, Hash, QrCode, Share2, Minus, Sparkles } from 'lucide-react'
import { Input } from '../../components/ui/Input'
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

const selectCls = 'border rounded px-1 py-0.5 text-xs'

export function ReceiptBlockConfig({ block, onChange, socialMedia, logoDataUrl, onEditSocial, isTouch, onRequestKeyboard }: ReceiptBlockConfigProps) {
  const { t } = useTranslation()
  const { type, config } = block

  // Touch mode: fields are read-only and open the on-screen keyboard instead.
  const textInput = (field: BlockTextField, placeholder: string, extra?: { dir?: string }) => (
    <Input
      placeholder={placeholder}
      value={config[field] || ''}
      readOnly={isTouch}
      onClick={isTouch ? () => onRequestKeyboard(field) : undefined}
      onChange={isTouch ? undefined : (e) => onChange(field, e.target.value)}
      dir={extra?.dir}
    />
  )

  return (
    <div className="p-3 bg-gray-50 border-t space-y-2">
      {/* Common options — hidden for types that don't use them */}
      {!['divider', 'edge_decoration', 'logo'].includes(type) && (
        <div className="flex gap-3 flex-wrap">
          <label className="flex items-center gap-1 text-xs text-gray-600">
            {t('receiptEditor.size')}:
            <select className={selectCls} value={config.fontSize || 'medium'} onChange={(e) => onChange('fontSize', e.target.value)}>
              <option value="small">{t('settings.fontSmall')}</option>
              <option value="medium">{t('settings.fontMedium')}</option>
              <option value="large">{t('settings.fontLarge')}</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            {t('receiptEditor.align')}:
            {/* The printer centres blocks with no alignment set, so the select must show that too. */}
            <select className={selectCls} value={config.alignment || 'center'} onChange={(e) => onChange('alignment', e.target.value)}>
              <option value="left">{t('receiptEditor.alignLeft')}</option>
              <option value="center">{t('receiptEditor.alignCenter')}</option>
              <option value="right">{t('receiptEditor.alignRight')}</option>
            </select>
          </label>
          {type !== 'qr_code' && (
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" checked={config.bold || false} onChange={(e) => onChange('bold', e.target.checked)} />
              {t('receiptEditor.bold')}
            </label>
          )}
          {(type === 'order_details' || type === 'items_table') && (
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={config.language === 'bilingual'}
                onChange={(e) => onChange('language', e.target.checked ? 'bilingual' : undefined)}
              />
              {t('receiptEditor.bilingual')}
            </label>
          )}
        </div>
      )}

      {type === 'logo' && (
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="" className="h-12 w-12 object-contain rounded border bg-white" />
          ) : null}
          <span>{logoDataUrl ? t('receiptEditor.logoFromSettings') : t('receiptEditor.noLogo')}</span>
        </div>
      )}

      {type === 'custom_text' && (
        <div className="space-y-1">
          {textInput('text', t('receiptEditor.textMain'))}
          {textInput('textAr', t('receiptEditor.textAr'), { dir: 'rtl' })}
          {textInput('textFr', t('receiptEditor.textFr'))}
        </div>
      )}

      {type === 'divider' && (
        <label className="flex items-center gap-1 text-xs text-gray-600">
          {t('receiptEditor.style')}:
          <select className={selectCls} value={config.decorationType || 'none'} onChange={(e) => onChange('decorationType', e.target.value)}>
            <option value="none">{t('receiptEditor.styles.line')}</option>
            <option value="dots">{t('receiptEditor.styles.dots')}</option>
            <option value="stars">{t('receiptEditor.styles.stars')}</option>
            <option value="food-emoji">{t('receiptEditor.styles.foodEmoji')}</option>
          </select>
        </label>
      )}

      {type === 'edge_decoration' && (
        <label className="flex items-center gap-1 text-xs text-gray-600">
          {t('receiptEditor.style')}:
          <select className={selectCls} value={config.decorationType || 'food-emoji'} onChange={(e) => onChange('decorationType', e.target.value)}>
            <option value="food-emoji">{t('receiptEditor.styles.foodEmoji')}</option>
            <option value="stars">{t('receiptEditor.styles.stars')}</option>
            <option value="dots">{t('receiptEditor.styles.dots')}</option>
            <option value="fire">{t('receiptEditor.styles.fire')}</option>
            <option value="hearts">{t('receiptEditor.styles.hearts')}</option>
          </select>
        </label>
      )}

      {type === 'qr_code' && (
        <div className="space-y-1">
          {textInput('qrUrl', t('receiptEditor.qrUrlPlaceholder'), { dir: 'ltr' })}
          {config.qrContent === 'phone' && !config.qrUrl && (
            <p className="text-xs text-gray-500">{t('receiptEditor.qrPhoneHint')}</p>
          )}
        </div>
      )}

      {type === 'social_media' && (
        <div className="text-xs text-gray-500">
          {socialMedia.length === 0
            ? t('receiptEditor.noSocial')
            : socialMedia.map((s) => `${s.platform}: ${s.handle}`).join(', ')}
          <button className={`ms-2 text-orange-500 underline ${isTouch ? 'py-2' : ''}`} onClick={onEditSocial}>
            {t('common.edit')}
          </button>
        </div>
      )}
    </div>
  )
}
