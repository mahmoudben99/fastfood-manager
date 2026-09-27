import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, LineChart } from 'lucide-react'
import { Card } from '../../../components/ui'
import { CopyField, InfoNote } from '../SettingsFeedback'

const OWNER_BASE = 'fastfood-manager.vercel.app/owner/'

/** Settings > Owner link: the remote owner dashboard URL + QR (login = admin password). */
export function OwnerLinkSection() {
  const { t } = useTranslation()
  const [machineId, setMachineId] = useState<string | null>(null)
  const [qr, setQr] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const owner = await window.api.tablet.getOwnerDashboard()
        setQr(owner.qrDataUrl)
      } catch {
        /* ignore */
      }
      try {
        setMachineId((await window.api.activation.getMachineId()) || '')
      } catch {
        setMachineId('')
      }
    })()
  }, [])

  return (
    <div>
      <div className="space-y-6">

        {machineId === null ? null : machineId ? (
          <Card title={t('settings.ownerDashboard')} icon={<LineChart />}>
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="space-y-3 min-w-0">
                <CopyField
                  value={`https://${OWNER_BASE}${machineId}`}
                  display={`${OWNER_BASE}${machineId}`}
                  copyLabel={t('settings.copyLink')}
                />
                <p className="text-sm text-muted">{t('settings.ownerQrScan')}</p>
                <p className="flex items-center gap-2 text-sm text-muted">
                  <KeyRound className="h-4 w-4 shrink-0" />
                  {t('settings.v4.ownerLoginShort')}
                </p>
              </div>
              {qr && <QrTile src={qr} alt={t('settings.ownerDashboardQrAlt')} />}
            </div>
          </Card>
        ) : (
          <InfoNote tone="warning">{t('settings.machineIdLoadError')}</InfoNote>
        )}
      </div>
    </div>
  )
}

/** QR codes stay black-on-white in both themes (scanners need the contrast). */
export function QrTile({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="receipt-paper justify-self-center rounded-2xl border border-line p-3 shadow-e1">
      <img src={src} alt={alt} className="h-44 w-44" />
    </div>
  )
}
