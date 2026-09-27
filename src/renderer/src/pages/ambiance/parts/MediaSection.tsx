import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageIcon, Save, Upload, X } from 'lucide-react'
import { Button, EmptyState, IconButton, Input } from '../../../components/ui'
import { VirtualKeyboard } from '../../../components/VirtualKeyboard'
import { SettingBlock } from './SettingBlock'
import { MAX_SLIDESHOW_IMAGES, fileUrl, type ProfileSettings } from './presets'

interface MediaSectionProps {
  current: ProfileSettings
  isTouch: boolean
  /** Local-only edit (the URL is saved by the Save button). */
  onEditYoutube: (value: string) => void
  onSaveYoutube: (value: string) => void
  onUpload: () => Promise<void>
  onRemoveImage: (path: string) => Promise<void>
}

/** Background music (YouTube) and the slideshow photos. */
export function MediaSection({ current, isTouch, onEditYoutube, onSaveYoutube, onUpload, onRemoveImage }: MediaSectionProps) {
  const { t } = useTranslation()
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const full = current.images.length >= MAX_SLIDESHOW_IMAGES
  const block = 'py-5 first:pt-0 last:pb-0'

  const upload = async () => {
    setUploading(true)
    try {
      await onUpload()
    } finally {
      setUploading(false)
    }
  }

  const remove = async (path: string) => {
    setRemoving(path)
    try {
      await onRemoveImage(path)
    } finally {
      setRemoving(null)
    }
  }

  const uploadButton = (
    <Button
      variant="secondary"
      size="lg"
      icon={<Upload className="h-5 w-5" />}
      disabled={full}
      loading={uploading}
      title={full ? t('ambiance.imagesFull') : undefined}
      onClick={upload}
    >
      {t('ambiance.uploadImages')}
    </Button>
  )

  return (
    <div className="divide-y divide-line">
      <SettingBlock className={block} title={t('ambiance.backgroundMusic')}>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1 basis-64">
            <Input
              dir="ltr"
              placeholder={t('ambiance.youtubeUrlPlaceholder')}
              aria-label={t('ambiance.backgroundMusic')}
              title={t('ambiance.backgroundMusicHint')}
              value={current.youtubeUrl}
              readOnly={isTouch}
              onClick={isTouch ? () => setKeyboardOpen(true) : undefined}
              onChange={(e) => onEditYoutube(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveYoutube(current.youtubeUrl)
              }}
            />
          </div>
          <Button
            variant="secondary"
            size="lg"
            icon={<Save className="h-5 w-5" />}
            onClick={() => onSaveYoutube(current.youtubeUrl)}
          >
            {t('common.save')}
          </Button>
          {current.youtubeUrl && (
            <IconButton
              icon={<X />}
              label={t('ambiance.clearMusic')}
              variant="danger"
              size="lg"
              onClick={() => onSaveYoutube('')}
            />
          )}
        </div>
      </SettingBlock>

      <SettingBlock
        className={block}
        title={t('ambiance.slideshowImages')}
        aside={
          current.images.length > 0 ? (
            <span className="num font-semibold text-ink-2">
              {current.images.length}/{MAX_SLIDESHOW_IMAGES}
            </span>
          ) : undefined
        }
      >
        {current.images.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong">
            <EmptyState
              compact
              icon={<ImageIcon />}
              title={t('ambiance.noImagesTitle')}
              action={uploadButton}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {current.images.map((imgPath) => (
                <div
                  key={imgPath}
                  className="contain-card relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-2"
                >
                  <img
                    src={fileUrl(imgPath)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                  {/* Always visible (touch: no hover-only affordances). */}
                  <div className="absolute top-1.5 end-1.5">
                    <IconButton
                      icon={<X />}
                      label={t('ambiance.removeImage')}
                      variant="secondary"
                      size="md"
                      loading={removing === imgPath}
                      onClick={() => remove(imgPath)}
                    />
                  </div>
                </div>
              ))}
            </div>
            {uploadButton}
          </>
        )}
      </SettingBlock>

      {isTouch && keyboardOpen && (
        <VirtualKeyboard
          visible
          type="text"
          extended
          value={current.youtubeUrl}
          onChange={onEditYoutube}
          onClose={() => setKeyboardOpen(false)}
        />
      )}
    </div>
  )
}
