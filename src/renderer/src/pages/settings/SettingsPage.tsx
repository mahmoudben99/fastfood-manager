import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader, toast } from '../../components/ui'
import { UnsavedChangesDialog } from './SettingsFeedback'
import { SettingsNav, parseSection, type SectionId } from './SettingsNav'
import { useGeneralSettings } from './hooks/useGeneralSettings'
import { useScheduleSettings } from './hooks/useScheduleSettings'
import { usePrinterSettings } from './hooks/usePrinterSettings'
import { GeneralSection } from './sections/GeneralSection'
import { AppearanceSection } from './sections/AppearanceSection'
import { ScheduleSection } from './sections/ScheduleSection'
import { PrinterSection } from './sections/PrinterSection'
import { RemoteOrderSection } from './sections/RemoteOrderSection'
import { OwnerLinkSection } from './sections/OwnerLinkSection'
import { SecuritySection } from './sections/SecuritySection'
import { AboutSection } from './sections/AboutSection'
import { DataSection } from './sections/DataSection'
import { MoreSettingsSection } from './sections/MoreSettingsSection'
import { TelegramSettings } from './TelegramSettings'

/** Sections with their own Save: leaving them with edits asks Save / Discard / Cancel. */
type DirtyTab = 'general' | 'schedule' | 'printer'
const isDirtyTab = (s: SectionId): s is DirtyTab => s === 'general' || s === 'schedule' || s === 'printer'

/**
 * Admin > Settings shell: section navigation + the unsaved-changes guard. Form state for the
 * savable sections lives in hooks here so it survives switching sections until saved/discarded.
 */
export function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<SectionId>(() => parseSection(searchParams.get('tab')))
  const [pendingLeave, setPendingLeave] = useState<{ tabs: DirtyTab[]; run: () => void } | null>(null)
  const [savingPending, setSavingPending] = useState(false)

  const onSaved = useCallback(() => toast.success(t('settings.saved'), { id: 'settings-saved' }), [t])
  const general = useGeneralSettings(onSaved)
  const schedule = useScheduleSettings(onSaved)
  const printers = usePrinterSettings(onSaved)
  const { load: loadGeneral } = general
  const { load: loadSchedule } = schedule
  const { load: loadPrinters } = printers

  useEffect(() => {
    void (async () => {
      loadGeneral(await window.api.settings.getAll())
      await loadSchedule()
      await loadPrinters()
    })()
  }, [loadGeneral, loadSchedule, loadPrinters])

  // New section starts at the top of the admin scroll area.
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [tab])

  const dirtyOf = (which: DirtyTab) =>
    which === 'general' ? general.isDirty : which === 'schedule' ? schedule.isDirty : printers.isDirty
  const saveTab = (which: DirtyTab) =>
    which === 'general' ? general.save() : which === 'schedule' ? schedule.save() : printers.save()
  const discardTab = (which: DirtyTab) =>
    which === 'general' ? general.discard() : which === 'schedule' ? schedule.discard() : printers.discard()

  /** Run `action`, first asking Save / Discard / Cancel if any of `tabs` has unsaved edits. */
  const guardLeave = (tabs: DirtyTab[], action: () => void) => {
    const dirty = tabs.filter(dirtyOf)
    if (dirty.length > 0) setPendingLeave({ tabs: dirty, run: action })
    else action()
  }

  const requestTab = (next: SectionId) => {
    if (next === tab) return
    if (isDirtyTab(tab)) guardLeave([tab], () => setTab(next))
    else setTab(next)
  }

  // The Receipt Editor is another page: nothing unsaved in ANY section may be lost on the way.
  const openReceiptEditor = () =>
    guardLeave(['general', 'schedule', 'printer'], () => navigate('/admin/receipt-editor'))

  const handlePendingSave = async () => {
    if (!pendingLeave) return
    setSavingPending(true)
    try {
      for (const which of pendingLeave.tabs) {
        if (!(await saveTab(which))) {
          // Validation/save failed: stay, and show the section with the error.
          setPendingLeave(null)
          setTab(which)
          return
        }
      }
      const { run } = pendingLeave
      setPendingLeave(null)
      run()
    } finally {
      setSavingPending(false)
    }
  }

  const handlePendingDiscard = () => {
    if (!pendingLeave) return
    pendingLeave.tabs.forEach(discardTab)
    const { run } = pendingLeave
    setPendingLeave(null)
    run()
  }

  return (
    <div>
      <PageHeader title={t('settings.title')} />

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <SettingsNav
          value={tab}
          onChange={requestTab}
          dirty={{ general: general.isDirty, schedule: schedule.isDirty, printer: printers.isDirty }}
        />
        <div className="min-w-0 flex-1 max-w-4xl">
          {tab === 'general' && <GeneralSection general={general} />}
          {tab === 'schedule' && <ScheduleSection schedule={schedule} />}
          {tab === 'appearance' && <AppearanceSection />}
          {tab === 'printer' && <PrinterSection p={printers} onOpenReceiptEditor={openReceiptEditor} />}
          {tab === 'remoteOrder' && <RemoteOrderSection />}
          {tab === 'ownerLink' && <OwnerLinkSection />}
          {tab === 'telegram' && <TelegramSettings />}
          {tab === 'security' && <SecuritySection />}
          {tab === 'about' && <AboutSection />}
          {tab === 'data' && <DataSection />}
          {tab === 'more' && <MoreSettingsSection />}
        </div>
      </div>

      <UnsavedChangesDialog
        isOpen={pendingLeave !== null}
        saving={savingPending}
        onSave={() => { void handlePendingSave() }}
        onDiscard={handlePendingDiscard}
        onCancel={() => setPendingLeave(null)}
      />
    </div>
  )
}
