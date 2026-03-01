'use client'

import { useState } from 'react'

export function ExcelUploadForm({ machineId, currentStatus }: { machineId: string; currentStatus: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [status, setStatus] = useState(currentStatus)

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('machineId', machineId)

      const res = await fetch('/api/menu-setup', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()

      if (data.ok) {
        setResult({ ok: true, message: 'Excel uploaded successfully! Client will auto-download it.' })
        setStatus('ready')
        setFile(null)
      } else {
        setResult({ ok: false, message: data.error || 'Upload failed' })
      }
    } catch (err: any) {
      setResult({ ok: false, message: err.message || 'Upload failed' })
    } finally {
      setUploading(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await fetch('/api/menu-setup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId, status: newStatus })
      })
      const data = await res.json()
      if (data.ok) {
        setStatus(newStatus)
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      {/* File input */}
      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="flex-1 text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-50 file:text-orange-700 file:cursor-pointer hover:file:bg-orange-100"
        />
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? 'Uploading...' : 'Upload Excel'}
        </button>
      </div>

      {/* Result message */}
      {result && (
        <div className={`p-3 rounded-lg text-sm ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.message}
        </div>
      )}

      {/* Status control */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <span className="text-sm text-gray-500">Status:</span>
        {['pending', 'processing', 'ready', 'completed'].map((s) => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              status === s
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
    </div>
  )
}
