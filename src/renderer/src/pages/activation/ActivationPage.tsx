import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { ShieldCheck, Copy, Check } from 'lucide-react'

export function ActivationPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setActivated } = useAppStore()
  const [machineId, setMachineId] = useState('')
  const [serialCode, setSerialCode] = useState('')
  const [error, setError] = useState('')
  const [activating, setActivating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.api.activation.getMachineId().then(setMachineId)
  }, [])

  const copyMachineId = () => {
    navigator.clipboard.writeText(machineId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatInput = (value: string) => {
    // Strip non-hex characters and auto-format as XXXXX-XXXXX-XXXXX-XXXXX
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

  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-4">
            <ShieldCheck className="h-8 w-8 text-orange-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('activation.title')}</h1>
          <p className="text-sm text-gray-500 mt-2">{t('activation.subtitle')}</p>
        </div>

        {/* Machine ID */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('activation.machineId')}
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-lg px-4 py-2.5 font-mono text-sm text-gray-800 select-all">
              {machineId}
            </div>
            <button
              onClick={copyMachineId}
              className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              title={t('activation.copyMachineId')}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 text-gray-500" />
              )}
            </button>
          </div>
        </div>

        {/* Serial Code Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('activation.serialCode')}
          </label>
          <input
            type="text"
            value={serialCode}
            onChange={(e) => setSerialCode(formatInput(e.target.value))}
            placeholder={t('activation.serialPlaceholder')}
            className="w-full border rounded-lg px-4 py-2.5 font-mono text-sm tracking-wider text-center uppercase focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
            maxLength={23}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg text-center">
            {error}
          </div>
        )}

        {/* Activate Button */}
        <Button
          onClick={handleActivate}
          loading={activating}
          disabled={serialCode.length < 23}
          className="w-full justify-center"
        >
          {t('activation.activate')}
        </Button>

        {/* Contact info */}
        <p className="text-xs text-gray-400 text-center mt-4">{t('activation.contact')}</p>
      </div>
    </div>
  )
}
