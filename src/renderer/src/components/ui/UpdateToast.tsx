import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RefreshCw, X, ArrowDownToLine, AlertCircle } from 'lucide-react'

type UpdateState = 'available' | 'downloading' | 'ready' | 'error'

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

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-slide-down">
      <div className="bg-surface rounded-2xl shadow-e4 border border-line overflow-hidden w-80">
        {/* Progress bar at top */}
        {state === 'downloading' && (
          <div className="h-1 bg-surface-3">
            <div
              className="h-full bg-ember transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                state === 'ready'
                  ? 'bg-success-soft'
                  : state === 'downloading'
                    ? 'bg-info-soft'
                    : state === 'error'
                      ? 'bg-danger-soft'
                      : 'bg-primary-soft'
              }`}
            >
              {state === 'ready' ? (
                <RefreshCw className="h-5 w-5 text-success-ink" />
              ) : state === 'downloading' ? (
                <ArrowDownToLine className="h-5 w-5 text-info-ink animate-pulse-soft" />
              ) : state === 'error' ? (
                <AlertCircle className="h-5 w-5 text-danger-ink" />
              ) : (
                <Download className="h-5 w-5 text-primary-ink" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-ink">
                {state === 'ready'
                  ? t('update.readyTitle')
                  : state === 'downloading'
                    ? t('update.downloading')
                    : state === 'error'
                      ? t('update.errorTitle')
                      : t('update.availableTitle')}
              </h4>
              <p className="num text-xs text-muted mt-0.5">
                {state === 'ready'
                  ? t('update.readyDesc')
                  : state === 'downloading'
                    ? `${progress}%`
                    : state === 'error'
                      ? t('update.errorDesc')
                      : t('update.availableDesc', { version })}
              </p>
            </div>

            {/* Dismiss */}
            {state !== 'downloading' && (
              <button
                onClick={() => setDismissed(true)}
                className="h-8 w-8 -me-1 -mt-1 rounded-lg flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Action button */}
          {state === 'available' && (
            <button
              onClick={handleDownload}
              className="tap mt-3 w-full min-h-11 rounded-xl bg-ember text-sm font-semibold shadow-glow hover:brightness-110"
            >
              {t('update.downloadNow')}
            </button>
          )}

          {state === 'ready' && (
            <button
              onClick={handleInstall}
              className="tap mt-3 w-full min-h-11 rounded-xl bg-success-strong text-white text-sm font-semibold hover:brightness-110"
            >
              {t('update.restartNow')}
            </button>
          )}

          {state === 'error' && (
            <button
              onClick={() => setDismissed(true)}
              className="tap mt-3 w-full min-h-11 rounded-xl bg-surface-2 text-ink-2 text-sm font-semibold hover:bg-surface-3"
            >
              {t('common.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
