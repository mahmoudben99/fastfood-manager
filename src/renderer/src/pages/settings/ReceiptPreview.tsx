import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileWarning } from 'lucide-react'
import { EmptyState, Skeleton } from '../../components/ui'

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
 * The iframe is `.receipt-paper`: always white, whatever the app theme.
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
    return <EmptyState compact icon={<FileWarning />} title={t('receiptEditor.previewUnavailable')} />
  }

  if (html === null) {
    return (
      <div className="mx-auto max-w-full" style={{ width: widthPx }}>
        <Skeleton className="h-[480px] rounded-md" />
      </div>
    )
  }

  return (
    <iframe
      title={t('receiptEditor.livePreview')}
      srcDoc={html}
      sandbox=""
      className="receipt-paper mx-auto block min-h-[480px] flex-1 rounded-sm shadow-e3"
      style={{ width: widthPx, maxWidth: '100%' }}
    />
  )
}
