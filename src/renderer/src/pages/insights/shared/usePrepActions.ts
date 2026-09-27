import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../../components/ui'

/**
 * Print the prep + shopping list on the receipt printer / send the morning prep to Telegram,
 * with toasts in the UI language (main-process errors are English: mapped to plain messages).
 */
export function usePrepActions(): {
  print: (date?: string) => Promise<void>
  send: (date?: string) => Promise<void>
  busy: 'print' | 'send' | null
} {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<'print' | 'send' | null>(null)

  const print = useCallback(async (date?: string) => {
    setBusy('print')
    try {
      const result = await window.api.insights.printPrepList(date)
      if (result.success) {
        toast.success(t('insights.prep.printed'), { description: result.printerName })
      } else {
        const noPrinter = /no printer/i.test(result.error ?? '')
        toast.error(t(noPrinter ? 'insights.prep.noPrinter' : 'insights.prep.printFailed'), {
          description: noPrinter ? t('insights.prep.noPrinterHint') : result.error
        })
      }
    } catch (error) {
      toast.error(t('insights.prep.printFailed'), { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(null)
    }
  }, [t])

  const send = useCallback(async (date?: string) => {
    setBusy('send')
    try {
      const result = await window.api.insights.sendMorningPrep(date)
      if (result.ok) toast.success(t('insights.telegram.sent'))
      else if (/not configured/i.test(result.error ?? '')) {
        toast.warning(t('insights.telegram.notConfigured'), { description: t('insights.telegram.notConfiguredHint') })
      } else toast.error(t('insights.telegram.failed'), { description: t('insights.telegram.failedHint') })
    } catch (error) {
      toast.error(t('insights.telegram.failed'), { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(null)
    }
  }, [t])

  return { print, send, busy }
}
