import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RefreshCw, X, ArrowDownToLine, AlertCircle } from 'lucide-react'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { cn } from './cn'

type UpdateState = 'available' | 'downloading' | 'ready' | 'error'

const tile: Record<UpdateState, string> = {
  available: 'bg-primary-soft text-primary-ink',
  downloading: 'bg-info-soft text-info-ink',
  ready: 'bg-success-soft text-success-ink',
  error: 'bg-danger-soft text-danger-ink'
}

export function UpdateToast() {
  const { t } = useTranslation()
  const [state, setState] = useState<UpdateState | null>(null)
  const [version, setVersion] = useState('')
  const [progress, setProgress] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const cleanup1 = window.api.updater.onUpdateAvailable((v) => {
      setVersion(v)
      setState('available')
      setDismissed(false)
    })

    const cleanup2 = window.api.updater.onDownloadProgress((percent) => {
      setProgress(percent)
      setState('downloading')
    })

    const cleanup3 = window.api.updater.onUpdateDownloaded(() => {
      setState('ready')
    })

    const cleanup4 = window.api.updater.onUpdateError(() => {
      setState('error')
    })

    return () => {
      cleanup1()
      cleanup2()
      cleanup3()
      cleanup4()
    }
  }, [])

  if (!state || dismissed) return null

  const handleDownload = () => {
    setState('downloading')
    setProgress(0)
    window.api.updater.download()
  }

  const handleInstall = () => {
    window.api.updater.install()
  }

  const pct = Math.max(0, Math.min(100, Math.round(progress)))

  const title =
    state === 'ready'
      ? t('update.readyTitle')
      : state === 'downloading'
        ? t('update.downloading')
        : state === 'error'
          ? t('update.errorTitle')
          : t('update.availableTitle')

  const description =
    state === 'ready'
      ? t('update.readyDesc')
      : state === 'error'
        ? t('update.errorDesc')
        : state === 'available'
          ? t('update.availableDesc', { version })
          : null

  return (
    // Centred with flex (not translate) so the enter animation can own `transform`.
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-e3 animate-pop-in"
      >
        <div className="flex items-start gap-3">
          <div className={cn('h-11 w-11 shrink-0 rounded-xl flex items-center justify-center', tile[state])}>
            {state === 'ready' ? (
              <RefreshCw className="h-5 w-5" aria-hidden />
            ) : state === 'downloading' ? (
              <ArrowDownToLine className="h-5 w-5" aria-hidden />
            ) : state === 'error' ? (
              <AlertCircle className="h-5 w-5" aria-hidden />
            ) : (
              <Download className="h-5 w-5" aria-hidden />
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h4 className="text-sm font-semibold text-ink">{title}</h4>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            {state === 'downloading' && (
              <div className="mt-2 flex items-center gap-3">
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"
                >
                  {/* scaleX, not width: compositor-only on weak PCs */}
                  <div
                    className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-300 rtl:origin-right"
                    style={{ transform: `scaleX(${pct / 100})` }}
                  />
                </div>
                <span className="num w-10 shrink-0 text-end text-xs font-semibold text-ink-2">{pct}%</span>
              </div>
            )}
          </div>

          {/* Dismiss */}
          {state !== 'downloading' && (
            <IconButton
              icon={<X />}
              label={t('common.close')}
              size="md"
              onClick={() => setDismissed(true)}
              className="-me-2 -mt-2"
            />
          )}
        </div>

        {/* Action button */}
        {state === 'available' && (
          <Button size="lg" fullWidth className="mt-4" onClick={handleDownload} icon={<Download className="h-5 w-5" />}>
            {t('update.downloadNow')}
          </Button>
        )}

        {state === 'ready' && (
          <Button
            variant="success"
            size="lg"
            fullWidth
            className="mt-4"
            onClick={handleInstall}
            icon={<RefreshCw className="h-5 w-5" />}
          >
            {t('update.restartNow')}
          </Button>
        )}

        {state === 'error' && (
          <Button variant="secondary" size="lg" fullWidth className="mt-4" onClick={() => setDismissed(true)}>
            {t('common.close')}
          </Button>
        )}
      </div>
    </div>
  )
}
