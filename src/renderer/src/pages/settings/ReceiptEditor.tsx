import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Save } from 'lucide-react'
import { Button, ConfirmDialog, Input, PageHeader, toast } from '../../components/ui'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'
import { useAppStore } from '../../store/appStore'
import type { SocialMediaEntry } from '../../../../shared/settings-rules'
import { ipcErrorMessage } from '../../utils/ipcError'
import type { Block, BlockConfig, BlockTextField } from './ReceiptBlockConfig'
import { UnsavedChangesDialog } from './SettingsFeedback'
import { BlockList } from './receipt/BlockList'
import { TemplateBar, type Template } from './receipt/TemplateBar'
import { PRESET_KEYS, newId, parseBlocks, snapshotOf } from './receipt/blocks'
import { PreviewPanel } from './receipt/PreviewPanel'
import { SaveAsModal, SocialModal } from './receipt/ReceiptModals'

type KeyboardTarget =
  | { kind: 'templateName' }
  | { kind: 'saveAsName' }
  | { kind: 'social'; index: number }
  | { kind: 'block'; blockId: string; field: BlockTextField }

/** Admin > Receipt Editor: build the printed receipt from blocks, with the printer's own live preview. */
export function ReceiptEditor() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isTouch = useAppStore((s) => s.inputMode) === 'touchscreen'
  const toastError = (err: unknown) => toast.error(t('receiptEditor.toastError', { error: ipcErrorMessage(err) }))

  const [templates, setTemplates] = useState<Template[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [templateName, setTemplateName] = useState('')
  const [currentTemplateId, setCurrentTemplateId] = useState<number | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState(snapshotOf('', []))
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null)
  const [presets, setPresets] = useState<{ name: string; blocks: string }[]>([])
  const [saveAsModal, setSaveAsModal] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pendingLeave, setPendingLeave] = useState<{ run: () => void } | null>(null)
  const [keyboardTarget, setKeyboardTarget] = useState<KeyboardTarget | null>(null)
  // Social media (settings.social_media — same list as Settings > General)
  const [socialMedia, setSocialMedia] = useState<SocialMediaEntry[]>([])
  const [showSocialModal, setShowSocialModal] = useState(false)
  const [socialDraft, setSocialDraft] = useState<SocialMediaEntry[]>([])
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [paperWidth, setPaperWidth] = useState(80)
  const [previewNonce, setPreviewNonce] = useState(0)

  const activeTemplate = templates.find((tm) => tm.is_active) || null
  const isDirty = snapshotOf(templateName, blocks) !== savedSnapshot

  const applyEditorState = useCallback((id: number | null, name: string, next: Block[]) => {
    setCurrentTemplateId(id)
    setTemplateName(name)
    setBlocks(next)
    setSavedSnapshot(snapshotOf(name, next))
    setExpandedBlock(null)
  }, [])

  const refreshLists = useCallback(async () => {
    const [tmpl, pres, social, settings] = await Promise.all([
      window.api.receipt.getTemplates(),
      window.api.receipt.getPresets(),
      window.api.receipt.getSocialMedia(),
      window.api.settings.getAll()
    ])
    setTemplates(tmpl)
    setPresets(pres)
    setSocialMedia(social)
    setPaperWidth(settings.printer_width === '58' ? 58 : 80)
    return tmpl as Template[]
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const tmpl = await refreshLists()
        const active = tmpl.find((tm) => tm.is_active)
        if (active) applyEditorState(active.id, active.name, parseBlocks(active.blocks))
      } catch (err) {
        toastError(err)
      }
    })()
    window.api.settings.getLogoDataUrl().then((url) => setLogoDataUrl(url || null)).catch(() => setLogoDataUrl(null))
    // Load once on mount; later refreshes go through refreshLists() so edits are never reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Run `action` now, or first ask Save / Discard / Cancel when there are unsaved edits. */
  const guard = (action: () => void) => {
    if (isDirty) setPendingLeave({ run: action })
    else action()
  }

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= blocks.length) return
    const updated = [...blocks]
    ;[updated[index], updated[target]] = [updated[target], updated[index]]
    setBlocks(updated.map((b, i) => ({ ...b, sortOrder: i })))
  }

  const toggleBlock = (id: string) => setBlocks(blocks.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)))

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter((b) => b.id !== id).map((b, i) => ({ ...b, sortOrder: i })))
    if (expandedBlock === id) setExpandedBlock(null)
  }

  const addBlock = (type: string) => {
    const id = newId()
    setBlocks([...blocks, { id, type, enabled: true, config: {}, sortOrder: blocks.length }])
    setExpandedBlock(id)
  }

  const updateBlockConfig = (id: string, key: keyof BlockConfig, value: unknown) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, config: { ...b.config, [key]: value } } : b)))
  }

  const presetLabel = (name: string) => (PRESET_KEYS[name] ? t(`receiptEditor.preset.${PRESET_KEYS[name]}`) : name)

  const loadPreset = (preset: { name: string; blocks: string }) => {
    setCurrentTemplateId(null)
    setTemplateName(presetLabel(preset.name))
    setBlocks(parseBlocks(preset.blocks))
    setExpandedBlock(null)
  }

  /** Save (and activate) a template. Returns true on success. */
  const persist = async (id: number | null, name: string): Promise<boolean> => {
    const cleanName = name.trim()
    if (!cleanName) {
      toast.error(t('receiptEditor.nameRequired'))
      return false
    }
    setSaving(true)
    try {
      const payload = { name: cleanName, blocks: JSON.stringify(blocks), is_active: 1 }
      let savedId = id
      if (savedId) {
        await window.api.receipt.updateTemplate(savedId, payload)
      } else {
        const result = await window.api.receipt.saveTemplate(payload)
        savedId = result.id
      }
      await window.api.receipt.setActive(savedId!)
      await refreshLists()
      applyEditorState(savedId, cleanName, blocks)
      toast.success(t('receiptEditor.toastSavedActive', { name: cleanName }))
      return true
    } catch (err) {
      toastError(err)
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => persist(currentTemplateId, templateName)

  const handleSaveAs = async () => {
    if (await persist(null, saveAsName)) {
      setSaveAsModal(false)
      setSaveAsName('')
      setKeyboardTarget(null)
    }
  }

  const restoreDefaultReceipt = async () => {
    try {
      await window.api.receipt.clearActive()
      await refreshLists()
      applyEditorState(null, '', [])
      toast.success(t('receiptEditor.toastDefault'))
    } catch (err) {
      toastError(err)
    }
  }

  const activateCurrent = async () => {
    if (!currentTemplateId) return
    try {
      await window.api.receipt.setActive(currentTemplateId)
      await refreshLists()
      toast.success(t('receiptEditor.toastActivated', { name: templateName.trim() }))
    } catch (err) {
      toastError(err)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await window.api.receipt.deleteTemplate(deleteTarget.id)
      if (currentTemplateId === deleteTarget.id) applyEditorState(null, '', [])
      await refreshLists()
      toast.success(t('receiptEditor.toastDeleted'))
      setDeleteTarget(null)
    } catch (err) {
      toastError(err)
    } finally {
      setDeleting(false)
    }
  }

  const openSocialModal = () => {
    setSocialDraft(socialMedia.length > 0 ? socialMedia.map((s) => ({ ...s })) : [{ platform: 'facebook', handle: '' }])
    setShowSocialModal(true)
  }

  const handleSaveSocial = async () => {
    try {
      await window.api.receipt.saveSocialMedia(socialDraft.filter((s) => s.handle.trim()))
      setSocialMedia(await window.api.receipt.getSocialMedia())
      setShowSocialModal(false)
      setKeyboardTarget(null)
      setPreviewNonce((n) => n + 1)
      toast.success(t('receiptEditor.toastSocialSaved'))
    } catch (err) {
      toastError(err)
    }
  }

  // --- On-screen keyboard (touch mode) ---
  const keyboardValue = (): string => {
    if (!keyboardTarget) return ''
    switch (keyboardTarget.kind) {
      case 'templateName': return templateName
      case 'saveAsName': return saveAsName
      case 'social': return socialDraft[keyboardTarget.index]?.handle || ''
      case 'block': return String(blocks.find((b) => b.id === keyboardTarget.blockId)?.config[keyboardTarget.field] || '')
    }
  }

  const handleKeyboardChange = (val: string) => {
    if (!keyboardTarget) return
    switch (keyboardTarget.kind) {
      case 'templateName': setTemplateName(val); break
      case 'saveAsName': setSaveAsName(val); break
      case 'social': {
        const index = keyboardTarget.index
        setSocialDraft((prev) => prev.map((s, i) => (i === index ? { ...s, handle: val } : s)))
        break
      }
      case 'block': updateBlockConfig(keyboardTarget.blockId, keyboardTarget.field, val); break
    }
  }

  const previewTemplate = useMemo(
    // The name is not printed, so typing it must not re-render the preview.
    () => (blocks.length > 0 ? { name: 'preview', blocks: JSON.stringify(blocks), is_active: 1 } : null),
    [blocks]
  )

  return (
    <div className="flex flex-col xl:h-full">
      <PageHeader
        title={t('receiptEditor.title')}
        onBack={() => guard(() => navigate('/admin/settings?tab=printer'))}
        backLabel={t('receiptEditor.back')}
        className="mb-5"
        actions={
          <>
            <div className="w-56">
              <Input
                aria-label={t('receiptEditor.templateName')}
                placeholder={t('receiptEditor.templateName')}
                value={templateName}
                readOnly={isTouch}
                onClick={isTouch ? () => setKeyboardTarget({ kind: 'templateName' }) : undefined}
                onChange={isTouch ? undefined : (e) => setTemplateName(e.target.value)}
              />
            </div>
            <Button variant="secondary" size="lg" onClick={() => { setSaveAsName(''); setSaveAsModal(true) }} disabled={saving}>
              {t('receiptEditor.saveAs')}
            </Button>
            <Button size="lg" icon={<Save className="h-5 w-5" />} onClick={() => { void handleSave() }} disabled={!templateName.trim()} loading={saving} cooldownMs={800}>
              {t('common.save')}
            </Button>
          </>
        }
      />

      <TemplateBar
        templates={templates}
        activeTemplate={activeTemplate}
        currentTemplateId={currentTemplateId}
        showingDefault={currentTemplateId === null && blocks.length === 0}
        isDirty={isDirty}
        isTouch={isTouch}
        onShowDefault={() => guard(() => applyEditorState(null, '', []))}
        onLoad={(tm) => guard(() => applyEditorState(tm.id, tm.name, parseBlocks(tm.blocks)))}
        onDelete={setDeleteTarget}
        onUseDefault={() => guard(() => { void restoreDefaultReceipt() })}
        onActivateCurrent={() => { void activateCurrent() }}
      />

      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <BlockList
          blocks={blocks}
          expandedBlock={expandedBlock}
          presets={presets}
          presetLabel={presetLabel}
          socialMedia={socialMedia}
          logoDataUrl={logoDataUrl}
          isTouch={isTouch}
          onExpand={setExpandedBlock}
          onMove={moveBlock}
          onToggle={toggleBlock}
          onRemove={removeBlock}
          onAdd={addBlock}
          onConfig={updateBlockConfig}
          onLoadPreset={(p) => guard(() => loadPreset(p))}
          onEditSocial={openSocialModal}
          onRequestKeyboard={(blockId, field) => setKeyboardTarget({ kind: 'block', blockId, field })}
        />

        <PreviewPanel template={previewTemplate} paperWidth={paperWidth} refreshKey={previewNonce} />
      </div>

      <SaveAsModal
        isOpen={saveAsModal}
        name={saveAsName}
        saving={saving}
        isTouch={isTouch}
        onName={setSaveAsName}
        onRequestKeyboard={() => setKeyboardTarget({ kind: 'saveAsName' })}
        onSave={() => { void handleSaveAs() }}
        onClose={() => { setSaveAsModal(false); setKeyboardTarget(null) }}
      />

      <SocialModal
        isOpen={showSocialModal}
        draft={socialDraft}
        isTouch={isTouch}
        onDraft={setSocialDraft}
        onRequestKeyboard={(index) => setKeyboardTarget({ kind: 'social', index })}
        onSave={() => { void handleSaveSocial() }}
        onClose={() => { setShowSocialModal(false); setKeyboardTarget(null) }}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title={t('receiptEditor.deleteConfirmTitle')}
        message={
          <>
            <p>{t('receiptEditor.deleteConfirmMessage', { name: deleteTarget?.name ?? '' })}</p>
            {deleteTarget?.is_active ? <p className="mt-2 font-medium text-warning-ink">{t('receiptEditor.deleteConfirmActive')}</p> : null}
          </>
        }
        confirmLabel={t('common.delete')}
        busy={deleting}
        onConfirm={() => { void confirmDelete() }}
        onCancel={() => setDeleteTarget(null)}
      />

      <UnsavedChangesDialog
        isOpen={pendingLeave !== null}
        saving={saving}
        onSave={async () => {
          const action = pendingLeave
          if (await handleSave()) {
            setPendingLeave(null)
            action?.run()
          }
        }}
        onDiscard={() => {
          const action = pendingLeave
          setPendingLeave(null)
          action?.run()
        }}
        onCancel={() => setPendingLeave(null)}
      />

      {isTouch && keyboardTarget && (
        <VirtualKeyboard
          visible
          type="text"
          extended
          initialLayout={keyboardTarget.kind === 'block' && keyboardTarget.field === 'textAr' ? 'arabic' : 'latin'}
          value={keyboardValue()}
          onChange={handleKeyboardChange}
          onClose={() => setKeyboardTarget(null)}
        />
      )}
    </div>
  )
}
