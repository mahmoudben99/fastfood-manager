import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Clock, Download, FileSpreadsheet, Package, ShieldAlert, Upload, Users, UtensilsCrossed } from 'lucide-react'
import { Badge, Button, Card, IconButton, PageHeader, cn, toast } from '../../components/ui'
import { exportWorkbook } from './parts/exportWorkbook'
import { VersionHistoryCard, type MenuVersion } from './parts/VersionHistoryCard'

interface ExcelImportExportProps {
  /** Rendered inside Settings → Data: no page header, cards only. */
  embedded?: boolean
}

const errorText = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback

/** Excel export + menu recovery points. Excel *import* stays on a safety hold (see card). */
export function ExcelImportExport({ embedded = false }: ExcelImportExportProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const restoreDisabled = import.meta.env.PROD
  const [versions, setVersions] = useState<MenuVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [savingVersion, setSavingVersion] = useState(false)

  const loadVersions = async () => {
    try {
      const list = await window.api.data.listVersions()
      setVersions(list)
    } catch {
      // ignore
    } finally {
      setLoadingVersions(false)
    }
  }

  useEffect(() => {
    void loadVersions()
  }, [])

  const stamp = () => {
    const now = new Date()
    return `${now.toLocaleDateString(undefined, { numberingSystem: 'latn' })} ${now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      numberingSystem: 'latn'
    })}`
  }

  const exportData = async () => {
    setExporting(true)
    try {
      await exportWorkbook()
      toast.success(t('excel.exportDone'))
    } catch (error) {
      toast.error(t('excel.exportFailed'), { description: errorText(error, '') || undefined })
    } finally {
      setExporting(false)
    }
  }

  const saveRecoveryPoint = async () => {
    setSavingVersion(true)
    try {
      const result = await window.api.data.saveVersion(t('excel.manualRecoveryLabel', { date: stamp() }))
      if (!result?.success) throw new Error(t('excel.recoverySaveFailed'))
      toast.success(t('excel.recoverySaved'))
      await loadVersions()
    } catch (error) {
      toast.error(errorText(error, t('excel.recoverySaveFailed')))
    } finally {
      setSavingVersion(false)
    }
  }

  const handleRestore = async (versionId: number) => {
    if (restoreDisabled) {
      toast.error(t('excel.restoreDisabledDesc'))
      return
    }
    try {
      // Save current state before restoring
      const saved = await window.api.data.saveVersion(t('excel.beforeRestoreLabel', { date: stamp() }))
      if (!saved?.success) throw new Error(t('excel.beforeRestoreFailed'))

      const restored = await window.api.data.restoreVersion(versionId)
      if (!restored?.success) throw new Error(t('excel.restoreVersionFailed'))
      toast.success(t('excel.restoreSuccess'))
      void loadVersions()
    } catch (error) {
      toast.error(errorText(error, t('excel.restoreVersionFailed')))
    }
  }

  const handleDelete = async (versionId: number) => {
    try {
      const result = await window.api.data.deleteVersion(versionId)
      if (!result?.success) throw new Error(t('excel.deleteVersionFailed'))
      setVersions((prev) => prev.filter((v) => v.id !== versionId))
      toast.success(t('excel.versionDeleted'))
    } catch (error) {
      toast.error(errorText(error, t('excel.deleteVersionFailed')))
    }
  }

  const liveEditLinks = [
    { to: '/admin/menu', label: t('nav.menu'), icon: <UtensilsCrossed /> },
    { to: '/admin/stock', label: t('nav.stock'), icon: <Package /> },
    { to: '/admin/workers', label: t('nav.workers'), icon: <Users /> }
  ]

  return (
    <>
      {!embedded && <PageHeader icon={<FileSpreadsheet />} title={t('excel.title')} />}

      {/* @container: 2 columns only when THIS block is wide (embedded Settings column is ~450px). */}
      <div className={cn('@container', embedded ? 'mb-4' : 'mb-6')}>
        <div className={cn('grid @3xl:grid-cols-2', embedded ? 'gap-4' : 'gap-6')}>
          <Card title={t('excel.downloadMenuTitle')} icon={<Download />}>
            <div className="flex flex-wrap gap-2" title={t('excel.downloadMenuDesc')}>
              <Button
                size="lg"
                icon={<FileSpreadsheet className="h-5 w-5" />}
                loading={exporting}
                cooldownMs={800}
                onClick={exportData}
              >
                {t('excel.exportExcel')}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                icon={<Clock className="h-5 w-5" />}
                loading={savingVersion}
                title={t('excel.saveRecovery')}
                onClick={saveRecoveryPoint}
              >
                {t('excel.recoveryPointBtn')}
              </Button>
            </div>
          </Card>

          {/* Production-disabled until a stable-ID, non-destructive updater is available. */}
          <Card
            title={t('excel.updateMenuTitle')}
            icon={<Upload />}
            actions={
              <span title={t('excel.updateDisabledDesc')}>
                <Badge variant="warning" icon={<ShieldAlert />}>
                  {t('excel.updateDisabledBadge')}
                </Badge>
              </span>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="me-1 text-sm text-muted">{t('excel.editIn')}</span>
              {liveEditLinks.map((link) => (
                <IconButton
                  key={link.to}
                  icon={link.icon}
                  label={link.label}
                  variant="secondary"
                  size="lg"
                  onClick={() => navigate(link.to)}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>

      <VersionHistoryCard
        versions={versions}
        loading={loadingVersions}
        restoreDisabled={restoreDisabled}
        savingVersion={savingVersion}
        onSaveRecovery={saveRecoveryPoint}
        onRestore={handleRestore}
        onDelete={handleDelete}
      />
    </>
  )
}
