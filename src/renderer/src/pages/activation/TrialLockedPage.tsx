import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { ShieldX, WifiOff, Copy, Check, KeyRound } from 'lucide-react'
import splashBg from '../../assets/splash-screen.png'

interface TrialLockedPageProps {
  reason: 'expired' | 'paused' | 'offline' | string
  offlineSecondsLeft?: number | null
}

export function TrialLockedPage({ reason, offlineSecondsLeft }: TrialLockedPageProps) {
  const navigate = useNavigate()
  const { setActivated, setTrialStatus } = useAppStore()
  const [machineId, setMachineId] = useState('')
  const [copied, setCopied] = useState(false)
  const [showMachineId, setShowMachineId] = useState(false)

  const isOffline = reason === 'offline'

  const handleShowMachineId = async () => {
    if (!machineId) {
      const id = await window.api.activation.getMachineId()
      setMachineId(id)
    }
    setShowMachineId(true)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(machineId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleEnterCode = () => {
    setActivated(false)
    setTrialStatus(null)
    navigate('/activate')
  }

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        backgroundImage: `url(${splashBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 text-center">
        {/* Icon */}
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
          isOffline ? 'bg-yellow-100' : 'bg-red-100'
        }`}>
          {isOffline
            ? <WifiOff className="h-8 w-8 text-yellow-500" />
            : <ShieldX className="h-8 w-8 text-red-500" />
          }
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {isOffline
            ? (offlineSecondsLeft && offlineSecondsLeft > 0
                ? `No Internet — ${formatCountdown(offlineSecondsLeft)}`
                : 'App Locked — No Internet')
            : reason === 'paused'
              ? 'Trial Paused'
              : 'Free Trial Expired'
          }
        </h1>

        {/* Subtitle */}
        <p className="text-gray-500 text-sm mb-5">
          {isOffline
            ? 'The free trial requires an internet connection to verify your license. Please reconnect to continue.'
            : reason === 'paused'
              ? 'Your trial has been paused by the administrator. Please contact us to resume access.'
              : 'Your 7-day free trial has ended. Activate with a serial code to continue using Fast Food Manager.'
          }
        </p>

        {/* Countdown progress bar for offline */}
        {isOffline && offlineSecondsLeft != null && offlineSecondsLeft > 0 && (
          <div className="mb-5">
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-yellow-400 to-red-500 rounded-full transition-all duration-1000"
                style={{ width: `${Math.max(0, (1 - offlineSecondsLeft / 120) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">App will lock when timer reaches zero</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {!isOffline && (
            <button
              onClick={handleEnterCode}
              className="w-full py-2.5 px-4 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
            >
              <KeyRound className="h-4 w-4" />
              Enter Activation Code
            </button>
          )}

          <button
            onClick={handleShowMachineId}
            className="w-full py-2.5 px-4 rounded-xl border-2 border-gray-200 text-gray-600 text-sm font-medium hover:border-gray-300 transition-colors"
          >
            Show Machine ID (for support)
          </button>
        </div>

        {/* Machine ID display */}
        {showMachineId && machineId && (
          <div className="mt-4 p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500 mb-2">Send this ID to support to get an activation code:</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 select-all text-gray-800">
                {machineId}
              </div>
              <button
                onClick={handleCopy}
                className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {copied
                  ? <Check className="h-4 w-4 text-green-500" />
                  : <Copy className="h-4 w-4 text-gray-500" />
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
