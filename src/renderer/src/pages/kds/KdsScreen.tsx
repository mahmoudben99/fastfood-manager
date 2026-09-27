import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KDS_CANCEL_FLASH_MS,
  KDS_UNDO_MS,
  kdsLocalName,
  parseKdsStation,
  type KdsCard as KdsCardData,
  type KdsItemView,
  type KdsSnapshot,
  type KdsStationFilter
} from '../../../../shared/kds'
import { KdsCard } from './KdsCard'
import { playNewTicketBeep } from './kds-i18n'

const readLocal = (key: string): string | null => {
  try { return localStorage.getItem(key) } catch { return null }
}
const writeLocal = (key: string, value: string): void => {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

interface Toast {
  text: string
  undo?: () => void
}

/**
 * In-app kitchen display (#/kds), opened on a second monitor from Admin → Kitchen Display.
 * Same model as the LAN page (src/main/tablet/kds-page.ts): IPC snapshots + `kds:changed` pushes.
 */
export function KdsScreen() {
  const { t, i18n } = useTranslation()
  const [station, setStation] = useState<KdsStationFilter>(() => parseKdsStation(readLocal('kds_station')))
  const [snapshot, setSnapshot] = useState<KdsSnapshot | null>(null)
  const [skew, setSkew] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [toast, setToast] = useState<Toast | null>(null)
  const [flashKey, setFlashKey] = useState(0)
  const [failed, setFailed] = useState(false)
  const [soundOn, setSoundOn] = useState(() => readLocal('kds_sound_local') !== '0')
  const [showAllDay, setShowAllDay] = useState(() => readLocal('kds_allday') !== '0')
  const known = useRef<Set<string> | null>(null)
  const soundRef = useRef(soundOn)
  const inFlight = useRef(false)
  const again = useRef(false)
  soundRef.current = soundOn

  const apply = useCallback((next: KdsSnapshot) => {
    setSkew(Date.parse(next.serverTime) - Date.now())
    const keys = new Set(next.cards.map((card) => card.key))
    const fresh = !!known.current && next.cards.some((card) => card.status === 'new' && !known.current!.has(card.key))
    known.current = keys
    setHidden((current) => new Set([...current].filter((key) => keys.has(key))))
    setSnapshot(next)
    if (fresh) {
      if (next.settings.sound && soundRef.current) playNewTicketBeep()
      if (next.settings.flash) setFlashKey((value) => value + 1)
    }
  }, [])

  const load = useCallback(async () => {
    if (inFlight.current) {
      again.current = true
      return
    }
    inFlight.current = true
    try {
      do {
        again.current = false
        apply(await window.api.kds.getTickets(station))
        setFailed(false)
      } while (again.current)
    } catch (error) {
      console.error('[KDS] Could not load tickets:', error)
      setFailed(true)
    } finally {
      inFlight.current = false
    }
  }, [apply, station])

  useEffect(() => {
    known.current = null
    setSnapshot(null)
    void load()
    const unsubscribe = window.api.kds.onChanged(() => { void load() })
    const poll = setInterval(() => { void load() }, 30_000)
    return () => {
      unsubscribe()
      clearInterval(poll)
    }
  }, [load])

  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.undo ? KDS_UNDO_MS : 2500)
    return () => clearTimeout(timer)
  }, [toast])

  const now = nowMs + skew
  const expo = station === 'all'

  const unhide = (key: string): void => setHidden((current) => {
    const next = new Set(current)
    next.delete(key)
    return next
  })

  const bump = (card: KdsCardData): void => {
    if (card.status === 'cancelled') {
      setDismissed((current) => new Set(current).add(card.key + card.cancelledAt))
      return
    }
    setHidden((current) => new Set(current).add(card.key))
    const ticketId = card.tickets[0]?.id
    const request = expo ? window.api.kds.bumpOrder(card.orderId) : window.api.kds.bump(ticketId)
    request.then((result) => {
      if (!result.ok) {
        unhide(card.key)
        setToast({ text: t('kds.actionFailed') })
        return
      }
      setToast({
        text: t('kds.bumpedToast', { n: card.dailyNumber }),
        undo: () => {
          const undo = expo ? window.api.kds.recallOrder(card.orderId) : window.api.kds.recall(ticketId)
          void undo.then(() => unhide(card.key))
        }
      })
    }, () => {
      unhide(card.key)
      setToast({ text: t('kds.actionFailed') })
    })
  }

  const lineDone = (item: KdsItemView): void => {
    void window.api.kds.lineDone(item.id, !item.doneAt).then((result) => {
      if (!result.ok) setToast({ text: t('kds.actionFailed') })
    })
  }

  const recallLast = (): void => {
    void window.api.kds.recallLast(station).then((result) => {
      if (!result.ok) setToast({ text: result.error === 'nothing_to_recall' ? t('kds.nothingToRecall') : t('kds.actionFailed') })
    })
  }

  const changeStation = (value: string): void => {
    const next = parseKdsStation(value)
    writeLocal('kds_station', String(next))
    setStation(next)
  }

  const cards = (snapshot?.cards ?? []).filter((card) =>
    !hidden.has(card.key) &&
    !dismissed.has(card.key + card.cancelledAt) &&
    !(card.cancelledAt && now - Date.parse(card.cancelledAt) > KDS_CANCEL_FLASH_MS))
  const allDay = showAllDay ? snapshot?.allDay ?? [] : []
  const clock = new Date(now)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0b0f17] text-slate-100">
      <style>{`
        @keyframes kds-card-in { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
        .kds-card-in { animation: kds-card-in .35s ease-out }
        @keyframes kds-screen-flash { 0% { opacity: 0 } 15% { opacity: .35 } 100% { opacity: 0 } }
        .kds-screen-flash { animation: kds-screen-flash .9s ease-out forwards }
      `}</style>

      <header className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-800 bg-gray-900 px-3.5">
        <h1 className="whitespace-nowrap text-xl font-extrabold">{t('kds.title')}</h1>
        <select
          value={String(station)}
          onChange={(event) => changeStation(event.target.value)}
          aria-label={t('kds.station')}
          className="h-11 rounded-lg border border-slate-700 bg-gray-800 px-3 text-base font-bold text-slate-100"
        >
          <option value="all">{t('kds.expoView')}</option>
          {(snapshot?.stations ?? []).map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.id === 0 ? t('kds.expo') : entry.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={recallLast}
          disabled={!snapshot?.canRecall}
          className="h-11 rounded-lg border border-slate-700 bg-gray-800 px-3.5 text-base font-bold disabled:opacity-35"
        >
          {t('kds.recall')}
        </button>
        <button
          type="button"
          aria-pressed={showAllDay}
          onClick={() => { writeLocal('kds_allday', showAllDay ? '0' : '1'); setShowAllDay(!showAllDay) }}
          className={`h-11 rounded-lg border border-slate-700 bg-gray-800 px-3.5 text-base font-bold ${showAllDay ? '' : 'opacity-55'}`}
        >
          {t('kds.allDay')}
        </button>
        <button
          type="button"
          aria-pressed={soundOn}
          onClick={() => { writeLocal('kds_sound_local', soundOn ? '0' : '1'); setSoundOn(!soundOn) }}
          className={`h-11 rounded-lg border border-slate-700 bg-gray-800 px-3.5 text-base font-bold ${soundOn ? '' : 'opacity-55'}`}
        >
          {t('kds.sound')}
        </button>
        <span className="flex-1" />
        <span className={`flex items-center gap-1.5 whitespace-nowrap text-sm font-bold ${failed ? 'text-red-300' : 'text-green-300'}`}>
          <i className={`inline-block h-3 w-3 rounded-full ${failed ? 'animate-pulse bg-red-500' : 'bg-green-500'}`} />
          {failed ? t('kds.offline') : t('kds.live')}
        </span>
        <span className="min-w-[72px] text-end text-2xl font-extrabold tabular-nums">
          {String(clock.getHours()).padStart(2, '0')}:{String(clock.getMinutes()).padStart(2, '0')}
        </span>
      </header>

      {allDay.length > 0 && (
        <div className="flex h-13 shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-slate-800 bg-slate-950 px-3.5 py-2">
          <b className="me-1 text-sm uppercase text-slate-400">{t('kds.allDay')}</b>
          {allDay.map((row) => (
            <span key={row.key} className="rounded-full bg-slate-800 px-3 py-1.5 text-lg font-bold">
              <bdi>{kdsLocalName(row, i18n.language)}</bdi>{' '}
              <em className="not-italic text-amber-400">×{row.quantity}</em>
            </span>
          ))}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-3.5">
        {cards.length === 0 ? (
          <div className="px-5 py-20 text-center text-2xl font-bold text-slate-500">{snapshot ? t('kds.noTickets') : '…'}</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start gap-3.5">
            {cards.map((card) => (
              <KdsCard
                key={card.key}
                card={card}
                expo={expo}
                nowMs={now}
                settings={snapshot!.settings}
                onBump={bump}
                onLineDone={lineDone}
                onStart={(ticketId) => { void window.api.kds.start(ticketId) }}
              />
            ))}
          </div>
        )}
      </main>

      {flashKey > 0 && <div key={flashKey} className="kds-screen-flash pointer-events-none fixed inset-0 z-30 bg-white opacity-0" />}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-2xl bg-slate-50 py-3 pe-3.5 ps-5 text-lg font-extrabold text-slate-900 shadow-2xl">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => { const undo = toast.undo; setToast(null); undo?.() }}
              className="h-12 rounded-lg bg-slate-900 px-5 font-black text-white"
            >
              {t('kds.undo')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
