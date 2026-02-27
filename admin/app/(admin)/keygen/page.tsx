'use client'

import { useState } from 'react'

export default function KeygenPage() {
  const [machineId, setMachineId] = useState('')
  const [serialCode, setSerialCode] = useState('')
  const [unlockCode, setUnlockCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<'serial' | 'unlock' | null>(null)

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!machineId.trim()) return
    setError('')
    setLoading(true)
    setSerialCode('')
    setUnlockCode('')
    try {
      const res = await fetch('/api/keygen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId: machineId.trim().toUpperCase() })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to generate code')
      } else {
        setSerialCode(data.serialCode)
        setUnlockCode(data.unlockCode)
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, type: 'serial' | 'unlock') => {
    navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-2">Key Generator</h1>
      <p className="text-gray-500 text-sm mb-6">Generate a serial activation code or unlock/reset code for a machine ID.</p>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Machine ID</label>
            <input
              type="text"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4E5F6G7H8"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || !machineId.trim()}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Generating…' : 'Generate Codes'}
          </button>
        </form>

        {serialCode && (
          <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
            <CodeResult
              label="Serial Activation Code"
              description="User enters this to activate the app (full license)"
              code={serialCode}
              onCopy={() => copyToClipboard(serialCode, 'serial')}
              copied={copied === 'serial'}
            />
            <CodeResult
              label="Unlock / Reset Code"
              description="User enters this to reset their admin password (permanent, reusable)"
              code={unlockCode}
              onCopy={() => copyToClipboard(unlockCode, 'unlock')}
              copied={copied === 'unlock'}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function CodeResult({
  label,
  description,
  code,
  onCopy,
  copied
}: {
  label: string
  description: string
  code: string
  onCopy: () => void
  copied: boolean
}) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-0.5">{label}</p>
      <p className="text-xs text-gray-400 mb-2">{description}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono text-sm select-all">
          {code}
        </div>
        <button
          onClick={onCopy}
          className="shrink-0 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors font-medium"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
