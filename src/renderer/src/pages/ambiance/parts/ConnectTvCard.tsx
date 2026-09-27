import { useTranslation } from 'react-i18next'
import { ShieldCheck, Tv } from 'lucide-react'
import { Badge, Button, Card, Skeleton } from '../../../components/ui'
import type { FirewallState } from './useAmbianceProfiles'

interface ConnectTvCardProps {
  pairingCode: string
  pairingLoaded: boolean
  firewallState: FirewallState
  onAllowFirewall: () => void
}

/**
 * Page-level "connect a TV" strip: ONE 4-digit pairing code per POS (not per display profile),
 * so it sits above the profile tabs and is always visible (the `ambiance` harness reads it).
 */
export function ConnectTvCard({ pairingCode, pairingLoaded, firewallState, onAllowFirewall }: ConnectTvCardProps) {
  const { t } = useTranslation()

  return (
    <Card padding={false} className="mb-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 p-4 lg:p-5">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-ink">
            <Tv className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">{t('ambiance.connectTitle')}</h2>
            <p className="text-sm text-muted" title={t('ambiance.tvAppCodeHint')}>
              {t('ambiance.tvCodeShort')}
            </p>
          </div>
        </div>

        <div className="shrink-0 rounded-2xl bg-primary-soft px-5 py-1.5 text-center" title={t('ambiance.tvAppCode')}>
          {!pairingLoaded ? (
            <Skeleton className="my-1.5 h-10 w-40" />
          ) : pairingCode ? (
            // Single text node on purpose: the harness matches the digits in body.innerText.
            <span
              dir="ltr"
              className="num block font-mono text-[2.5rem] leading-tight font-extrabold tracking-[0.3em] ps-[0.3em] text-ink"
            >
              {pairingCode}
            </span>
          ) : (
            <p className="max-w-56 py-2 text-sm text-muted">{t('ambiance.pairingUnavailable')}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {firewallState === 'done' ? (
            <Badge variant="success" size="md">{t('ambiance.firewallDone')}</Badge>
          ) : (
            <>
              {firewallState === 'failed' && (
                <span title={t('ambiance.firewallFailed')}>
                  <Badge variant="warning" size="md">{t('ambiance.firewallSkipped')}</Badge>
                </span>
              )}
              <Button
                variant="secondary"
                size="lg"
                icon={<ShieldCheck className="h-5 w-5" />}
                loading={firewallState === 'working'}
                title={t('ambiance.firewallBtn')}
                onClick={onAllowFirewall}
              >
                {t('ambiance.firewallShort')}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
