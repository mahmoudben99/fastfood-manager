import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReceiptText } from 'lucide-react'
import { EmptyState, Skeleton } from '../../../components/ui'

/** Paper width declared by the receipt document's own body rule (72mm or 48mm). */
export function receiptPaperWidth(html: string): string {
  const match = html.match(/body\s*\{[^}]*?(?<![-\w])width\s*:\s*([\d.]+mm)/)
  return match?.[1] ?? '72mm'
}

/**
 * The receipt is a full document with its own reset CSS and dir attribute, so it renders in an
 * isolated, script-less iframe. Injecting it into the app page collapsed the app's spacing,
 * switched it to Courier, and lost RTL. `.receipt-paper` stays white in both themes.
 */
export function ReceiptPreview({ orderId, version }: { orderId: number; version: number }) {
  const { t } = useTranslation()
  const [html, setHtml] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    setHtml(undefined)
    Promise.resolve(window.api.printer.previewReceipt(orderId))
      .then((result: string | null) => { if (live) setHtml(result || null) })
      .catch(() => { if (live) setHtml(null) })
    return () => { live = false }
  }, [orderId, version])

  if (html === undefined) {
    return (
      <div className="flex justify-center rounded-2xl bg-surface-2 p-4">
        <Skeleton className="h-[60vh] w-[19rem] max-w-full" />
      </div>
    )
  }
  if (html === null) {
    return <EmptyState compact icon={<ReceiptText />} title={t('orderHistory.receipt.unavailable')} />
  }
  return (
    <div className="flex justify-center rounded-2xl bg-surface-2 p-4">
      <iframe
        title={t('orders.previewReceipt')}
        srcDoc={html}
        sandbox=""
        className="receipt-paper h-[62vh] max-w-full rounded-lg border border-line shadow-e2"
        style={{ width: `calc(${receiptPaperWidth(html)} + 24px)` }}
      />
    </div>
  )
}
