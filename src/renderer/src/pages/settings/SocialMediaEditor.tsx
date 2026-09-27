import { useTranslation } from 'react-i18next'
import { Plus, Share2, Trash2 } from 'lucide-react'
import { Button, IconButton, Input, Select } from '../../components/ui'
import { SOCIAL_PLATFORMS, type SocialMediaEntry } from '../../../../shared/settings-rules'
import { SOCIAL_PLATFORM_SVGS } from './socialIcons'

interface SocialMediaEditorProps {
  items: SocialMediaEntry[]
  onChange: (items: SocialMediaEntry[]) => void
  /** Optional heading shown next to the "Add platform" button. */
  label?: string
  /** Touchscreen mode: handle inputs are read-only and ask the parent to open the on-screen keyboard. */
  isTouch?: boolean
  onRequestKeyboard?: (index: number) => void
}

/**
 * Social accounts editor used by Settings > General and the Receipt Editor. Both edit the same
 * `settings.social_media` list (the one the receipt printer and the TV/tablet screens read).
 */
export function SocialMediaEditor({ items, onChange, label, isTouch = false, onRequestKeyboard }: SocialMediaEditorProps) {
  const { t } = useTranslation()

  const update = (index: number, patch: Partial<SocialMediaEntry>) => {
    const next = [...items]
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  const addButton = (
    <Button
      variant="soft"
      size={isTouch ? 'lg' : 'md'}
      icon={<Plus className="h-4 w-4" />}
      onClick={() => onChange([...items, { platform: 'instagram', handle: '' }])}
    >
      {t('settings.addPlatform').replace(/^\+\s*/, '')}
    </Button>
  )

  return (
    <div className="space-y-3">
      {label && <p className="text-sm font-medium text-ink-2">{label}</p>}
      {items.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted">
          <span className="flex items-center gap-3" title={t('settings.noSocialMedia')}>
            <Share2 className="h-5 w-5 shrink-0 text-faint" />
            {t('settings.v4.noSocialShort')}
          </span>
          {addButton}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((sm, i) => (
            <li key={i} className="flex items-center gap-2">
              {/* Brand marks keep their own colours: always on a white tile. */}
              <span
                className="receipt-paper h-11 w-11 shrink-0 rounded-xl border border-line flex items-center justify-center [&_svg]:h-5 [&_svg]:w-5"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: SOCIAL_PLATFORM_SVGS[sm.platform] || '' }}
              />
              <div className="w-40 shrink-0">
                <Select
                  aria-label={t('settings.v4.platform')}
                  value={sm.platform}
                  onChange={(e) => update(i, { platform: e.target.value })}
                  options={SOCIAL_PLATFORMS}
                />
              </div>
              <div className="min-w-0 flex-1">
                <Input
                  value={sm.handle}
                  readOnly={isTouch}
                  onClick={isTouch ? () => onRequestKeyboard?.(i) : undefined}
                  onChange={isTouch ? undefined : (e) => update(i, { handle: e.target.value })}
                  placeholder={t('settings.socialHandlePlaceholder')}
                  aria-label={t('settings.socialHandlePlaceholder')}
                  dir="ltr"
                />
              </div>
              <IconButton
                icon={<Trash2 />}
                label={t('common.remove')}
                variant="danger"
                size={isTouch ? 'lg' : 'md'}
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              />
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && addButton}
    </div>
  )
}
