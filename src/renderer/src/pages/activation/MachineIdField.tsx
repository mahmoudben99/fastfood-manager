import { ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { Button } from '../../components/ui/Button'

interface MachineIdFieldProps {
  machineId: string
  label?: ReactNode
  hint?: ReactNode
}

/** Read-only machine ID (LTR, monospace, select-all) with a Copy button that confirms for 2s. */
export function MachineIdField({ machineId, label, hint }: MachineIdFieldProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = () => {
    navigator.clipboard
      .writeText(machineId)
      .then(() => {
        setCopied(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  return (
    <div>
      {label && <p className="mb-1.5 text-sm font-medium text-ink-2">{label}</p>}
      <div className="flex items-stretch gap-2">
        <div
          dir="ltr"
          className="flex min-h-12 min-w-0 flex-1 items-center select-all break-all rounded-xl border border-line bg-surface-2 px-4 py-2 font-mono text-sm text-ink"
        >
          {machineId || '…'}
        </div>
        <Button
          variant="secondary"
          size="lg"
          onClick={copy}
          disabled={!machineId}
          icon={copied ? <Check className="h-5 w-5 text-success-ink" /> : <Copy className="h-5 w-5" />}
        >
          {copied ? t('activation.copied') : t('activation.copyMachineId')}
        </Button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}
