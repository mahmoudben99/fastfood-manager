import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, RefreshCw, Star, Trophy } from 'lucide-react'
import { ShiftBar, useShiftStore } from '../../../components/checkout'
import { Button, Modal } from '../../../components/ui'

/** Admin password before the Day Recap (it shows revenue and profit). */
export function RecapGate({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const unlock = async (): Promise<void> => {
    setBusy(true)
    try {
      if (await window.api.settings.verifyPassword(password)) onUnlocked()
      else setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title={t('dayRecap.title')}
      footer={<Button size="lg" icon={<Lock />} loading={busy} onClick={unlock} disabled={!password}>{t('pos.recap.unlock')}</Button>}
    >
      <input
        type="password"
        placeholder={t('pos.recap.password')}
        data-ui="input"
        autoFocus
        value={password}
        onChange={(e) => { setPassword(e.target.value); setError(false) }}
        onKeyDown={(e) => { if (e.key === 'Enter' && password) void unlock() }}
        aria-invalid={error || undefined}
        className={`w-full h-14 rounded-xl border bg-surface px-4 text-center text-xl tracking-widest text-ink focus:outline-none focus:ring-4 ${error ? 'border-danger bg-danger-soft focus:ring-danger/20 pos-shake' : 'border-line-strong focus:border-primary focus:ring-primary/15'}`}
      />
      {error && <p className="pt-2 text-center text-sm font-semibold text-danger-ink">{t('nav.wrongPassword')}</p>}
    </Modal>
  )
}

/** NO_OPEN_SHIFT: open the shift right here (full ShiftBar panel); the same checkout retries by itself. */
export function ShiftPrompt({ onClose, onRetry }: { onClose: () => void; onRetry: () => void }) {
  const { t } = useTranslation()
  const shiftOpen = useShiftStore((s) => Boolean(s.shift && s.shift.status === 'open'))
  // Only a shift opened HERE triggers the retry (a stale "open" store state must not loop).
  const openedAtMount = useRef(shiftOpen)
  const retried = useRef(false)
  useEffect(() => {
    if (shiftOpen && !openedAtMount.current && !retried.current) {
      retried.current = true
      onRetry()
    }
  }, [shiftOpen, onRetry])
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      title={t('pos.shift.title')}
      description={t('pos.shift.body')}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="lg" icon={<RefreshCw />} onClick={onRetry}>{t('pos.shift.retry')}</Button>
        </>
      }
    >
      <ShiftBar />
    </Modal>
  )
}

/** 10th / 50th / 100th… order of the day. Pointer-transparent, gone after 4s. */
export function Milestone({ number }: { number: number }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none">
      <div className="bg-ember rounded-3xl px-12 py-8 text-center shadow-e4 animate-pop-in">
        <Trophy className="h-14 w-14 mx-auto mb-2 text-white" />
        <p className="num text-display text-white">{number}</p>
        <p className="text-xl font-bold text-white">{t('pos.milestone', { count: number })}</p>
        <div className="flex justify-center gap-1 mt-3">
          {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-5 w-5 text-white fill-white" />)}
        </div>
      </div>
    </div>
  )
}
