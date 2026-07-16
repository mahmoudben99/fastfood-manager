import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FileSpreadsheet, Check, AlertCircle, Camera, ArrowLeft, Loader2, Download } from 'lucide-react'
import { parseSetupWorkbook } from '../../../lib/excelSetupImport'

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
        setImportResult({ success: false, message: 'The selected Excel file could not be read.' })
        setImporting(false)
      }
      reader.onload = async (loadEvent) => {
        try {
          if (!(loadEvent.target?.result instanceof ArrayBuffer)) {
            throw new Error('The selected Excel file could not be read.')
          }
          const imported = await importExcelData(new Uint8Array(loadEvent.target.result))
          setImportResult({ success: true, message: `Imported ${imported} items successfully!` })
          onImported()
        } catch (error) {
          setImportResult({
            success: false,
            message: error instanceof Error ? error.message : 'Excel import failed.'
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
        setUploadError(result.error || 'Upload failed')
      }
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed')
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
        setUploadError(result.error || 'Download failed')
        return
      }

      const imported = await importExcelData(new Uint8Array(result.data))
      setImportResult({ success: true, message: `Imported ${imported} items successfully!` })
      onImported()

      const completed = await window.api.menuUpload.markCompleted()
      if (!completed.ok) {
        setUploadError(
          'The menu was imported, but the online request could not be marked complete. You can continue setup safely.'
        )
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Import failed')
    } finally {
      setDownloading(false)
    }
  }

  // Upload mode view
  if (mode === 'upload') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            {t('setup.excel.uploadTitle', { defaultValue: 'Upload Menu Images' })}
          </h2>
          <p className="text-gray-500 mt-1">
            {t('setup.excel.uploadSubtitle', { defaultValue: 'Send photos of your menu to our team' })}
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
          {/* Back button */}
          <button
            onClick={() => {
              if (pollRef.current) clearInterval(pollRef.current)
              setMode('options')
              setSelectedImages([])
              setUploadDone(false)
              setUploadError(null)
              setPolling(false)
            }}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('setup.excel.back', { defaultValue: 'Back to options' })}
          </button>

          {!uploadDone ? (
            <>
              {/* Select images */}
              <button
                onClick={handleSelectImages}
                disabled={uploading}
                className="w-full flex items-center gap-4 p-5 rounded-xl border-2 border-dashed border-gray-300 hover:border-orange-400 hover:bg-orange-50 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                  <Camera className="h-6 w-6 text-orange-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    {t('setup.excel.selectImages', { defaultValue: 'Select Images' })}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedImages.length > 0
                      ? `${selectedImages.length} image(s) selected`
                      : t('setup.excel.selectImagesDesc', { defaultValue: 'Choose photos of your menu (JPG, PNG)' })
                    }
                  </p>
                </div>
              </button>

              {/* Selected image count */}
              {selectedImages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedImages.map((path, i) => {
                    const name = path.split(/[/\\]/).pop() || `image-${i + 1}`
                    return (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs">
                        {name.length > 20 ? name.slice(0, 17) + '...' : name}
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Upload button */}
              {selectedImages.length > 0 && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {t('setup.excel.uploading', { defaultValue: 'Uploading...' })}
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      {t('setup.excel.uploadBtn', { defaultValue: `Upload ${selectedImages.length} Image(s)` })}
                    </>
                  )}
                </button>
              )}
            </>
          ) : (
            <>
              {/* Upload done — waiting for admin */}
              <div className="text-center space-y-4 py-4">
                {pollingStatus === 'ready' ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                      <Check className="h-8 w-8 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-green-700">
                        {t('setup.excel.menuReady', { defaultValue: 'Your menu is ready!' })}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {t('setup.excel.menuReadyDesc', { defaultValue: 'Your menu has been prepared. Click below to import it.' })}
                      </p>
                    </div>
                    <button
                      onClick={handleDownloadAndImport}
                      disabled={downloading}
                      className="w-full py-3 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {downloading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          {t('setup.excel.downloading', { defaultValue: 'Downloading & Importing...' })}
                        </>
                      ) : (
                        <>
                          <Download className="h-5 w-5" />
                          {t('setup.excel.downloadImport', { defaultValue: 'Download & Import Menu' })}
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
                      <Check className="h-8 w-8 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {t('setup.excel.uploadSuccess', { defaultValue: 'Images uploaded successfully!' })}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {t('setup.excel.waitingAdmin', { defaultValue: 'Waiting for admin to prepare your menu...' })}
                      </p>
                    </div>
                    {polling && (
                      <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('setup.excel.checking', { defaultValue: 'Checking automatically every 15 seconds...' })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* Error display */}
          {uploadError && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {uploadError}
            </div>
          )}

          {/* Import result (shown after download & import) */}
          {importResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {importResult.success ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {importResult.message}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Main options view
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">{t('setup.excel.title', { defaultValue: 'Import Your Data' })}</h2>
        <p className="text-gray-500 mt-1">{t('setup.excel.subtitle', { defaultValue: 'Do you have a prepared Excel file with your menu data?' })}</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        {/* Import Excel option */}
        <button
          onClick={handleImport}
          disabled={importing}
          className="w-full flex items-center gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-all text-left"
        >
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
            <Upload className="h-6 w-6 text-orange-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{t('setup.excel.importOption', { defaultValue: 'Import Excel File' })}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('setup.excel.importOptionDesc', { defaultValue: 'Upload a prepared Excel file with your categories, menu, stock, and workers' })}</p>
          </div>
          {importing && (
            <div className="animate-spin h-5 w-5 border-2 border-orange-500 border-t-transparent rounded-full shrink-0" />
          )}
        </button>

        {importResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {importResult.success ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {importResult.message}
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">{t('setup.excel.or', { defaultValue: 'OR' })}</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Upload Menu Images option */}
        <button
          onClick={() => setMode('upload')}
          className="w-full flex items-center gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-all text-left"
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <Camera className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{t('setup.excel.uploadOption', { defaultValue: 'Upload Menu Images' })}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('setup.excel.uploadOptionDesc', { defaultValue: 'Send photos of your menu and we\'ll prepare the data for you' })}</p>
          </div>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">{t('setup.excel.or', { defaultValue: 'OR' })}</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Skip / default menu option */}
        <div className="flex items-center gap-4 p-5 rounded-xl border-2 border-gray-200 bg-gray-50">
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="h-6 w-6 text-gray-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{t('setup.excel.skipOption', { defaultValue: 'Continue without Excel' })}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('setup.excel.skipOptionDesc', { defaultValue: 'Starter categories will be created. Add your products later from Menu.' })}</p>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center">
          {t('setup.excel.skipNote', { defaultValue: 'You can edit your menu, stock, and workers later from Settings' })}
        </p>
      </div>
    </div>
  )
}
