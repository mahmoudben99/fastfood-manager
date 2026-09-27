import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Loader2 } from 'lucide-react'

export interface PreviewTemplate {
  name: string
  blocks: string
  is_active: number
}

interface ReceiptPreviewProps {
  /** Unsaved template being edited; null = the built-in default receipt. */
  template: PreviewTemplate | null
  /** Receipt printer paper width in mm (58 or 80). */
  paperWidth: number
  /** Bump to re-render when data outside the template changed (social accounts, logo…). */
  refreshKey?: number
}

/**
 * Shows the exact HTML the receipt printer prints for a sample order (contract C2), rendered in a
 * script-less sandboxed iframe at the paper's width. Debounced so typing does not flood IPC.
 */
export function ReceiptPreview({ template, paperWidth, refreshKey = 0 }: ReceiptPreviewProps) {
  const { t } = useTranslation()
  const [html, setHtml] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const payload = template ? JSON.stringify(template) : ''

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const out = await window.api.printer.previewTemplate(payload ? JSON.parse(payload) : null)
        if (cancelled) return
        if (typeof out === 'string' && out.trim()) {
          setHtml(out)
          setFailed(false)
        } else {
          setFailed(true)
        }
      } catch {
        // Handler missing (older main process) or the render failed: never break the editor.
        if (!cancelled) setFailed(true)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [payload, refreshKey])

  const widthPx = Math.round((paperWidth * 96) / 25.4)

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-400">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{t('receiptEditor.previewUnavailable')}</p>
      </div>
    )
  }

  if (html === null) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <iframe
      title={t('receiptEditor.livePreview')}
      srcDoc={html}
      sandbox=""
      className="block mx-auto bg-white shadow-sm border border-gray-200 flex-1 min-h-[480px]"
      style={{ width: widthPx, maxWidth: '100%' }}
    />
  )
}
