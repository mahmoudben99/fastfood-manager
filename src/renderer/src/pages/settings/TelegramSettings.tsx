import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, ChevronDown, Eye, EyeOff, Power, Send } from 'lucide-react'
import { Badge, Button, Card, IconButton, Input, Toggle, toast } from '../../components/ui'
import { InfoNote } from './SettingsFeedback'
import { useTouchKeyboard } from './useTouchKeyboard'

/**
 * Settings > Telegram: the owner's bot (order notifications, Z reports, morning prep list,
 * insights alerts and the admin password reset code all go through it).
 */
export function TelegramSettings() {
  const { t } = useTranslation()
  const kb = useTouchKeyboard()
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [autoStart, setAutoStart] = useState(false)
  const [orderNotifications, setOrderNotifications] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [startError, setStartError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void (async () => {
      const config = await window.api.telegram.getConfig()
      setToken(config.token)
      setChatId(config.chatId)
      setAutoStart(config.autoStart)
      setOrderNotifications(config.orderNotifications)
      setIsRunning(config.isRunning)
    })()
  }, [])

  const saveConfig = async () => {
    setSaving(true)
    try {
      await window.api.telegram.saveConfig({ token, chatId, autoStart, orderNotifications })
      toast.success(t('settings.saved'))
    } catch (err) {
      toast.error(t('common.error'), { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleStart = async () => {
    setStartError('')
    setLoading(true)
    // Save config first
    await window.api.telegram.saveConfig({ token, chatId, autoStart, orderNotifications })
    const result = await window.api.telegram.start()
    if (!result.success) {
      setStartError(result.error || t('settings.v4.tgStartFailed'))
      setLoading(false)
      return
    }
    // start() only means "the bot was constructed" — grammy's connection handshake resolves
    // later. Poll the real status briefly and report what actually happened.
    let connected = false
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500))
      try {
        const status = await window.api.telegram.status()
        if (status?.isRunning) {
          connected = true
          break
        }
      } catch {
        /* keep polling */
      }
    }
    setIsRunning(connected)
    if (!connected) setStartError(t('settings.v4.tgConnectFailed'))
    else toast.success(t('settings.v4.tgStarted'))
    setLoading(false)
  }

  const handleStop = async () => {
    setLoading(true)
    await window.api.telegram.stop()
    setIsRunning(false)
    setLoading(false)
  }

  const steps: { title: string; lines: string[] }[] = [
    { title: t('settings.v4.tgStep1'), lines: [t('settings.v4.tgStep1a'), t('settings.v4.tgStep1b'), t('settings.v4.tgStep1c')] },
    { title: t('settings.v4.tgStep2'), lines: [t('settings.v4.tgStep2a'), t('settings.v4.tgStep2b'), t('settings.v4.tgStep2c')] },
    { title: t('settings.v4.tgStep3'), lines: [t('settings.v4.tgStep3a'), t('settings.v4.tgStep3b')] }
  ]

  return (
    <div>
      <div className="space-y-6">
        <Card
          title={t('settings.v4.tgBotTitle')}
          icon={<Send />}
          actions={
            <Badge variant={isRunning ? 'success' : 'neutral'} size="md" dot>
              {isRunning ? t('settings.telegramRunning') : t('settings.telegramStopped')}
            </Badge>
          }
        >
          <div className="space-y-4">
            <Input
              label={t('settings.telegramToken')}
              type={showToken ? 'text' : 'password'}
              dir="ltr"
              placeholder={t('settings.telegramTokenPlaceholder')}
              trailing={
                <IconButton
                  icon={showToken ? <EyeOff /> : <Eye />}
                  label={showToken ? t('settings.v4.hide') : t('settings.v4.show')}
                  size="sm"
                  onClick={() => setShowToken(!showToken)}
                />
              }
              {...kb.bind('token', token, setToken, { extended: false })}
            />
            <Input
              label={t('settings.telegramChatId')}
              dir="ltr"
              placeholder={t('settings.telegramChatIdPlaceholder')}
              {...kb.bind('chatId', chatId, setChatId, { extended: false })}
            />
          </div>
        </Card>

        <Card title={t('settings.v4.tgBehaviourTitle')} icon={<Bell />}>
          <div className="divide-y divide-line">
            <div className="pb-3">
              <Toggle checked={autoStart} onChange={setAutoStart} label={t('settings.telegramAutoStart')} />
            </div>
            <div className="pt-3">
              <Toggle
                checked={orderNotifications}
                onChange={setOrderNotifications}
                label={t('settings.telegramOrderNotify')}
              />
            </div>
          </div>
        </Card>

        {startError && <InfoNote tone="danger">{startError}</InfoNote>}

        <div className="flex flex-wrap items-center gap-3">
          {isRunning ? (
            <Button variant="secondary" size="lg" icon={<Power className="h-5 w-5" />} onClick={handleStop} loading={loading}>
              {t('settings.telegramStopBot')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="lg"
              icon={<Power className="h-5 w-5" />}
              onClick={() => { void handleStart() }}
              loading={loading}
              disabled={!token || !chatId}
            >
              {t('settings.telegramStartBot')}
            </Button>
          )}
          <Button size="lg" onClick={() => { void saveConfig() }} loading={saving} disabled={!token || !chatId} className="min-w-32">
            {t('common.save')}
          </Button>
        </div>

        {/* Setup guide: collapsed by default (only needed once). */}
        <details className="group rounded-2xl border border-line bg-surface-2">
          <summary className="tap flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            {t('settings.telegramInstructions').replace(/[:：]\s*$/, '')}
            <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <ol className="grid gap-5 border-t border-line p-5 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={i} className="space-y-2">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  <span className="num h-7 w-7 shrink-0 rounded-full bg-ember text-on-primary text-sm flex items-center justify-center">
                    {i + 1}
                  </span>
                  {step.title}
                </p>
                <ul className="space-y-1.5 ps-9 text-sm text-ink-2 leading-relaxed">
                  {step.lines.map((line, j) => (
                    <li key={j}>{line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </details>
      </div>
      {kb.keyboard()}
    </div>
  )
}
