import { ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Globe, Info, Link2, Wifi } from 'lucide-react'
import { Card, IconButton, toast } from '../../../components/ui'
import { profileQuery } from './presets'

interface DisplayLinkCardProps {
  profile: string
  profileLabel: string
  tvUrl: string
  tabletRunning: boolean
  tabletUrl: string
}

interface LinkRowProps {
  icon: ReactNode
  /** Tooltip + accessible name of the row (Internet / local network). */
  label: string
  shown: string
  copied: boolean
  onCopy: () => void
}

function LinkRow({ icon, label, shown, copied, onCopy }: LinkRowProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2">
      <span
        role="img"
        aria-label={label}
        title={label}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted [&_svg]:h-5 [&_svg]:w-5"
      >
        {icon}
      </span>
      <bdi
        dir="ltr"
        title={shown}
        className="min-w-0 flex-1 truncate rounded-xl border border-line bg-surface-2 px-3 py-3 font-mono text-sm text-ink select-all"
      >
        {shown}
      </bdi>
      <IconButton
        icon={copied ? <Check className="text-success-ink" /> : <Copy />}
        label={t('ambiance.copyLink')}
        variant="secondary"
        size="lg"
        onClick={onCopy}
      />
    </div>
  )
}

/** Where to open THIS display profile: cloud link (any network) + LAN link (tablet server on). */
export function DisplayLinkCard({ profile, profileLabel, tvUrl, tabletRunning, tabletUrl }: DisplayLinkCardProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState<'cloud' | 'local' | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = (text: string, which: 'cloud' | 'local') => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(t('ambiance.linkCopied'), { id: 'ambiance-copy' }),
      () => toast.error(t('common.error'), { id: 'ambiance-copy' })
    )
    setCopied(which)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(null), 2000)
  }

  const localUrl = `${tabletUrl.replace(/\/$/, '')}/display${profileQuery(profile)}`

  return (
    <Card title={t('ambiance.displayLink')} icon={<Link2 />}>
      <div className="space-y-2.5">
        {/* Named profiles share the POS pairing code; one line on how to aim a TV at this one. */}
        {profile !== 'default' && (
          <p
            className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-xs text-info-ink"
            title={t('ambiance.extraScreenNote', { name: profileLabel })}
          >
            <Info className="mt-px h-4 w-4 shrink-0" />
            {t('ambiance.extraScreenShort')}
          </p>
        )}

        {tvUrl ? (
          <LinkRow
            icon={<Globe />}
            label={`${t('ambiance.internetLink')} · ${t('ambiance.worksAnyDevice')}`}
            shown={tvUrl}
            copied={copied === 'cloud'}
            onCopy={() => copy(`https://${tvUrl}`, 'cloud')}
          />
        ) : (
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">{t('ambiance.urlNotAvailable')}</p>
        )}

        {tabletRunning && (
          <LinkRow
            icon={<Wifi />}
            label={t('ambiance.localNetworkUrl')}
            shown={localUrl}
            copied={copied === 'local'}
            onCopy={() => copy(localUrl, 'local')}
          />
        )}
      </div>
    </Card>
  )
}
