import { useTranslation } from 'react-i18next'
import { ExcelImportExport } from '../../excel/ExcelImportExport'
import { BackupRestore } from '../../backup/BackupRestore'

/** Settings > Data: Excel import/export and backup/restore (same components as their admin routes). */
export function DataSection() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6" aria-label={t('settings.data')}>
      <ExcelImportExport embedded />
      <BackupRestore embedded />
    </div>
  )
}
