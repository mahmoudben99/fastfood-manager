import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react'
import { Button } from './ui/Button'
import { cn } from './ui/cn'
import { ipcErrorMessage } from '../utils/ipcError'

interface LogoUploaderProps {
  /** 'lg' = Settings (128px box, horizontal), 'md' = setup wizard (96px box, stacked). */
  size?: 'md' | 'lg'
  /** Called after every upload/remove, with the new data URL (null = no logo). */
  onChange?: (dataUrl: string | null) => void
}

/**
 * Restaurant logo picker (contract C1). The main process owns logo storage: the renderer never
 * builds file:// URLs or writes `logo_path`; it shows `getLogoDataUrl()` and calls
 * `uploadLogo()` / `removeLogo()`.
 */
export function LogoUploader({ size = 'lg', onChange }: LogoUploaderProps) {
  const { t } = useTranslation()
  const [logo, setLogo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const url = await window.api.settings.getLogoDataUrl()
      setLogo(url || null)
      return url || null
    } catch {
      setLogo(null)
      return null
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
      onChange?.(await refresh())
    } catch (err) {
      setError(t('settings.logoError', { error: ipcErrorMessage(err) }))
    } finally {
      setBusy(false)
    }
  }

  const upload = () => run(() => window.api.settings.uploadLogo())
  const remove = () => run(() => window.api.settings.removeLogo())
  const lg = size === 'lg'
  const uploadLabel = logo ? t('setup.restaurant.changeLogo') : t('setup.restaurant.uploadLogo')

  return (
    <div className={cn('flex gap-4', lg ? 'flex-wrap items-center sm:flex-nowrap' : 'flex-col items-center text-center')}>
      {/* Drop-zone look; tapping opens the native picker (the main process reads the file). */}
      <button
        type="button"
        onClick={upload}
        disabled={busy}
        aria-label={uploadLabel}
        title={uploadLabel}
        className={cn(
          'tap group relative shrink-0 overflow-hidden rounded-2xl flex items-center justify-center',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-progress',
          lg ? 'h-32 w-32' : 'h-24 w-24',
          logo
            ? 'border border-line bg-surface shadow-e1 hover:border-primary'
            : 'border-2 border-dashed border-line-strong bg-surface-2 hover:border-primary hover:bg-primary-soft'
        )}
      >
        {logo ? (
          <img src={logo} alt={t('setup.restaurant.logo')} className="h-full w-full object-contain p-2" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-2 text-primary-ink">
            <span className="h-10 w-10 rounded-full bg-primary-soft flex items-center justify-center group-hover:bg-surface">
              <ImagePlus className="h-5 w-5" aria-hidden />
            </span>
            {lg && <span className="text-xs font-semibold leading-tight text-muted">{t('setup.restaurant.logoPick')}</span>}
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-surface/80">
            <Loader2 className="h-6 w-6 animate-spin text-primary-ink" aria-hidden />
          </span>
        )}
      </button>

      <div className={cn('min-w-0', lg ? 'flex-1' : 'w-full')}>
        {lg && (
          <>
            <p className="text-base font-semibold text-ink">{t('setup.restaurant.logo')}</p>
            <p className="mt-0.5 text-xs text-muted">{t('settings.v4.logoHint')}</p>
          </>
        )}

        <div className={cn('flex flex-wrap items-center gap-2', lg ? 'mt-3' : 'justify-center')}>
          <Button variant="secondary" size="lg" onClick={upload} disabled={busy} icon={<Upload className="h-4 w-4" />}>
            {uploadLabel}
          </Button>
          {logo && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="tap inline-flex min-h-12 items-center gap-2 rounded-xl px-4 text-base font-semibold text-danger-ink hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t('settings.removeLogo')}
            </button>
          )}
        </div>

        {!lg && <p className="mt-2 text-xs text-muted">{t('setup.restaurant.logoShort')}</p>}

        {error && (
          <p role="alert" className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger-ink">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
