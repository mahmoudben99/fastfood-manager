import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { ShieldCheck, Clock, Copy, Check, Wifi, AlertCircle } from 'lucide-react'

export function ActivationPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setActivated, setActivationType, setTrialStatus, setTrialExpiresAt } = useAppStore()

  const [machineId, setMachineId] = useState('')
  const [serialCode, setSerialCode] = useState('')
  const [error, setError] = useState('')
  const [activating, setActivating] = useState(false)
  const [startingTrial, setStartingTrial] = useState(false)
  const [copied, setCopied] = useState(false)
  const [trialError, setTrialError] = useState('')

  useEffect(() => {
    window.api.activation.getMachineId().then(setMachineId)
  }, [])

  const copyMachineId = () => {
    navigator.clipboard.writeText(machineId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatInput = (value: string) => {
    const clean = value.replace(/[^A-Fa-f0-9-]/g, '').toUpperCase()
    const digits = clean.replace(/-/g, '')
    const parts: string[] = []
    for (let i = 0; i < digits.length && i < 20; i += 5) {
      parts.push(digits.slice(i, i + 5))
    }
    return parts.join('-')
  }

  const handleActivate = async () => {
    setError('')
    setActivating(true)
    try {
      const result = await window.api.activation.activate(serialCode)
      if (result.success) {
        setActivated(true)
        setActivationType('full')
        navigate('/setup')
      } else {
        setError(t('activation.invalidCode'))
      }
    } catch {
      setError(t('activation.invalidCode'))
    } finally {
      setActivating(false)
    }
  }

  const handleStartTrial = async () => {
    setTrialError('')
    setStartingTrial(true)
    try {
      const result = await window.api.trial.start()
      if (result.success) {
        setActivated(true)
        setActivationType('trial')
        setTrialStatus('active')
        if (result.expiresAt) setTrialExpiresAt(new Date(result.expiresAt))
        navigate('/setup')
      } else if (result.error === 'trial_exists') {
        // Already started a trial on this machine — let them in
        setActivated(true)
        setActivationType('trial')
        setTrialStatus('active')
        navigate('/setup')
      } else {
        setTrialError(result.error || 'Could not start trial. Please check your internet connection.')
      }
    } catch {
      setTrialError('Could not connect to server. Please check your internet connection.')
    } finally {
      setStartingTrial(false)
    }
  }

  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">

        {/* Header */}
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-white">Fast Food Manager</h1>
          <p className="text-gray-400 text-sm mt-1">Choose how to get started</p>
        </div>

        {/* ── Card 1: Serial Code ── */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">I have a license</h2>
              <p className="text-xs text-gray-500">Enter your serial code to activate</p>
            </div>
          </div>

          {/* Machine ID */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('activation.machineId')}</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-100 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 select-all">
                {machineId || '…'}
              </div>
              <button
                onClick={copyMachineId}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                title="Copy Machine ID"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-500" />}
              </button>
            </div>
          </div>

          {/* Serial Code Input */}
          <div className="mb-3">
            <input
              type="text"
              value={serialCode}
              onChange={(e) => setSerialCode(formatInput(e.target.value))}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              className="w-full border rounded-lg px-3 py-2.5 font-mono text-sm tracking-wider text-center uppercase focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              maxLength={23}
            />
          </div>

          {error && (
            <div className="mb-3 flex items-center gap-2 text-red-600 text-xs bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <Button
            onClick={handleActivate}
            loading={activating}
            disabled={serialCode.length < 23}
            className="w-full justify-center"
          >
            {t('activation.activate')}
          </Button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-600" />
          <span className="text-gray-400 text-xs font-medium">OR</span>
          <div className="flex-1 h-px bg-gray-600" />
        </div>

        {/* ── Card 2: Free Trial ── */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Start Free Trial</h2>
              <p className="text-xs text-gray-500">7 days, full features — no credit card</p>
            </div>
          </div>

          <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2 mb-4">
            <Wifi className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              Requires internet. App will show a warning if offline, and lock after 5 minutes without connection.
            </p>
          </div>

          {trialError && (
            <div className="mb-3 flex items-center gap-2 text-red-600 text-xs bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {trialError}
            </div>
          )}

          <Button
            onClick={handleStartTrial}
            loading={startingTrial}
            className="w-full justify-center bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
          >
            Start 7-Day Free Trial
          </Button>
        </div>

        <p className="text-xs text-gray-500 text-center">
          Need a license? Contact us to purchase.
        </p>
      </div>
    </div>
  )
}
