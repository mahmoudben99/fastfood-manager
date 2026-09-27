import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye } from 'lucide-react'
import { Badge, Card } from '../../../components/ui'
import {
  GRADIENT_PRESETS,
  PANEL_KEYS,
  TEXT_SCALE_FACTOR,
  fileUrl,
  gradientCss,
  type ProfileSettings
} from './presets'

interface TvPreviewProps {
  current: ProfileSettings
  restaurantName: string
  profileLabel: string
}

/** Logo on the TV is 200px x scale on a 1920px screen; the preview is ~1/5 of that. */
const PREVIEW_LOGO_PX = 30

/** Static (no animation) miniature of the TV welcome panel, framed like a television. */
export function TvPreview({ current, restaurantName, profileLabel }: TvPreviewProps) {
  const { t } = useTranslation()
  const [logo, setLogo] = useState<string | null>(null)
  const gradient = GRADIENT_PRESETS[current.gradientPreset] || GRADIENT_PRESETS[0]
  const scale = TEXT_SCALE_FACTOR[current.textScale] ?? 1
  const logoPx = PREVIEW_LOGO_PX * (current.logoScale || 1)

  useEffect(() => {
    let alive = true
    window.api.settings
      .getLogoDataUrl()
      .then((url) => alive && setLogo(url || null))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const welcome =
    current.welcomeMode === 'static' && current.welcomeText ? current.welcomeText : t('ambiance.welcome')

  return (
    <Card title={t('ambiance.livePreview')} subtitle={profileLabel} icon={<Eye />}>
      {/* TV bezel (nav charcoal in both themes) + stand; capped when the columns stack (< xl). */}
      <div className="mx-auto w-full max-w-md xl:max-w-none">
        <div className="rounded-2xl bg-nav p-2 shadow-e2">
          <div
            className="relative aspect-video overflow-hidden rounded-lg"
            style={{ background: gradientCss(gradient) }}
          >
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-5 text-center"
              style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
            >
              {logo && (
                <img
                  src={logo}
                  alt=""
                  className="rounded-lg object-contain"
                  style={{ width: logoPx, height: logoPx }}
                />
              )}
              {current.showName && (
                <div
                  className="text-xl font-bold leading-tight line-clamp-2"
                  style={{ fontFamily: current.fontFamily, color: current.textColor }}
                >
                  {restaurantName || t('ambiance.restaurantNamePlaceholder')}
                </div>
              )}
              <div
                className="text-sm font-medium line-clamp-2"
                style={{ fontFamily: current.fontFamily, color: current.accentColor }}
              >
                {welcome}
              </div>
              {current.images.length > 0 && (
                <div className="mt-2 flex gap-1">
                  {current.images.slice(0, 4).map((imgPath) => (
                    <div key={imgPath} className="h-8 w-8 overflow-hidden rounded opacity-80">
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
                    </div>
                  ))}
                  {current.images.length > 4 && (
                    <div
                      className="num flex h-8 w-8 items-center justify-center rounded text-[11px] font-semibold"
                      style={{ color: current.textColor, backgroundColor: 'rgb(0 0 0 / 0.3)' }}
                    >
                      +{current.images.length - 4}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mx-auto h-2 w-24 rounded-b-lg bg-nav" aria-hidden="true" />
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-1.5" aria-label={t('ambiance.activePanels')}>
        {PANEL_KEYS.map((key) => {
          const on = current.panelToggles[key] ?? true
          return (
            <Badge key={key} variant={on ? 'success' : 'neutral'} dot className={on ? '' : 'line-through opacity-70'}>
              {t(`ambiance.panel.${key}`)}
            </Badge>
          )
        })}
      </div>
    </Card>
  )
}
