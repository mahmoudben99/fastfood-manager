'use client'

import { useState } from 'react'

export default function ResetPage() {
  const [machineId, setMachineId] = useState('')
  const [generatedCode, setGeneratedCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!machineId.trim()) return
    setError('')
    setLoading(true)
    setGeneratedCode('')
    try {
      const res = await fetch('/api/reset/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId: machineId.trim().toUpperCase() })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to generate code')
      } else {
        setGeneratedCode(data.code)
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-2">One-Time Reset Code</h1>
      <p className="text-gray-500 text-sm mb-6">
        Generate a one-time password reset code for a specific machine. The code expires in 24 hours and can only be used once.
        The user enters this in the app&apos;s &quot;Forgot Password&quot; screen.
      </p>

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
            {loading ? 'Generating…' : 'Generate Reset Code'}
          </button>
        </form>

        {generatedCode && (
          <div className="mt-5 border-t border-gray-100 pt-5">
            <p className="text-sm font-medium text-gray-700 mb-1">One-Time Reset Code</p>
            <p className="text-xs text-gray-400 mb-2">Valid for 24 hours. Send this to the user.</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono text-lg tracking-widest select-all text-center font-bold">
                {generatedCode}
              </div>
              <button
                onClick={handleCopy}
                className="shrink-0 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors font-medium"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-orange-600 mt-2">⚠ This code will only be shown once. Save it now.</p>
          </div>
        )}
      </div>
    </div>
  )
}
