import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChefHat, TriangleAlert } from 'lucide-react'
import { EmptyState, Skeleton } from '../../components/ui'
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
import { KdsTopBar } from './KdsTopBar'
import { playNewTicketBeep } from './kds-i18n'

const readLocal = (key: string): string | null => {
  try { return localStorage.getItem(key) } catch { return null }
}
const writeLocal = (key: string, value: string): void => {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

interface Toast {
  text: string
  error?: boolean
  undo?: () => void
}

/* Finite kitchen animations (the live dot is the only infinite one). Opacity/transform only. */
const KDS_CSS = `
  @keyframes kds-flash-once { 0% { opacity: 0 } 15% { opacity: .3 } 100% { opacity: 0 } }
  .kds-screen-flash { animation: kds-flash-once .9s ease-out forwards }
  @keyframes kds-blink { 0%, 100% { opacity: 1 } 50% { opacity: .55 } }
  .kds-cancel-flash { animation: kds-blink .8s ease-in-out 5 }
  .kds-banner-pulse { animation: kds-blink 1.2s ease-in-out 3 }
`

/**
 * In-app kitchen display (#/kds), opened on a second monitor from Admin → Kitchen Display.
 * Same model as the LAN page (src/main/tablet/kds-page.ts): IPC snapshots + `kds:changed` pushes.
 * Always dark (the `dark` class on the root re-points the Ember tokens), whatever the app theme.
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
  const fail = (text = t('kds.actionFailed')): void => setToast({ text, error: true })

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
        fail()
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
      fail()
    })
  }

  const lineDone = (item: KdsItemView): void => {
    void window.api.kds.lineDone(item.id, !item.doneAt).then((result) => {
      if (!result.ok) fail()
    })
  }

  const recallLast = (): void => {
    void window.api.kds.recallLast(station).then((result) => {
      if (!result.ok) fail(result.error === 'nothing_to_recall' ? t('kds.nothingToRecall') : t('kds.actionFailed'))
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
  const pad = (n: number): string => String(n).padStart(2, '0')

  return (
    <div className="dark flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      <style>{KDS_CSS}</style>

      <KdsTopBar
        station={station}
        stations={snapshot?.stations ?? []}
        onStation={changeStation}
        canRecall={!!snapshot?.canRecall}
        onRecall={recallLast}
        showAllDay={showAllDay}
        onToggleAllDay={() => { writeLocal('kds_allday', showAllDay ? '0' : '1'); setShowAllDay(!showAllDay) }}
        soundOn={soundOn}
        onToggleSound={() => { writeLocal('kds_sound_local', soundOn ? '0' : '1'); setSoundOn(!soundOn) }}
        failed={failed}
        openCount={snapshot ? cards.filter((card) => card.status !== 'cancelled').length : null}
        clock={`${pad(clock.getHours())}:${pad(clock.getMinutes())}`}
      />

      {allDay.length > 0 && (
        <div className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-line bg-surface-2 px-4 py-2">
          <b className="me-1 text-sm font-extrabold uppercase tracking-wide text-muted rtl:normal-case rtl:tracking-normal">{t('kds.allDay')}</b>
          {allDay.map((row) => (
            <span key={row.key} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-lg font-bold text-ink">
              <bdi>{kdsLocalName(row, i18n.language)}</bdi>
              <span className="num font-black text-primary-ink">×{row.quantity}</span>
            </span>
          ))}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4">
        {!snapshot ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] items-start gap-4" aria-busy="true">
            {[0, 1, 2].map((index) => <Skeleton key={index} className="h-72 rounded-2xl" />)}
          </div>
        ) : cards.length === 0 ? (
          <EmptyState
            icon={<ChefHat />}
            title={<span className="text-2xl">{t('kds.noTickets')}</span>}
            className="h-full"
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] items-start gap-4">
            {cards.map((card) => (
              <KdsCard
                key={card.key}
                card={card}
                expo={expo}
                nowMs={now}
                settings={snapshot.settings}
                onBump={bump}
                onLineDone={lineDone}
                onStart={(ticketId) => { void window.api.kds.start(ticketId) }}
              />
            ))}
          </div>
        )}
      </main>

      {flashKey > 0 && <div key={flashKey} className="kds-screen-flash pointer-events-none fixed inset-0 z-30 bg-primary opacity-0" />}

      {toast && (
        <div
          role="status"
          className="animate-slide-in-up fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-4 rounded-2xl bg-inverse py-3 pe-3 ps-5 text-xl font-extrabold text-on-inverse shadow-e4"
        >
          {toast.error && <TriangleAlert className="h-6 w-6 shrink-0 text-danger-strong" aria-hidden="true" />}
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => { const undo = toast.undo; setToast(null); undo?.() }}
              className="tap min-h-14 rounded-xl bg-ember px-6 text-lg font-black"
            >
              {t('kds.undo')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
