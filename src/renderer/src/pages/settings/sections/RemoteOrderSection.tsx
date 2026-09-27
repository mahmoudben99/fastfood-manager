import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, QrCode, Smartphone } from 'lucide-react'
import { Button, Card, Toggle } from '../../../components/ui'
import { CopyField, InfoNote } from '../SettingsFeedback'
import { QrTile } from './OwnerLinkSection'
import { TabletPinDialog } from './TabletPinDialog'

const ORDER_BASE = 'fastfood-manager.vercel.app/r/'

type RemoteInboxBridge = {
  getEnabled?: () => Promise<{ ok?: boolean; enabled?: boolean } | undefined>
  setEnabled?: (enabled: boolean) => Promise<{ ok?: boolean; pendingIntegration?: boolean } | undefined>
}
const remoteInbox = (): RemoteInboxBridge | undefined => (window as unknown as { remoteInbox?: RemoteInboxBridge }).remoteInbox

/** Settings > Remote ordering: cloud QR ordering flag, link/QR, and the LAN tablet PIN. */
export function RemoteOrderSection() {
  const { t } = useTranslation()
  const [machineId, setMachineId] = useState<string | null>(null)
  const [qr, setQr] = useState('')
  // WP-G: per-restaurant remote-ordering flag (cloud, DEFAULT OFF). null = loading.
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  // True while the secure device-token path (WP-D) is not integrated: toggle locked, flag stays OFF.
  const [pending, setPending] = useState(false)
  const [pinEnabled, setPinEnabled] = useState(false)
  const [pinSet, setPinSet] = useState(true)
  const [pinDialog, setPinDialog] = useState<'change' | 'enable' | null>(null)

  useEffect(() => {
    void (async () => {
      const settings = await window.api.settings.getAll()
      setPinEnabled(settings.tablet_pin_enabled === '1')
      setPinSet(!!settings.tablet_pin)
      try {
        const mid = await window.api.activation.getMachineId()
        setMachineId(mid || '')
        if (mid) {
          const QRCode = (await import('qrcode')).default
          setQr(await QRCode.toDataURL(`https://${ORDER_BASE}${mid}`, { width: 256, margin: 2 }))
        }
      } catch {
        setMachineId((prev) => prev ?? '')
      }
      // Fails closed until the WP-D device-token path is integrated.
      try {
        const status = await remoteInbox()?.getEnabled?.()
        if (status && typeof status === 'object') {
          setEnabled(status.ok ? status.enabled === true : false)
          setPending(!status.ok)
        } else {
          setEnabled(false)
          setPending(true)
        }
      } catch {
        setEnabled(false)
        setPending(true)
      }
    })()
  }, [])

  const toggleRemote = async (next: boolean) => {
    if (busy || pending) return
    setBusy(true)
    try {
      const result = await remoteInbox()?.setEnabled?.(next)
      if (result?.ok) setEnabled(next)
      else if (result?.pendingIntegration) setPending(true)
    } catch {
      /* keep previous state */
    } finally {
      setBusy(false)
    }
  }

  const togglePin = async (next: boolean) => {
    // Never turn protection on without a PIN: tablets would silently fall back to "0000".
    if (next) {
      setPinDialog('enable')
      return
    }
    try {
      await window.api.tablet.setPinEnabled(false)
      setPinEnabled(false)
    } catch (err) {
      console.error('Failed to disable tablet PIN:', err)
    }
  }

  return (
    <div>
      <div className="space-y-6">
        <Card title={t('settings.v4.remoteCloudTitle')} icon={<Smartphone />}>
          <div className="space-y-4">
            <Toggle
              checked={enabled === true}
              disabled={enabled === null || busy || pending}
              onChange={(v) => { void toggleRemote(v) }}
              label={t('settings.remoteOrderingEnable')}
              description={enabled === null ? t('settings.remoteOrderingLoading') : t('settings.v4.remoteEnableShort')}
            />
            {pending && <InfoNote tone="warning">{t('settings.v4.remotePendingShort')}</InfoNote>}
          </div>
        </Card>

        {machineId === null ? null : machineId ? (
          <Card title={t('settings.orderingLink')} icon={<QrCode />}>
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0 space-y-3">
                <CopyField
                  value={`https://${ORDER_BASE}${machineId}`}
                  display={`${ORDER_BASE}${machineId}`}
                  copyLabel={t('settings.copyLink')}
                />
                <p className="text-sm text-muted">{t('settings.orderQrPrintHint')}</p>
              </div>
              {qr && <QrTile src={qr} alt={t('settings.remoteOrderQrAlt')} />}
            </div>
          </Card>
        ) : (
          <InfoNote tone="warning">{t('settings.machineIdLoadError')}</InfoNote>
        )}

        <Card title={t('settings.tabletPinTitle')} icon={<Lock />}>
          <div className="space-y-4">
            <Toggle
              checked={pinEnabled}
              onChange={(v) => { void togglePin(v) }}
              label={t('settings.tabletPinEnable')}
              description={t('settings.tabletPinEnableDesc')}
            />
            {pinEnabled && !pinSet && <InfoNote tone="warning">{t('settings.tabletPinNotSet')}</InfoNote>}
            {pinEnabled && (
              <Button variant="secondary" size="lg" icon={<Lock className="h-5 w-5" />} onClick={() => setPinDialog('change')}>
                {t('settings.tabletPinChange')}
              </Button>
            )}
          </div>
        </Card>
      </div>

      {pinDialog && (
        <TabletPinDialog
          mode={pinDialog}
          onClose={() => setPinDialog(null)}
          onSaved={() => {
            setPinSet(true)
            if (pinDialog === 'enable') setPinEnabled(true)
            setPinDialog(null)
          }}
        />
      )}
    </div>
  )
}
