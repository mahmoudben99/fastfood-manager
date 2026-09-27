import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronDown, Eye, EyeOff, FileDown, FileText } from 'lucide-react'
import { Badge, Button, Card, Input, cn, toast } from '../../components/ui'
import { VENDOR_KEYS, type AttestationLang, type VendorInfo } from '../../../../shared/fiscal'

const LTR_FIELDS = new Set<keyof VendorInfo>(['vendor_nif', 'vendor_nis', 'vendor_rc', 'vendor_ai', 'vendor_email', 'vendor_phone', 'software_version'])

/** "Attestation de conformité" TEMPLATE as PDF (FR / AR) + preview; vendor details behind a toggle. */
export function AttestationCard() {
  const { t, i18n } = useTranslation()
  const [info, setInfo] = useState<VendorInfo | null>(null)
  const [saved, setSaved] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pdf, setPdf] = useState<AttestationLang | null>(null)
  const [preview, setPreview] = useState<{ lang: AttestationLang; html: string } | null>(null)

  useEffect(() => {
    void window.api.fiscal.getVendorInfo().then((value) => {
      setInfo(value)
      setSaved(JSON.stringify(value))
    })
  }, [])

  const dirty = info !== null && JSON.stringify(info) !== saved
  const filled = info ? VENDOR_KEYS.filter((key) => info[key]?.trim()).length : 0

  const persist = async (): Promise<void> => {
    if (!info || !dirty) return
    const next = await window.api.fiscal.saveVendorInfo(info)
    setInfo(next)
    setSaved(JSON.stringify(next))
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await persist()
      toast.success(t('compliance.attestation.saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const makePdf = async (lang: AttestationLang): Promise<void> => {
    setPdf(lang)
    try {
      await persist()
      const result = await window.api.fiscal.saveAttestationPdf(lang)
      if (result.ok) {
        toast.success(t('compliance.attestation.savedPdf'), {
          description: result.path,
          action: { label: t('compliance.archive.show'), onClick: () => void window.api.fiscal.reveal(result.path) }
        })
      } else if (!result.canceled) {
        toast.error(t('compliance.attestation.failed'), { description: result.error })
      }
    } catch (error) {
      toast.error(t('compliance.attestation.failed'), { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setPdf(null)
    }
  }

  const showPreview = async (lang: AttestationLang): Promise<void> => {
    await persist()
    setPreview({ lang, html: await window.api.fiscal.attestationHtml(lang) })
  }

  return (
    <Card title={t('compliance.attestation.title')} icon={<FileText />}>
      <p className="flex items-start gap-2 rounded-xl bg-warning-soft text-warning-ink px-3 py-2 text-sm mb-4" role="note">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
        {t('compliance.attestation.warning')}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="soft" icon={<FileDown />} loading={pdf === 'fr'} disabled={pdf !== null} onClick={() => void makePdf('fr')} cooldownMs={800}>
          {t('compliance.attestation.pdfFr')}
        </Button>
        <Button variant="soft" icon={<FileDown />} loading={pdf === 'ar'} disabled={pdf !== null} onClick={() => void makePdf('ar')} cooldownMs={800}>
          {t('compliance.attestation.pdfAr')}
        </Button>
        <Button
          variant="ghost"
          icon={preview ? <EyeOff /> : <Eye />}
          onClick={() => (preview ? setPreview(null) : void showPreview(i18n.language === 'ar' ? 'ar' : 'fr'))}
        >
          {t(preview ? 'compliance.attestation.hidePreview' : 'compliance.attestation.preview')}
        </Button>
      </div>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="tap mt-4 flex w-full min-h-12 items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 text-start"
      >
        <span className="text-sm font-semibold text-ink">{t('compliance.attestation.vendorDetails')}</span>
        <span className="flex items-center gap-2">
          <Badge size="sm" variant={filled === VENDOR_KEYS.length ? 'success' : 'warning'}>
            {t('compliance.attestation.filled', { filled, total: VENDOR_KEYS.length })}
          </Badge>
          <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
        </span>
      </button>

      {open && info && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {VENDOR_KEYS.map((key) => (
              <Input
                key={key}
                label={t(`compliance.attestation.fields.${key}`)}
                value={info[key] ?? ''}
                maxLength={200}
                dir={LTR_FIELDS.has(key) ? 'ltr' : undefined}
                onChange={(event) => setInfo({ ...info, [key]: event.target.value })}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">{t('compliance.attestation.restaurantHint')}</p>
            <Button variant="secondary" loading={saving} disabled={!dirty} onClick={() => void save()}>{t('compliance.attestation.save')}</Button>
          </div>
        </div>
      )}

      {preview && (
        <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3">
          <div className="flex justify-end gap-2 mb-2">
            {(['fr', 'ar'] as const).map((lang) => (
              <Button key={lang} size="sm" variant={preview.lang === lang ? 'soft' : 'ghost'} onClick={() => void showPreview(lang)}>
                {lang.toUpperCase()}
              </Button>
            ))}
          </div>
          <iframe title={t('compliance.attestation.preview')} sandbox="" srcDoc={preview.html} className="w-full h-[32rem] rounded-xl bg-white shadow-e1" />
        </div>
      )}
    </Card>
  )
}
