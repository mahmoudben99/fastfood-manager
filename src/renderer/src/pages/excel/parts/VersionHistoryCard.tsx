import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Clock, History, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Skeleton,
  cn
} from '../../../components/ui'

export interface MenuVersion {
  id: number
  label: string
  created_at: string
  counts: {
    categories: number
    menuItems: number
    stockItems: number
    workers: number
  } | null
}

interface VersionHistoryCardProps {
  versions: MenuVersion[]
  loading: boolean
  /** Production build: restoring a recovery point is on a safety hold. */
  restoreDisabled: boolean
  savingVersion: boolean
  onSaveRecovery: () => void
  /** Resolve when finished (the dialog stays busy until then). */
  onRestore: (id: number) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

/** SQLite stores UTC without a zone: append Z so the local time is right. */
const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr + 'Z')
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    numberingSystem: 'latn'
  })
}

/** Recovery points: list, restore (confirmed, dev only) and delete (confirmed). */
export function VersionHistoryCard({
  versions,
  loading,
  restoreDisabled,
  savingVersion,
  onSaveRecovery,
  onRestore,
  onDelete
}: VersionHistoryCardProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const [confirm, setConfirm] = useState<{ kind: 'restore' | 'delete'; version: MenuVersion } | null>(null)
  const [busy, setBusy] = useState(false)

  const runConfirmed = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.kind === 'restore') await onRestore(confirm.version.id)
      else await onDelete(confirm.version.id)
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const counts = (v: MenuVersion) =>
    v.counts
      ? [
          t('excel.countCategories', { count: v.counts.categories }),
          t('excel.countItems', { count: v.counts.menuItems }),
          t('excel.countStock', { count: v.counts.stockItems }),
          t('excel.countWorkers', { count: v.counts.workers })
        ].join(' · ')
      : null

  return (
    <Card
      padding={false}
      icon={<History />}
      title={
        <span className="inline-flex items-center gap-2">
          {t('excel.versionHistory')}
          {versions.length > 0 && <Badge variant="neutral">{versions.length}</Badge>}
        </span>
      }
      actions={
        <IconButton
          icon={<ChevronDown className={cn('transition-transform duration-200', open && 'rotate-180')} />}
          label={open ? t('excel.hideHistory') : t('excel.showHistory')}
          aria-expanded={open}
          size="lg"
          onClick={() => setOpen(!open)}
        />
      }
    >
      {open && (
        <div className="p-5">
          {restoreDisabled && versions.length > 0 && (
            <span className="mb-3 inline-block" title={t('excel.restoreDisabledDesc')}>
              <Badge variant="warning" icon={<ShieldAlert />}>
                {t('excel.restorePaused')}
              </Badge>
            </span>
          )}

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <EmptyState
              compact
              icon={<History />}
              title={t('excel.noVersions')}
              action={
                <Button
                  variant="secondary"
                  size="lg"
                  icon={<Clock className="h-5 w-5" />}
                  loading={savingVersion}
                  onClick={onSaveRecovery}
                >
                  {t('excel.saveRecovery')}
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {versions.map((version) => (
                <li key={version.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      <bdi>{version.label}</bdi>
                    </p>
                    <p className="num mt-0.5 truncate text-xs text-muted" title={counts(version) ?? undefined}>
                      {formatDate(version.created_at)}
                      {counts(version) && <span className="ms-2">· {counts(version)}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {restoreDisabled ? (
                      <IconButton
                        icon={<RotateCcw />}
                        label={t('excel.restoreDisabledButton')}
                        title={t('excel.restoreDisabledDesc')}
                        variant="soft"
                        size="lg"
                        disabled
                      />
                    ) : (
                      <IconButton
                        icon={<RotateCcw />}
                        label={t('excel.restore')}
                        variant="soft"
                        size="lg"
                        onClick={() => setConfirm({ kind: 'restore', version })}
                      />
                    )}
                    <IconButton
                      icon={<Trash2 />}
                      label={t('common.delete')}
                      variant="danger"
                      size="lg"
                      onClick={() => setConfirm({ kind: 'delete', version })}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirm !== null}
        tone={confirm?.kind === 'restore' ? 'warning' : 'danger'}
        icon={confirm?.kind === 'restore' ? <RotateCcw /> : undefined}
        title={confirm?.kind === 'restore' ? t('excel.restoreConfirmTitle') : t('excel.deleteConfirmTitle')}
        message={
          confirm?.kind === 'restore'
            ? t('excel.restoreConfirmMessage', { label: confirm.version.label })
            : t('excel.deleteConfirmMessage', { label: confirm?.version.label ?? '' })
        }
        confirmLabel={confirm?.kind === 'restore' ? t('excel.restore') : t('common.delete')}
        busy={busy}
        onConfirm={runConfirmed}
        onCancel={() => setConfirm(null)}
      />
    </Card>
  )
}
