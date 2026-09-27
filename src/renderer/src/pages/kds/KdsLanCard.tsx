import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChefHat, Check, Copy, KeyRound, QrCode, Tv, Wifi, WifiOff } from 'lucide-react'
import { Button, Card, Input, toast } from '../../components/ui'
import type { KdsLanInfo } from '../../../../shared/kds'
import { KdsHint } from './KdsHint'

interface Props {
  lan: KdsLanInfo | null
  pin: string
  /** Called after a successful PIN change so the page reloads the settings. */
  onPinChanged: () => Promise<void>
}

/** Admin → Kitchen Display: LAN links (QR + copy) for tablets / TVs, and the kitchen-screen PIN. */
export function KdsLanCard({ lan, pin, onPinChanged }: Props) {
  const { t } = useTranslation()
  const [nextPin, setNextPin] = useState('')
  const [busy, setBusy] = useState(false)

  const changePin = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.api.kds.setPin(nextPin.trim())
      if (!result.ok) {
        toast.error(t('kds.pinInvalid'))
        return
      }
      setNextPin('')
      await onPinChanged()
      toast.success(t('kds.saved'))
    } catch {
      toast.error(t('kds.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card icon={<Wifi />} title={t('kds.lanTitle')} actions={lan?.running ? <KdsHint text={t('kds.lanHint')} /> : undefined}>
      {lan?.running ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <LinkTile icon={<ChefHat />} label={t('kds.pinTitle')} url={lan.kdsUrl} qr={lan.kdsQr} />
          <LinkTile icon={<Tv />} label={t('kds.boardShort')} url={lan.boardUrl} qr={lan.boardQr} />
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl bg-warning-soft p-4 text-sm font-medium text-warning-ink">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{t('kds.lanOff')}</p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <span className="flex items-center gap-2 text-base font-semibold text-ink">
          <KeyRound className="h-5 w-5 text-primary-ink" aria-hidden="true" />
          {t('kds.pin')}
          <KdsHint text={t('kds.pinHint')} />
        </span>
        <bdi className="num flex min-h-12 items-center rounded-xl border border-line bg-surface-2 px-4 text-2xl font-black tracking-[0.3em] text-ink">
          {pin}
        </bdi>
        <span className="flex-1" />
        <div className="w-36">
          <Input
            aria-label={t('kds.newPin')}
            placeholder={t('kds.newPin')}
            inputSize="lg"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={nextPin}
            onChange={(event) => setNextPin(event.target.value.replace(/\D/g, ''))}
            className="num"
          />
        </div>
        <Button variant="secondary" size="lg" loading={busy} disabled={nextPin.length < 4} onClick={() => void changePin()}>
          {t('kds.changePin')}
        </Button>
      </div>
    </Card>
  )
}

function LinkTile({ icon, label, url, qr }: { icon: ReactNode; label: string; url: string; qr: string | null }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success(t('kds.linkCopied'))
    } catch {
      toast.error(t('kds.copyFailed'))
    }
  }

  return (
    <div className="flex gap-4 rounded-2xl border border-line bg-surface-2 p-3">
      {qr ? (
        <img src={qr} alt="" className="h-28 w-28 shrink-0 rounded-xl border border-line" />
      ) : (
        <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-faint">
          <QrCode className="h-10 w-10" aria-hidden="true" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-primary-ink">
          {icon}
          {label}
        </p>
        <p className="mt-1 break-all font-mono text-sm text-ink-2">
          <bdi>{url}</bdi>
        </p>
        <div className="mt-auto pt-2">
          <Button
            variant="secondary"
            size="lg"
            icon={copied ? <Check className="h-5 w-5 text-success-ink" /> : <Copy className="h-5 w-5" />}
            onClick={() => void copy()}
          >
            {t('kds.copyLink')}
          </Button>
        </div>
      </div>
    </div>
  )
}
