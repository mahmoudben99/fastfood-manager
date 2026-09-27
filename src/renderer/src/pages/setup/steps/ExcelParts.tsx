import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Camera, Check, ChevronRight, Download, Hourglass, Loader2, Upload } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../components/ui/cn'
import { Notice } from '../parts/Notice'

type Tone = 'primary' | 'info' | 'neutral'

const toneTile: Record<Tone, string> = {
  primary: 'bg-primary-soft text-primary-ink',
  info: 'bg-info-soft text-info-ink',
  neutral: 'bg-surface-3 text-ink-2'
}

interface OptionRowProps {
  icon: ReactNode
  tone: Tone
  title: ReactNode
  description: ReactNode
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
}

/** One import path. Tappable rows get a chevron; without onClick it is an informational row. */
export function OptionRow({ icon, tone, title, description, onClick, disabled, busy }: OptionRowProps) {
  const body = (
    <>
      <div className={cn('h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center [&_svg]:h-6 [&_svg]:w-6', toneTile[tone])}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
    </>
  )
  if (!onClick) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-dashed border-line-strong bg-surface-2 p-4 text-start">
        {body}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className="tap flex min-h-16 w-full items-center gap-4 rounded-2xl border border-line-strong bg-surface p-4 text-start shadow-e1 hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-focus"
    >
      {body}
      {busy ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary-ink" aria-hidden />
      ) : (
        <ChevronRight className="h-5 w-5 shrink-0 text-muted rtl:-scale-x-100" aria-hidden />
      )}
    </button>
  )
}

interface UploadPanelProps {
  selectedImages: string[]
  uploading: boolean
  uploadDone: boolean
  polling: boolean
  pollingStatus: string
  downloading: boolean
  uploadError: string | null
  importResult: { success: boolean; message: string } | null
  onBack: () => void
  onSelectImages: () => void
  onUpload: () => void
  onDownloadAndImport: () => void
}

/** "Send photos of your menu" flow: pick images → upload → wait for the team → import the Excel. */
export function ExcelUploadPanel(props: UploadPanelProps) {
  const { t } = useTranslation()
  const { selectedImages, uploading, uploadDone, polling, pollingStatus, downloading, uploadError, importResult } = props

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="md" onClick={props.onBack} icon={<ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />} className="-ms-2">
        {t('setup.excel.back', { defaultValue: 'Back to options' })}
      </Button>

      {!uploadDone ? (
        <>
          {/* Select images: drop-zone look, opens the native picker */}
          <button
            type="button"
            onClick={props.onSelectImages}
            disabled={uploading}
            className="tap flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 p-5 text-start hover:border-primary hover:bg-primary-soft disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-focus"
          >
            <div className="h-14 w-14 shrink-0 rounded-2xl bg-primary-soft text-primary-ink flex items-center justify-center">
              <Camera className="h-7 w-7" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-ink">{t('setup.excel.selectImages', { defaultValue: 'Select Images' })}</h3>
              <p className="mt-0.5 text-sm text-muted">
                {selectedImages.length > 0
                  ? t('setup.excel.imagesSelected', { count: selectedImages.length })
                  : t('setup.excel.selectShort')}
              </p>
            </div>
          </button>

          {selectedImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedImages.map((path, i) => {
                const name = path.split(/[/\\]/).pop() || `image-${i + 1}`
                return (
                  <span key={i} className="inline-flex max-w-full items-center rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2">
                    <bdi className="truncate">{name.length > 20 ? name.slice(0, 17) + '...' : name}</bdi>
                  </span>
                )
              })}
            </div>
          )}

          {selectedImages.length > 0 && (
            <Button
              variant="soft"
              size="lg"
              fullWidth
              onClick={props.onUpload}
              loading={uploading}
              icon={<Upload className="h-5 w-5" />}
            >
              {uploading
                ? t('setup.excel.uploading', { defaultValue: 'Uploading...' })
                : t('setup.excel.uploadBtn', { count: selectedImages.length })}
            </Button>
          )}
        </>
      ) : pollingStatus === 'ready' ? (
        <div className="space-y-4 rounded-2xl border border-line bg-surface-2 p-5 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-success-soft text-success-ink flex items-center justify-center">
            <Check className="h-7 w-7" aria-hidden />
          </div>
          <h3 className="text-lg font-bold text-ink">{t('setup.excel.menuReady', { defaultValue: 'Your menu is ready!' })}</h3>
          <Button
            variant="success"
            size="lg"
            fullWidth
            onClick={props.onDownloadAndImport}
            loading={downloading}
            icon={<Download className="h-5 w-5" />}
          >
            {downloading
              ? t('setup.excel.downloading', { defaultValue: 'Downloading & Importing...' })
              : t('setup.excel.downloadImport', { defaultValue: 'Download & Import Menu' })}
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-5 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary-soft text-primary-ink flex items-center justify-center">
            <Hourglass className="h-7 w-7" aria-hidden />
          </div>
          <h3 className="text-lg font-bold text-ink">
            {t('setup.excel.uploadSuccess', { defaultValue: 'Images uploaded successfully!' })}
          </h3>
          {/* Auto-check every 15 s: spinner + tooltip instead of a sentence */}
          <p
            className="flex items-center justify-center gap-2 text-sm text-muted"
            title={polling ? t('setup.excel.checking', { defaultValue: 'Checking automatically every 15 seconds...' }) : undefined}
          >
            {polling && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t('setup.excel.waitingAdmin', { defaultValue: 'Waiting for admin to prepare your menu...' })}
          </p>
        </div>
      )}

      {uploadError && <Notice tone="danger">{uploadError}</Notice>}

      {/* Import result (shown after download & import) */}
      {importResult && <Notice tone={importResult.success ? 'success' : 'danger'}>{importResult.message}</Notice>}
    </div>
  )
}
