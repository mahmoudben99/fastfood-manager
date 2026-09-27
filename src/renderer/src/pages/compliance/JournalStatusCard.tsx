import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Copy, Fingerprint, HelpCircle, Loader2, XCircle } from 'lucide-react'
import { Card, IconButton, cn, toast } from '../../components/ui'
import { formatFiscalNumber, type FiscalStatus, type JournalVerification } from '../../../../shared/fiscal'
import { formatDateTime } from './format'

interface Props {
  status: FiscalStatus | null
  verification: JournalVerification | null
  verifying: boolean
}

/** The page's main card: intact ✓ / problem ✗ / not verified, key numbers, problems, head fingerprint. */
export function JournalStatusCard({ status, verification, verifying }: Props) {
  const { t, i18n } = useTranslation()
  const state = verifying && !verification ? 'running' : !verification ? 'never' : verification.ok ? 'ok' : 'broken'
  const tone = {
    ok: { tile: 'bg-success-soft text-success-ink', icon: <CheckCircle2 />, title: t('compliance.status.ok') },
    broken: { tile: 'bg-danger-soft text-danger-ink', icon: <XCircle />, title: t('compliance.status.broken') },
    never: { tile: 'bg-surface-2 text-muted', icon: <HelpCircle />, title: t('compliance.status.never') },
    running: { tile: 'bg-surface-2 text-muted', icon: <Loader2 className="animate-spin" />, title: t('compliance.status.never') }
  }[state]
  const detail = state === 'ok'
    ? t('compliance.status.okDetail', { events: verification!.events, orders: verification!.ordersChecked })
    : state === 'broken'
      ? t('compliance.status.brokenDetail', { count: verification!.breaks.length })
      : t('compliance.status.neverDetail')
  const head = verification?.headHash ?? status?.headHash ?? null

  const metric = (label: string, value: ReactNode, hint?: string) => (
    <div className="rounded-xl bg-surface-2 border border-line px-3 py-2.5 min-w-0" title={hint}>
      <dt className="text-xs text-muted truncate">{label}</dt>
      <dd className="text-lg font-bold text-ink num truncate">{value}</dd>
    </div>
  )

  const copy = async (): Promise<void> => {
    if (!head) return
    try {
      await navigator.clipboard.writeText(head)
      toast.success(t('compliance.status.copied'))
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-4" role="status" aria-live="polite">
        <div className={cn('h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center [&_svg]:h-8 [&_svg]:w-8', tone.tile)}>
          {tone.icon}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-sm font-semibold text-muted">{t('compliance.status.title')}</span>
            <span className={cn('text-2xl font-extrabold', state === 'ok' ? 'text-success-ink' : state === 'broken' ? 'text-danger-ink' : 'text-ink')}>
              {tone.title}
            </span>
          </div>
          <p className="text-sm text-ink-2">{detail}</p>
          {verification && (
            <p className="text-xs text-muted">{t('compliance.status.lastVerified', { date: formatDateTime(verification.verifiedAt, i18n.language) })}</p>
          )}
        </div>
      </div>

      <dl className={cn('mt-4 grid gap-3 grid-cols-2', status && status.preJournalOrders > 0 ? 'md:grid-cols-4' : 'md:grid-cols-3')}>
        {metric(t('compliance.status.lastNumber'), <bdi dir="ltr">{formatFiscalNumber(status?.lastFiscalNumber)}</bdi>, t('compliance.status.lastNumberHint'))}
        {metric(t('compliance.status.entries'), status?.journalEvents ?? '—')}
        {metric(t('compliance.status.since'), formatDateTime(status?.journalStartedAt, i18n.language, false), t('compliance.status.retentionHint'))}
        {status && status.preJournalOrders > 0 &&
          metric(t('compliance.status.preJournal'), status.preJournalOrders, t('compliance.status.preJournalHint'))}
      </dl>

      {verification && !verification.ok && (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-danger/30">
          {verification.breaks.map((item, index) => (
            <li key={index} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2 font-semibold text-danger-ink">
                <XCircle className="h-4 w-4 shrink-0" />
                {t(`compliance.status.breakKinds.${item.kind}`)}
              </span>
              <span className="text-muted num">
                {[
                  item.seq ? t('compliance.status.entry', { seq: item.seq }) : null,
                  item.fiscalNumber ? t('compliance.status.order', { number: formatFiscalNumber(item.fiscalNumber) }) : null
                ].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
          {verification.truncated && <li className="px-4 py-2.5 text-sm text-muted">{t('compliance.status.moreBreaks')}</li>}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-2 text-muted" title={t('compliance.status.head')}>
        <Fingerprint className="h-4 w-4 shrink-0" aria-hidden />
        <code dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[12px]" aria-label={t('compliance.status.head')}>{head ?? '—'}</code>
        {head && <IconButton icon={<Copy />} label={t('compliance.status.copy')} size="sm" onClick={() => void copy()} />}
      </div>
    </Card>
  )
}
