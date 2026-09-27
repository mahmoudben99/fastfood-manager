import { useTranslation } from 'react-i18next'
import {
  KDS_CHANGE_HIGHLIGHT_MS,
  formatKdsElapsed,
  kdsLocalName,
  kdsModifierIsRemoval,
  kdsModifierLabel,
  kdsTimerLevel,
  type KdsCard as KdsCardData,
  type KdsDisplaySettings,
  type KdsItemView,
  type KdsTicketStatus
} from '../../../../shared/kds'

interface Props {
  card: KdsCardData
  expo: boolean
  nowMs: number
  settings: KdsDisplaySettings
  onBump: (card: KdsCardData) => void
  onLineDone: (item: KdsItemView) => void
  onStart: (ticketId: number) => void
}

const LEVEL_HEAD = { ok: 'bg-green-800', warn: 'bg-amber-700', late: 'bg-red-700' } as const
const STATUS_CHIP: Record<KdsTicketStatus, string> = {
  new: 'bg-slate-800 text-slate-200',
  in_progress: 'bg-blue-900 text-blue-100',
  ready: 'bg-green-900 text-green-200',
  bumped: 'bg-green-900 text-green-200',
  cancelled: 'bg-red-900 text-red-100'
}
const STATUS_KEY: Record<KdsTicketStatus, string> = {
  new: 'kds.statusNew',
  in_progress: 'kds.statusInProgress',
  ready: 'kds.statusReady',
  bumped: 'kds.statusBumped',
  cancelled: 'kds.statusCancelled'
}

/** One kitchen ticket card. Tapping anywhere bumps it; the check box toggles a single line. */
export function KdsCard({ card, expo, nowMs, settings, onBump, onLineDone, onStart }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const elapsed = nowMs - Date.parse(card.timerStart)
  const level = kdsTimerLevel(elapsed, settings.warnMinutes, settings.lateMinutes)
  const cancelled = card.status === 'cancelled'
  const banner = cancelled
    ? 'cancelled'
    : card.change && card.changedAt && nowMs - Date.parse(card.changedAt) < KDS_CHANGE_HIGHLIGHT_MS ? card.change : null
  const typeLabel = card.orderType === 'local' ? t('kds.dineIn') : card.orderType === 'delivery' ? t('kds.delivery') : t('kds.takeout')
  const prefixes = { modNo: t('kds.modNo'), modExtra: t('kds.modExtra'), modLight: t('kds.modLight') }

  const line = (item: KdsItemView) => {
    const mark = item.change === 'added' ? t('kds.added') : item.change === 'removed' ? t('kds.removed') : item.change === 'changed' ? t('kds.changed') : ''
    const was = item.change === 'changed' && item.previousQuantity != null && item.previousQuantity !== item.quantity
      ? ` · ${t('kds.wasQty', { n: item.previousQuantity })}` : ''
    const removed = item.change === 'removed'
    return (
      <li key={item.id} className={`flex items-start gap-2 rounded-lg p-1.5 ${item.parentOrderItemId ? 'ms-6' : ''}`}>
        <button
          type="button"
          aria-label="done"
          onClick={(event) => { event.stopPropagation(); if (!removed) onLineDone(item) }}
          className={`mt-0.5 h-10 w-10 shrink-0 rounded-lg border-2 text-xl font-black
            ${removed ? 'invisible' : item.doneAt ? 'border-green-600 bg-green-600 text-white' : 'border-slate-600 text-transparent'}`}
        >
          ✓
        </button>
        <div className={`min-w-0 flex-1 ${item.doneAt ? 'opacity-45' : ''}`}>
          {item.comboName && (
            <div className="text-sm font-extrabold uppercase text-sky-300">{t('kds.combo', { name: item.comboName })}</div>
          )}
          <div className={`break-words text-2xl font-extrabold leading-tight ${removed ? 'text-red-300 line-through' : ''}`}>
            <span className="me-1.5 text-amber-400">{item.quantity}×</span>
            <span className={cancelled ? 'line-through' : ''}>{kdsLocalName(item, lang)}</span>
            {mark && (
              <span className={`ms-1.5 inline-block rounded-md px-1.5 py-0.5 align-middle text-xs font-black no-underline
                ${item.change === 'added' ? 'bg-green-600 text-white' : item.change === 'removed' ? 'bg-red-500 text-white' : 'bg-amber-500 text-slate-900'}`}
              >
                {mark}{was}
              </span>
            )}
          </div>
          {item.modifiers.map((modifier, index) => (
            <div key={index} className={`text-lg ${kdsModifierIsRemoval(modifier) ? 'font-black text-red-300' : 'font-bold text-amber-200'}`}>
              {kdsModifierLabel(modifier, lang, prefixes)}
            </div>
          ))}
          {item.notes && <div className="mt-0.5 text-lg font-extrabold text-amber-400">⚠ {item.notes}</div>}
        </div>
      </li>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onBump(card)}
      onKeyDown={(event) => { if (event.key === 'Enter') onBump(card) }}
      className={`kds-card-in cursor-pointer select-none overflow-hidden rounded-2xl border-2 bg-slate-900 transition-transform active:scale-[.985]
        ${cancelled ? 'animate-pulse border-red-500' : card.status === 'ready' ? 'border-green-500' : 'border-slate-800'}`}
    >
      <div className={`flex items-center gap-2.5 px-3.5 py-2.5 ${LEVEL_HEAD[level]}`}>
        <div className="text-3xl font-black leading-none">#{card.dailyNumber}</div>
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-2 gap-y-1 text-base font-bold">
          <span className="rounded-md bg-black/30 px-2 uppercase">{typeLabel}</span>
          {card.tableNumber && <span>{t('kds.table', { n: card.tableNumber })}</span>}
          {card.customerName && <span className="truncate">{card.customerName}</span>}
        </div>
        <div className="text-2xl font-black tabular-nums">{formatKdsElapsed(elapsed)}</div>
      </div>
      {banner && (
        <div className={`px-3.5 py-1.5 text-center text-lg font-black tracking-wide
          ${banner === 'cancelled' ? 'bg-red-500 text-white' : banner === 'updated' ? 'animate-pulse bg-amber-400 text-slate-900' : 'bg-sky-400 text-slate-950'}`}
        >
          {banner === 'cancelled' ? t('kds.statusCancelled') : t(`kds.${banner}`)}
        </div>
      )}
      {card.orderNote && (
        <div className="mx-3.5 mt-2.5 rounded-lg bg-amber-950 px-2.5 py-2 text-lg font-extrabold text-amber-200">⚠ {card.orderNote}</div>
      )}
      {card.tickets.map((ticket) => (
        <div key={ticket.id} className="border-t border-slate-800 first:border-t-0">
          {expo && (
            <div className="flex items-center justify-between px-3.5 pt-2 text-sm font-extrabold uppercase text-slate-400">
              <span>{ticket.stationId === 0 ? t('kds.expo') : ticket.stationName}</span>
              <span className={`rounded-md px-2 py-0.5 ${STATUS_CHIP[ticket.status]}`}>{t(STATUS_KEY[ticket.status])}</span>
            </div>
          )}
          <ul className="px-2 pb-2.5 pt-1.5">{ticket.items.map(line)}</ul>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 px-3.5 pb-3 pt-1 text-sm font-bold text-slate-500">
        <span>{t('kds.tapToBump')}</span>
        {!expo && card.status === 'new' && (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onStart(card.tickets[0].id) }}
            className="h-11 rounded-lg bg-blue-600 px-4 text-base font-extrabold text-white"
          >
            {t('kds.start')}
          </button>
        )}
      </div>
    </div>
  )
}
