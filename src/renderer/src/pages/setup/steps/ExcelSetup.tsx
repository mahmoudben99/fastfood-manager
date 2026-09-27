import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FileSpreadsheet, Camera, Sheet } from 'lucide-react'
import { parseSetupWorkbook } from '../../../lib/excelSetupImport'
import { StepLayout } from '../parts/StepLayout'
import { Notice } from '../parts/Notice'
import { ExcelUploadPanel, OptionRow } from './ExcelParts'

async function importExcelData(data: Uint8Array): Promise<number> {
  // Parsing validates every required sheet, row, number, duplicate name and relationship before
  // invoking the main process. The main process validates the payload again and commits it in one
  // transaction, so a bad later row can never leave a half-imported restaurant.
  const payload = parseSetupWorkbook(data)
  const result = await window.api.data.importSetup(payload)
  if (!result || result.success !== true || !Number.isInteger(result.total) || result.total <= 0) {
    throw new Error('Excel import did not complete. No success was recorded.')
  }
  return result.total
}

interface Props {
  onImported: () => void
}

type Mode = 'options' | 'upload'

export function ExcelSetup({ onImported }: Props) {
  const { t } = useTranslation()

  // Excel import state
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)

  // Upload mode state
  const [mode, setMode] = useState<Mode>('options')
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Polling state
  const [polling, setPolling] = useState(false)
  const [pollingStatus, setPollingStatus] = useState<string>('pending')
  const [excelPath, setExcelPath] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Check if there's already an upload in progress (resume after navigation)
  useEffect(() => {
    if (mode === 'options') {
      window.api.menuUpload.checkStatus().then((res: any) => {
        if (res.status === 'pending' || res.status === 'processing') {
          setMode('upload')
          setUploadDone(true)
          startPolling()
        } else if (res.status === 'ready') {
          setMode('upload')
          setUploadDone(true)
          setPollingStatus('ready')
          setExcelPath(res.excelPath)
        }
      }).catch(() => {})
    }
  }, [])

  const handleImport = () => {
    setImportResult(null)

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.xls'

    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return
      setImporting(true)

      const reader = new FileReader()
      reader.onerror = () => {
        setImportResult({ success: false, message: t('setup.excel.readError') })
        setImporting(false)
      }
      reader.onload = async (loadEvent) => {
        try {
          if (!(loadEvent.target?.result instanceof ArrayBuffer)) {
            throw new Error(t('setup.excel.readError'))
          }
          const imported = await importExcelData(new Uint8Array(loadEvent.target.result))
          setImportResult({ success: true, message: t('setup.excel.importedCount', { count: imported }) })
          onImported()
        } catch (error) {
          setImportResult({
            success: false,
            message: error instanceof Error ? error.message : t('setup.excel.importFailed')
          })
        } finally {
          setImporting(false)
        }
      }
      reader.readAsArrayBuffer(file)
    }

    input.click()
  }

  const handleSelectImages = async () => {
    const paths = await window.api.menuUpload.selectImages()
    if (paths && paths.length > 0) {
      setSelectedImages(paths)
      setUploadError(null)
    }
  }

  const handleUpload = async () => {
    if (selectedImages.length === 0) return
    setUploading(true)
    setUploadError(null)

    try {
      const result = await window.api.menuUpload.upload(selectedImages)
      if (result.ok) {
        setUploadDone(true)
        startPolling()
      } else {
        setUploadError(result.error || t('setup.excel.uploadFailed'))
      }
    } catch (err: any) {
      setUploadError(err.message || t('setup.excel.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const startPolling = () => {
    setPolling(true)
    setPollingStatus('pending')

    const poll = async () => {
      try {
        const res = await window.api.menuUpload.checkStatus()
        setPollingStatus(res.status)
        if (res.status === 'ready' && res.excelPath) {
          setExcelPath(res.excelPath)
          if (pollRef.current) clearInterval(pollRef.current)
          setPolling(false)
        } else if (res.status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current)
          setPolling(false)
        }
      } catch {
        // ignore polling errors
      }
    }

    poll() // immediate first check
    pollRef.current = setInterval(poll, 15000) // then every 15s
  }

  const handleDownloadAndImport = async () => {
    if (!excelPath) return
    setDownloading(true)

    try {
      const result = await window.api.menuUpload.downloadExcel(excelPath)
      if (!result.ok) {
        setUploadError(result.error || t('setup.excel.downloadFailed'))
        return
      }

      const imported = await importExcelData(new Uint8Array(result.data))
      setImportResult({ success: true, message: t('setup.excel.importedCount', { count: imported }) })
      onImported()

      const completed = await window.api.menuUpload.markCompleted()
      if (!completed.ok) {
        setUploadError(t('setup.excel.markFailed'))
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t('setup.excel.importFailed'))
    } finally {
      setDownloading(false)
    }
  }

  const backToOptions = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setMode('options')
    setSelectedImages([])
    setUploadDone(false)
    setUploadError(null)
    setPolling(false)
  }

  // Upload mode view
  if (mode === 'upload') {
    return (
      <StepLayout icon={<Camera />} title={t('setup.excel.uploadTitle', { defaultValue: 'Upload Menu Images' })}>
        <ExcelUploadPanel
          selectedImages={selectedImages}
          uploading={uploading}
          uploadDone={uploadDone}
          polling={polling}
          pollingStatus={pollingStatus}
          downloading={downloading}
          uploadError={uploadError}
          importResult={importResult}
          onBack={backToOptions}
          onSelectImages={handleSelectImages}
          onUpload={handleUpload}
          onDownloadAndImport={handleDownloadAndImport}
        />
      </StepLayout>
    )
  }

  // Main options view: three short rows (the wizard's Next = continue without Excel)
  return (
    <StepLayout icon={<Sheet />} title={t('setup.excel.title', { defaultValue: 'Import Your Data' })}>
      <div className="space-y-3">
        <OptionRow
          icon={<Upload />}
          tone="primary"
          title={t('setup.excel.importOption', { defaultValue: 'Import Excel File' })}
          description={t('setup.excel.importShort')}
          onClick={handleImport}
          disabled={importing}
          busy={importing}
        />

        {importResult && <Notice tone={importResult.success ? 'success' : 'danger'}>{importResult.message}</Notice>}

        <OptionRow
          icon={<Camera />}
          tone="info"
          title={t('setup.excel.uploadOption', { defaultValue: 'Upload Menu Images' })}
          description={t('setup.excel.uploadShort')}
          onClick={() => setMode('upload')}
        />

        {/* Informational: pressing Next continues with the starter categories */}
        <OptionRow
          icon={<FileSpreadsheet />}
          tone="neutral"
          title={t('setup.excel.skipOption', { defaultValue: 'Continue without Excel' })}
          description={t('setup.excel.skipShort')}
        />
      </div>
    </StepLayout>
  )
}
