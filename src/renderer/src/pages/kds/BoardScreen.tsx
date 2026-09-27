import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { KdsBoardState } from '../../../../shared/kds'
import { playReadyChime } from './kds-i18n'

/**
 * In-app customer order board (#/board) for a dining-room screen: "Preparing" / "Ready"
 * numbers fed by the kitchen tickets. Same data as the LAN page at /board.
 */
export function BoardScreen() {
  const { t } = useTranslation()
  const [board, setBoard] = useState<KdsBoardState | null>(null)
  const [skew, setSkew] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
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

  const now = nowMs + skew
  const clearMs = (board?.clearMinutes ?? 5) * 60_000
  const ready = (board?.ready ?? []).filter((entry) => entry.readyAt && now - Date.parse(entry.readyAt) < clearMs)
  const clock = new Date(now)
  const empty = <div className="text-[7vh] font-extrabold text-slate-700">—</div>

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0b0f17] text-slate-50">
      <style>{`
        @keyframes board-pop { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.08) } }
        .board-fresh { animation: board-pop 1.2s ease-in-out 4 }
      `}</style>
      <header className="flex h-[12vh] items-center justify-between border-b-2 border-slate-800 px-[4vw]">
        <h1 className="text-[5vh] font-black">{board?.restaurantName || t('kds.boardTitle')}</h1>
        <span className="text-[5vh] font-extrabold tabular-nums text-slate-400">
          {String(clock.getHours()).padStart(2, '0')}:{String(clock.getMinutes()).padStart(2, '0')}
        </span>
      </header>
      <div className="flex flex-1">
        <section className="flex-1 overflow-hidden px-[3vw] py-[3vh]">
          <h2 className="mb-[3vh] text-[6vh] font-black uppercase tracking-wide text-amber-400">{t('kds.preparing')}</h2>
          <div className="flex flex-wrap content-start gap-x-[2.2vw] gap-y-[2.2vh]">
            {board && board.preparing.length === 0 && empty}
            {board?.preparing.map((entry) => (
              <div key={entry.orderId} className="min-w-[2.2ch] rounded-[2vh] bg-gray-900 px-[1.4vw] py-[1.2vh] text-center text-[8vh] font-black leading-none tabular-nums text-slate-200">
                {entry.number}
              </div>
            ))}
          </div>
        </section>
        <section className="flex-1 overflow-hidden border-s-2 border-slate-800 px-[3vw] py-[3vh]">
          <h2 className="mb-[3vh] text-[6vh] font-black uppercase tracking-wide text-green-400">{t('kds.ready')}</h2>
          <div className="flex flex-wrap content-start gap-x-[2.2vw] gap-y-[2.2vh]">
            {board && ready.length === 0 && empty}
            {ready.map((entry) => {
              const fresh = now - Date.parse(entry.readyAt!) < 30_000
              return (
                <div
                  key={entry.orderId}
                  className={`min-w-[2.2ch] rounded-[2vh] px-[1.4vw] py-[1.2vh] text-center text-[11vh] font-black leading-none tabular-nums
                    ${fresh ? 'board-fresh bg-green-500 text-green-950' : 'bg-green-900 text-green-100'}`}
                >
                  {entry.number}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
