import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderPlus, Trash2, HardDrive, RotateCcw, Check, AlertCircle, Clock } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

export function BackupRestore() {
  const { t } = useTranslation()
  const [paths, setPaths] = useState<string[]>([])
  const [backups, setBackups] = useState<any[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  // Scheduled backup
  const [schedEnabled, setSchedEnabled] = useState(false)
  const [schedTime, setSchedTime] = useState('23:00')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [p, b, sched] = await Promise.all([
      window.api.backup.getPaths(),
      window.api.backup.listAvailable(),
      window.api.backup.getSchedule()
    ])
    setPaths(p)
    setBackups(b)
    setSchedEnabled(sched.enabled)
    setSchedTime(sched.time)
  }

  const saveSchedule = async (enabled: boolean, time: string) => {
    setSchedEnabled(enabled)
    setSchedTime(time)
    await window.api.backup.setSchedule({ enabled, time })
  }

  const addPath = async () => {
    const result = await window.api.backup.addPath()
    if (result) setPaths(result)
  }

  const removePath = async (path: string) => {
    const result = await window.api.backup.removePath(path)
    setPaths(result)
  }

  const backupNow = async () => {
    setLoading(true)
    setMessage(null)
    const results = await window.api.backup.createNow()
    const allSuccess = results.every((r: any) => r.success)
    setMessage({
      type: allSuccess ? 'success' : 'error',
      text: allSuccess ? t('backup.success') : `Some backups failed`
    })
    setLoading(false)
    loadData()
  }

  const restore = async () => {
    if (!confirm(t('backup.restoreConfirm'))) return
    setLoading(true)
    const result = await window.api.backup.restore()
    setMessage({
      type: result.success ? 'success' : 'error',
      text: result.success ? t('backup.restoreSuccess') : result.error || 'Restore failed'
    })
    setLoading(false)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('backup.title')}</h1>

      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm mb-4 ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Backup paths */}
        <Card title={t('backup.paths')} actions={
          <Button size="sm" variant="secondary" onClick={addPath}>
            <FolderPlus className="h-4 w-4" />
            {t('backup.addPath')}
          </Button>
        }>
          {paths.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('backup.noPaths')}</p>
          ) : (
            <div className="space-y-2">
              {paths.map((path, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <span className="text-sm truncate flex-1">{path}</span>
                  <button onClick={() => removePath(path)} className="p-1 hover:bg-red-100 rounded ms-2">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4">
            <Button onClick={backupNow} loading={loading} disabled={paths.length === 0}>
              <HardDrive className="h-4 w-4" />
              {t('backup.backupNow')}
            </Button>
          </div>
        </Card>

        {/* Scheduled Backup */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-blue-500" />
            <h3 className="font-semibold">{t('backup.scheduledBackup')}</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={schedEnabled}
              onChange={(e) => saveSchedule(e.target.checked, schedTime)}
              className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
            />
            <span className="text-sm text-gray-700">{t('backup.enableSchedule')}</span>
          </label>
          {schedEnabled && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">{t('backup.backupAt')}</span>
              <input
                type="time"
                value={schedTime}
                onChange={(e) => saveSchedule(true, e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">{t('backup.scheduleHint')}</p>
        </Card>

        {/* Restore */}
        <Card title={t('backup.restore')}>
          <Button variant="secondary" onClick={restore} loading={loading}>
            <RotateCcw className="h-4 w-4" />
            {t('backup.restore')}
          </Button>

          {backups.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-600 mb-2">{t('backup.available')}</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {backups.slice(0, 20).map((b, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                    <span className="truncate">{b.name}</span>
                    <span className="text-gray-400 ms-2 shrink-0">{formatSize(b.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
