import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArchiveRestore,
  DatabaseBackup,
  FolderOpen,
  FolderPlus,
  HardDrive,
  RotateCcw,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  PageHeader,
  cn,
  toast
} from '../../components/ui'

interface BackupFile {
  name: string
  path: string
  date: string
  size: number
}

interface BackupRestoreProps {
  /** Rendered inside Settings → Data: no page header, cards only. */
  embedded?: boolean
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    numberingSystem: 'latn'
  })
}

/** Backup folders + "Backup now", the always-on live backup, and restore from a .db file. */
export function BackupRestore({ embedded = false }: BackupRestoreProps) {
  const { t } = useTranslation()
  const [paths, setPaths] = useState<string[]>([])
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)

  const loadData = async () => {
    try {
      const [p, b] = await Promise.all([window.api.backup.getPaths(), window.api.backup.listAvailable()])
      setPaths(p)
      setBackups(b)
    } catch {
      toast.error(t('common.error'), { id: 'backup-load' })
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const addPath = async () => {
    const result = await window.api.backup.addPath()
    if (result) {
      setPaths(result)
      void loadData()
    }
  }

  const removePath = async (path: string) => {
    const result = await window.api.backup.removePath(path)
    setPaths(result)
    void loadData()
  }

  const backupNow = async () => {
    setBackingUp(true)
    try {
      const results: Array<{ path: string; success: boolean; error?: string }> =
        await window.api.backup.createNow()
      const failed = results.filter((r) => !r.success)
      if (failed.length === 0) {
        toast.success(t('backup.createdToast'))
      } else {
        toast.error(t('backup.someFailed'), {
          description: failed.map((r) => `${r.path}: ${r.error ?? ''}`).join(' · ')
        })
      }
    } catch (error) {
      toast.error(t('backup.someFailed'), { description: error instanceof Error ? error.message : undefined })
    } finally {
      setBackingUp(false)
      void loadData()
    }
  }

  /** Runs only after the explicit ConfirmDialog; main opens the file picker, validates, then swaps. */
  const restore = async () => {
    setRestoring(true)
    try {
      const result = await window.api.backup.restore()
      if (result.success) {
        toast.success(t('backup.restoredToast'))
      } else if (result.error !== 'Cancelled') {
        toast.error(t('backup.restoreFailed'), { description: result.error })
      }
    } catch (error) {
      toast.error(t('backup.restoreFailed'), { description: error instanceof Error ? error.message : undefined })
    } finally {
      setRestoring(false)
      setConfirmRestore(false)
    }
  }

  const addFolderButton = (
    <Button variant="secondary" size="lg" icon={<FolderPlus className="h-5 w-5" />} onClick={addPath}>
      {t('backup.addPath')}
    </Button>
  )

  // @container: the embedded Settings → Data column is ~450px even on wide screens, so the grid
  // follows its own width (2 columns from 48rem), not the viewport.
  const cards = (
    <div className="@container">
      <div className={cn('grid @3xl:grid-cols-2', embedded ? 'gap-4' : 'gap-6')}>
        {/* Backup folders (USB / second disk) */}
        <Card
          title={t('backup.paths')}
          icon={<FolderOpen />}
          actions={
            paths.length > 0 ? (
              <IconButton icon={<FolderPlus />} label={t('backup.addPath')} variant="secondary" size="lg" onClick={addPath} />
            ) : undefined
          }
        >
          {paths.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong">
              <EmptyState compact icon={<HardDrive />} title={t('backup.noFoldersTitle')} action={addFolderButton} />
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-2">
                {paths.map((path) => (
                  <li key={path} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 ps-3.5 pe-1 py-1">
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted" />
                    <bdi dir="ltr" className="min-w-0 flex-1 truncate font-mono text-sm text-ink" title={path}>
                      {path}
                    </bdi>
                    <IconButton
                      icon={<Trash2 />}
                      label={t('backup.removePath')}
                      variant="danger"
                      size="lg"
                      onClick={() => removePath(path)}
                    />
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                icon={<DatabaseBackup className="h-5 w-5" />}
                loading={backingUp}
                cooldownMs={800}
                title={t('backup.pathsHint')}
                onClick={backupNow}
              >
                {t('backup.backupNow')}
              </Button>
            </div>
          )}
        </Card>

        {/* Automatic live backup (always on, main process) */}
        <Card
          title={t('backup.liveBackup')}
          icon={<ShieldCheck />}
          actions={
            <Badge variant="success" dot>
              {t('backup.liveBadge')}
            </Badge>
          }
        >
          <p className="text-sm font-medium text-ink-2" title={t('backup.liveHint')}>
            {t('backup.liveSummary')}
          </p>
          <p
            className="mt-2 flex items-center gap-2 text-xs text-muted"
            title={`${t('backup.format')}: fastfood-manager-backup-YYYY-MM-DD.db`}
          >
            <FolderOpen className="h-4 w-4 shrink-0" aria-label={t('backup.location')} />
            <bdi dir="ltr" className="min-w-0 truncate font-mono">
              AppData/fastfood-manager/backups/
            </bdi>
          </p>
        </Card>

        {/* Restore from a backup file */}
        <Card className="@3xl:col-span-2" title={t('backup.restore')} icon={<ArchiveRestore />}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {backups.length === 0 ? (
              <p className="text-sm text-muted">{t('backup.noneYet')}</p>
            ) : (
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-ink-2">{t('backup.available')}</h4>
                <Badge variant="neutral">{backups.length}</Badge>
              </div>
            )}
            <Button
              variant="secondary"
              size="lg"
              icon={<RotateCcw className="h-5 w-5 text-danger-ink" />}
              loading={restoring}
              title={t('backup.restoreDesc')}
              onClick={() => setConfirmRestore(true)}
            >
              {t('backup.chooseFile')}
            </Button>
          </div>
          {backups.length > 0 && (
            <ul className="mt-3 max-h-72 overflow-y-auto divide-y divide-line rounded-xl border border-line">
              {backups.slice(0, 20).map((b) => (
                <li key={b.path} className="flex items-center gap-3 px-3.5 py-3 text-sm">
                  <HardDrive className="h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <bdi dir="ltr" className="block truncate font-mono text-ink" title={b.path}>
                      {b.name}
                    </bdi>
                    <span className="num text-xs text-muted">{formatDate(b.date)}</span>
                  </div>
                  <span className="num shrink-0 text-muted">{formatSize(b.size)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )

  return (
    <>
      {!embedded && (
        <PageHeader icon={<DatabaseBackup />} title={t('backup.title')} />
      )}
      {cards}
      <ConfirmDialog
        isOpen={confirmRestore}
        title={t('backup.restoreConfirmTitle')}
        message={t('backup.restoreConfirmMessage')}
        confirmLabel={t('backup.chooseFile')}
        tone="danger"
        icon={<ArchiveRestore />}
        busy={restoring}
        onConfirm={restore}
        onCancel={() => setConfirmRestore(false)}
      />
    </>
  )
}
