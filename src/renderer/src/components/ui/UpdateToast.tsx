import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RefreshCw, X, ArrowDownToLine, ShieldAlert } from 'lucide-react'

type UpdateState = 'available' | 'downloading' | 'ready'

export function UpdateToast() {
  const { t } = useTranslation()
  const [state, setState] = useState<UpdateState | null>(null)
  const [version, setVersion] = useState('')
  const [progress, setProgress] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [forced, setForced] = useState(false)

  useEffect(() => {
    window.api.updater.onUpdateAvailable((v, isForced) => {
      setVersion(v)
      setForced(!!isForced)
      setState('available')
      setDismissed(false)
      // Auto-download forced updates
      if (isForced) {
        window.api.updater.download()
      }
    })

    window.api.updater.onDownloadProgress((percent) => {
      setProgress(percent)
      if (state === 'available') setState('downloading')
    })

    window.api.updater.onUpdateDownloaded(() => {
      setState('ready')
    })
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

  // Forced update: full-screen blocking overlay
  if (forced) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-96 animate-slide-up">
          {/* Progress bar */}
          {(state === 'downloading' || state === 'available') && (
            <div className="h-1.5 bg-gray-100">
              <div
                className="h-full bg-gradient-to-r from-red-400 to-red-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <div className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
                <ShieldAlert className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                {t('update.forceTitle')}
              </h3>
              <p className="text-sm text-gray-500 mt-2">
                {state === 'ready'
                  ? t('update.readyDesc')
                  : state === 'downloading'
                    ? t('update.forceDownloading', { progress })
                    : t('update.forceDesc', { version })}
              </p>
            </div>

            {state === 'ready' && (
              <button
                onClick={handleInstall}
                className="mt-5 w-full py-3 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white font-medium hover:from-red-600 hover:to-red-700 transition-all shadow-sm"
              >
                {t('update.restartNow')}
              </button>
            )}

            {state === 'downloading' && (
              <div className="mt-4 text-center text-sm text-gray-400">
                {progress}%
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Normal update: bottom-right toast
  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden w-80">
        {/* Progress bar at top */}
        {state === 'downloading' && (
          <div className="h-1 bg-gray-100">
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
                  ? 'bg-green-100'
                  : state === 'downloading'
                    ? 'bg-blue-100'
                    : 'bg-orange-100'
              }`}
            >
              {state === 'ready' ? (
                <RefreshCw className="h-5 w-5 text-green-600" />
              ) : state === 'downloading' ? (
                <ArrowDownToLine className="h-5 w-5 text-blue-600 animate-bounce" />
              ) : (
                <Download className="h-5 w-5 text-orange-600" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-gray-900">
                {state === 'ready'
                  ? t('update.readyTitle')
                  : state === 'downloading'
                    ? t('update.downloading')
                    : t('update.availableTitle')}
              </h4>
              <p className="text-xs text-gray-500 mt-0.5">
                {state === 'ready'
                  ? t('update.readyDesc')
                  : state === 'downloading'
                    ? `${progress}%`
                    : t('update.availableDesc', { version })}
              </p>
            </div>

            {/* Dismiss — only for non-downloading states */}
            {state !== 'downloading' && (
              <button
                onClick={() => setDismissed(true)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
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
        </div>
      </div>
    </div>
  )
}
