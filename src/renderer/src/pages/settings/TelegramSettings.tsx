import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Eye, EyeOff, Check, AlertCircle } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'

export function TelegramSettings() {
  const { t } = useTranslation()
  const { inputMode } = useAppStore()
  const isTouch = inputMode === 'touchscreen'
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [autoStart, setAutoStart] = useState(false)
  const [orderNotifications, setOrderNotifications] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [saved, setSaved] = useState(false)
  const [startError, setStartError] = useState('')
  const [loading, setLoading] = useState(false)

  // Virtual keyboard
  const [keyboardTarget, setKeyboardTarget] = useState<{ field: string; type: 'numeric' | 'text' } | null>(null)

  const getKeyboardValue = (): string => {
    if (!keyboardTarget) return ''
    switch (keyboardTarget.field) {
      case 'token': return token
      case 'chatId': return chatId
      default: return ''
    }
  }

  const handleKeyboardChange = (val: string) => {
    if (!keyboardTarget) return
    switch (keyboardTarget.field) {
      case 'token': setToken(val); break
      case 'chatId': setChatId(val); break
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    const config = await window.api.telegram.getConfig()
    setToken(config.token)
    setChatId(config.chatId)
    setAutoStart(config.autoStart)
    setOrderNotifications(config.orderNotifications)
    setIsRunning(config.isRunning)
  }

  const saveConfig = async () => {
    await window.api.telegram.saveConfig({ token, chatId, autoStart, orderNotifications })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleStart = async () => {
    setStartError('')
    setLoading(true)
    // Save config first
    await window.api.telegram.saveConfig({ token, chatId, autoStart, orderNotifications })
    const result = await window.api.telegram.start()
    if (result.success) {
      setIsRunning(true)
    } else {
      setStartError(result.error || 'Failed to start bot')
    }
    setLoading(false)
  }

  const handleStop = async () => {
    setLoading(true)
    await window.api.telegram.stop()
    setIsRunning(false)
    setLoading(false)
  }

  return (
    <Card>
      <div className="space-y-5 max-w-xl">
        <div className="flex items-center gap-2 mb-2">
          <Send className="h-5 w-5 text-blue-500" />
          <h3 className="font-semibold">{t('settings.telegram')}</h3>
          <div className="ms-auto flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-green-500' : 'bg-red-400'}`}
            />
            <span className="text-sm text-gray-500">
              {isRunning
                ? t('settings.telegramRunning', { defaultValue: 'Running' })
                : t('settings.telegramStopped', { defaultValue: 'Stopped' })}
            </span>
          </div>
        </div>

        {/* Bot Token */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('settings.telegramToken', { defaultValue: 'Bot Token' })}
          </label>
          <div className="flex items-center gap-2">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              readOnly={isTouch}
              onClick={isTouch ? () => setKeyboardTarget({ field: 'token', type: 'text' }) : undefined}
              onChange={isTouch ? undefined : (e) => setToken(e.target.value)}
              placeholder={t('settings.telegramTokenPlaceholder', {
                defaultValue: 'Paste your bot token from @BotFather'
              })}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className={`${isTouch ? 'p-3' : 'p-2'} hover:bg-gray-100 rounded-lg`}
            >
              {showToken ? (
                <EyeOff className={`${isTouch ? 'h-5 w-5' : 'h-4 w-4'} text-gray-500`} />
              ) : (
                <Eye className={`${isTouch ? 'h-5 w-5' : 'h-4 w-4'} text-gray-500`} />
              )}
            </button>
          </div>
        </div>

        {/* Chat ID */}
        <Input
          label={t('settings.telegramChatId', { defaultValue: 'Chat ID' })}
          value={chatId}
          readOnly={isTouch}
          onClick={isTouch ? () => setKeyboardTarget({ field: 'chatId', type: 'text' }) : undefined}
          onChange={isTouch ? undefined : (e) => setChatId(e.target.value)}
          placeholder={t('settings.telegramChatIdPlaceholder', {
            defaultValue: 'Your Telegram chat ID'
          })}
        />

        {/* Auto-start */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => setAutoStart(e.target.checked)}
            className={`${isTouch ? 'w-6 h-6' : 'w-4 h-4'} rounded border-gray-300 text-orange-500 focus:ring-orange-500`}
          />
          <span className={`${isTouch ? 'text-base' : 'text-sm'} text-gray-700`}>
            {t('settings.telegramAutoStart', {
              defaultValue: 'Auto-start bot when app launches'
            })}
          </span>
        </label>

        {/* Order Notifications */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={orderNotifications}
            onChange={(e) => setOrderNotifications(e.target.checked)}
            className={`${isTouch ? 'w-6 h-6' : 'w-4 h-4'} rounded border-gray-300 text-orange-500 focus:ring-orange-500`}
          />
          <div>
            <span className="text-sm text-gray-700">
              {t('settings.telegramOrderNotify', {
                defaultValue: 'Send order notifications'
              })}
            </span>
            <p className="text-xs text-gray-400">
              {t('settings.telegramOrderNotifyDesc', {
                defaultValue: 'Get a Telegram message every time a new order is placed'
              })}
            </p>
          </div>
        </label>

        {/* Buttons */}
        <div className="flex gap-3">
          <Button onClick={saveConfig} disabled={!token || !chatId}>
            {t('common.save')}
          </Button>
          {isRunning ? (
            <Button variant="secondary" onClick={handleStop} loading={loading}>
              {t('settings.telegramStopBot', { defaultValue: 'Stop Bot' })}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={handleStart}
              loading={loading}
              disabled={!token || !chatId}
            >
              {t('settings.telegramStartBot', { defaultValue: 'Start Bot' })}
            </Button>
          )}
        </div>

        {/* Status messages */}
        {saved && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-green-50 text-green-700">
            <Check className="h-4 w-4" />
            {t('settings.saved')}
          </div>
        )}

        {startError && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-700">
            <AlertCircle className="h-4 w-4" />
            {startError}
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 space-y-1">
          <p className="font-medium">
            {t('settings.telegramInstructions', { defaultValue: 'How to set up:' })}
          </p>
          <p>1. Open @BotFather on Telegram</p>
          <p>2. Send /newbot and follow instructions</p>
          <p>3. Copy the token and paste it above</p>
          <p>4. Send /start to @userinfobot to get your Chat ID</p>
        </div>
      </div>

      {/* Virtual Keyboard for touchscreen mode */}
      {isTouch && keyboardTarget && (
        <VirtualKeyboard
          visible
          type={keyboardTarget.type}
          value={getKeyboardValue()}
          onChange={handleKeyboardChange}
          onClose={() => setKeyboardTarget(null)}
        />
      )}
    </Card>
  )
}
