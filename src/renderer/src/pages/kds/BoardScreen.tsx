import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck, Flame } from 'lucide-react'
import { cn } from '../../components/ui/cn'
import type { KdsBoardState } from '../../../../shared/kds'
import { playReadyChime } from './kds-i18n'

/* A new ready number pops 4 times (finite), then settles. Transform only. */
const BOARD_CSS = `
  @keyframes board-pop { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.08) } }
  .board-fresh { animation: board-pop 1.2s ease-in-out 4 }
`

/**
 * In-app customer order board (#/board) for a dining-room screen: "Preparing" / "Ready"
 * numbers fed by the kitchen tickets. Same data as the LAN page at /board. Always dark,
 * sized in vh so the numbers read from across the room on any TV.
 */
export function BoardScreen() {
  const { t } = useTranslation()
  const [board, setBoard] = useState<KdsBoardState | null>(null)
  const [skew, setSkew] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [logo, setLogo] = useState<string | null>(null)
  const seen = useRef<Set<number> | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await window.api.kds.getBoard()
      setSkew(Date.parse(next.serverTime) - Date.now())
      const ids = new Set(next.ready.map((entry) => entry.orderId))
      const fresh = !!seen.current && next.ready.some((entry) => !seen.current!.has(entry.orderId))
      seen.current = ids
      setBoard(next)
      if (fresh) playReadyChime()
    } catch (error) {
      console.error('[Board] Could not load the order board:', error)
    }
  }, [])

  useEffect(() => {
    void load()
    const unsubscribe = window.api.kds.onChanged(() => { void load() })
    const poll = setInterval(() => { void load() }, 15_000)
    const tick = setInterval(() => setNowMs(Date.now()), 1000)
    return () => {
      unsubscribe()
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [load])

  useEffect(() => {
    let alive = true
    window.api.settings.getLogoDataUrl().then((url) => { if (alive) setLogo(url || null) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const now = nowMs + skew
  const clearMs = (board?.clearMinutes ?? 5) * 60_000
  const ready = (board?.ready ?? []).filter((entry) => entry.readyAt && now - Date.parse(entry.readyAt) < clearMs)
  const clock = new Date(now)
  const name = board?.restaurantName || t('kds.boardTitle')

  return (
    <div className="dark flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      <style>{BOARD_CSS}</style>
      <header className="flex h-[13vh] shrink-0 items-center gap-[2vw] border-b border-line bg-surface px-[4vw]">
        <span className="flex h-[8vh] w-[8vh] shrink-0 items-center justify-center overflow-hidden rounded-[2vh] bg-ember text-[4.5vh] font-black shadow-glow">
          {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : name.trim().charAt(0).toUpperCase()}
        </span>
        <h1 className="min-w-0 flex-1 truncate text-[5vh] font-black leading-tight">
          <bdi>{name}</bdi>
        </h1>
        <span className="num text-[5vh] font-extrabold text-muted">
          {String(clock.getHours()).padStart(2, '0')}:{String(clock.getMinutes()).padStart(2, '0')}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <Column
          className="w-[42%]"
          icon={<Flame className="h-[5.2vh] w-[5.2vh] shrink-0" aria-hidden="true" />}
          title={t('kds.preparing')}
          tone="text-warning-ink"
        >
          {board && board.preparing.length === 0 && <Dash />}
          {board?.preparing.map((entry) => (
            <div
              key={entry.orderId}
              className="num min-w-[2.3ch] rounded-[2vh] border-2 border-line-strong bg-surface-2 px-[1.4vw] py-[1.2vh] text-center text-[8vh] font-black leading-none text-ink-2"
            >
              {entry.number}
            </div>
          ))}
        </Column>

        <Column
          className="flex-1 border-s-2 border-line bg-success-soft/40"
          icon={<CircleCheck className="h-[5.2vh] w-[5.2vh] shrink-0" aria-hidden="true" />}
          title={t('kds.ready')}
          subtitle={t('kds.boardReadyHint')}
          tone="text-success-ink"
        >
          {board && ready.length === 0 && <Dash />}
          {ready.map((entry) => {
            const fresh = now - Date.parse(entry.readyAt!) < 30_000
            return (
              <div
                key={entry.orderId}
                className={cn(
                  'num min-w-[2.3ch] rounded-[2vh] px-[1.6vw] py-[1.4vh] text-center text-[12vh] font-black leading-none',
                  fresh ? 'board-fresh bg-success text-canvas shadow-e3' : 'border-2 border-success/50 bg-success-soft text-success-ink'
                )}
              >
                {entry.number}
              </div>
            )
          })}
        </Column>
      </div>
    </div>
  )
}

function Column({ className, icon, title, subtitle, tone, children }: {
  className: string
  icon: ReactNode
  title: string
  subtitle?: string
  tone: string
  children: ReactNode
}) {
  return (
    <section className={cn('flex min-w-0 flex-col overflow-hidden px-[3vw] py-[3.5vh]', className)}>
      <div className="mb-[3.5vh]">
        <h2 className={cn('flex items-center gap-[1vw] text-[5.2vh] font-black uppercase leading-[1.05] tracking-wide rtl:normal-case rtl:tracking-normal', tone)}>
          {icon}
          {title}
        </h2>
        {subtitle && <p className="mt-[1.4vh] text-[2.8vh] font-semibold text-ink-2">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap content-start gap-x-[2vw] gap-y-[2.4vh]">{children}</div>
    </section>
  )
}

function Dash() {
  return <div className="text-[7vh] font-extrabold text-faint">—</div>
}
