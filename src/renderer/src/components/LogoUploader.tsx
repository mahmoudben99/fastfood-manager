import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Image, Trash2 } from 'lucide-react'
import { Button } from './ui/Button'
import { ipcErrorMessage } from '../utils/ipcError'

interface LogoUploaderProps {
  /** 'lg' = Settings (128px box), 'md' = setup wizard (96px box). */
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
  const box = size === 'lg' ? 'w-32 h-32' : 'w-24 h-24'

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={upload}
        disabled={busy}
        className={`${box} rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center mb-3 overflow-hidden cursor-pointer hover:border-orange-400 transition-colors disabled:opacity-60`}
        aria-label={logo ? t('setup.restaurant.changeLogo') : t('setup.restaurant.uploadLogo')}
      >
        {logo ? (
          <img src={logo} alt={t('setup.restaurant.logo')} className="w-full h-full object-contain p-2" />
        ) : (
          <Image className="h-8 w-8 text-gray-400" />
        )}
      </button>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <Button variant="ghost" size="sm" onClick={upload} disabled={busy}>
          <Upload className="h-4 w-4" />
          {logo ? t('setup.restaurant.changeLogo') : t('setup.restaurant.uploadLogo')}
        </Button>
        {logo && (
          <Button variant="ghost" size="sm" onClick={remove} disabled={busy} className="text-red-600 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
            {t('settings.removeLogo')}
          </Button>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1 text-center">{t('setup.restaurant.logoOptional')}</p>
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5 mt-2 text-center">{error}</p>}
    </div>
  )
}
