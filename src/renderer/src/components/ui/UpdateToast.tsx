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
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden w-80">
        {/* Progress bar at top */}
        {state === 'downloading' && (
          <div className="h-1 bg-gray-100 dark:bg-gray-700">
            <div
              className="h-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-300"
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
                  ? 'bg-green-100 dark:bg-green-900/30'
                  : state === 'downloading'
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : state === 'error'
                      ? 'bg-red-100 dark:bg-red-900/30'
                      : 'bg-orange-100 dark:bg-orange-900/30'
              }`}
            >
              {state === 'ready' ? (
                <RefreshCw className="h-5 w-5 text-green-600" />
              ) : state === 'downloading' ? (
                <ArrowDownToLine className="h-5 w-5 text-blue-600 animate-bounce" />
              ) : state === 'error' ? (
                <AlertCircle className="h-5 w-5 text-red-600" />
              ) : (
                <Download className="h-5 w-5 text-orange-600" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {state === 'ready'
                  ? t('update.readyTitle')
                  : state === 'downloading'
                    ? t('update.downloading')
                    : state === 'error'
                      ? t('update.errorTitle')
                      : t('update.availableTitle')}
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Action button */}
          {state === 'available' && (
            <button
              onClick={handleDownload}
              className="mt-3 w-full py-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white text-sm font-medium hover:from-orange-600 hover:to-orange-700 transition-all shadow-sm"
            >
              {t('update.downloadNow')}
            </button>
          )}

          {state === 'ready' && (
            <button
              onClick={handleInstall}
              className="mt-3 w-full py-2 rounded-xl bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-medium hover:from-green-600 hover:to-green-700 transition-all shadow-sm"
            >
              {t('update.restartNow')}
            </button>
          )}

          {state === 'error' && (
            <button
              onClick={() => setDismissed(true)}
              className="mt-3 w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
            >
              {t('common.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
