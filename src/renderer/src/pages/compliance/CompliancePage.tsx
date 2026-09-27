import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { Button, PageHeader, toast } from '../../components/ui'
import type { FiscalStatus, JournalVerification } from '../../../../shared/fiscal'
import { JournalStatusCard } from './JournalStatusCard'
import { ArchiveCard } from './ArchiveCard'
import { AttestationCard } from './AttestationCard'
import { GuaranteesCard } from './GuaranteesCard'

/**
 * Admin → Fiscal compliance (v4, LF 2026 art. 74): journal status + verification, last fiscal
 * number, 6-year archive export, vendor attestation template and what the software guarantees.
 */
export function CompliancePage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<FiscalStatus | null>(null)
  const [verification, setVerification] = useState<JournalVerification | null>(null)
  const [verifying, setVerifying] = useState(false)

  const verify = useCallback(async (announce: boolean): Promise<void> => {
    setVerifying(true)
    try {
      const result = await window.api.fiscal.verify()
      setVerification(result)
      setStatus(await window.api.fiscal.getStatus())
      if (announce) {
        if (result.ok) toast.success(t('compliance.status.verified'))
        else toast.error(t('compliance.status.verifyFailed'))
      }
    } finally {
      setVerifying(false)
    }
  }, [t])

  useEffect(() => {
    void window.api.fiscal.getStatus().then((value) => {
      setStatus(value)
      setVerification(value.lastVerification)
    })
    void verify(false)
  }, [verify])

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={t('compliance.title')}
        subtitle={t('compliance.subtitle')}
        icon={<ShieldCheck />}
        actions={
          <Button size="lg" icon={<RefreshCw />} loading={verifying} onClick={() => void verify(true)} cooldownMs={800}>
            {t('compliance.verify')}
          </Button>
        }
      />
      <div className="space-y-6">
        <JournalStatusCard status={status} verification={verification} verifying={verifying} />
        <div className="grid gap-6 xl:grid-cols-2 items-start">
          <ArchiveCard status={status} />
          <AttestationCard />
        </div>
        <GuaranteesCard />
      </div>
    </div>
  )
}
