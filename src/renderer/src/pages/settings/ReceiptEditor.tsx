import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Save, Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff,
  GripVertical, Type, LayoutTemplate, X, ArrowLeft, Check, RotateCcw
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'
import { useAppStore } from '../../store/appStore'
import { healBlockIds, type SocialMediaEntry } from '../../../../shared/settings-rules'
import { ipcErrorMessage } from '../../utils/ipcError'
import { ReceiptBlockConfig, BLOCK_TYPES, type Block, type BlockConfig, type BlockTextField } from './ReceiptBlockConfig'
import { ReceiptPreview } from './ReceiptPreview'
import { SocialMediaEditor } from './SocialMediaEditor'
import { ConfirmDialog, UnsavedChangesDialog, useToast } from './SettingsFeedback'

interface Template {
  id: number
  name: string
  is_active: number
  blocks: string
}

type KeyboardTarget =
  | { kind: 'templateName' }
  | { kind: 'saveAsName' }
  | { kind: 'social'; index: number }
  | { kind: 'block'; blockId: string; field: BlockTextField }

const PRESET_KEYS: Record<string, string> = {
  Classic: 'classic',
  Modern: 'modern',
  Minimal: 'minimal',
  'Full Featured': 'fullFeatured',
  'Bilingual (AR/FR)': 'bilingual'
}

const newId = (): string => crypto.randomUUID()

/** Parse stored blocks; re-id duplicates so templates saved by older versions heal on load. */
function parseBlocks(raw: string): Block[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const objects = parsed.filter((b) => b && typeof b === 'object') as Partial<Block>[]
    return healBlockIds(objects, newId).map((b, i) => ({
      id: b.id,
      type: String(b.type || ''),
      enabled: b.enabled !== false,
      config: (b.config && typeof b.config === 'object' ? b.config : {}) as BlockConfig,
      sortOrder: i
    }))
  } catch {
    return []
  }
}

const snapshotOf = (name: string, blocks: Block[]) => JSON.stringify({ name: name.trim(), blocks })

export function ReceiptEditor() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isTouch = useAppStore((s) => s.inputMode) === 'touchscreen'
  const { showToast, toastView } = useToast()

  const [templates, setTemplates] = useState<Template[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [templateName, setTemplateName] = useState('')
  const [currentTemplateId, setCurrentTemplateId] = useState<number | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState(snapshotOf('', []))
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null)
  const [presets, setPresets] = useState<{ name: string; blocks: string }[]>([])
  const [showAddMenu, setShowAddMenu] = useState(false)
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
        showToast('error', t('receiptEditor.toastError', { error: ipcErrorMessage(err) }))
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
    setBlocks([...blocks, { id: newId(), type, enabled: true, config: {}, sortOrder: blocks.length }])
    setShowAddMenu(false)
  }

  const updateBlockConfig = (id: string, key: keyof BlockConfig, value: unknown) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, config: { ...b.config, [key]: value } } : b)))
  }

  const presetLabel = (name: string) =>
    PRESET_KEYS[name] ? t(`receiptEditor.preset.${PRESET_KEYS[name]}`) : name

  const loadPreset = (preset: { name: string; blocks: string }) => {
    setCurrentTemplateId(null)
    setTemplateName(presetLabel(preset.name))
    setBlocks(parseBlocks(preset.blocks))
    setExpandedBlock(null)
  }

  const loadTemplate = (tmpl: Template) => applyEditorState(tmpl.id, tmpl.name, parseBlocks(tmpl.blocks))

  /** Save (and activate) a template. Returns true on success. */
  const persist = async (id: number | null, name: string): Promise<boolean> => {
    const cleanName = name.trim()
    if (!cleanName) {
      showToast('error', t('receiptEditor.nameRequired'))
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
      showToast('success', t('receiptEditor.toastSavedActive', { name: cleanName }))
      return true
    } catch (err) {
      showToast('error', t('receiptEditor.toastError', { error: ipcErrorMessage(err) }))
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
    }
  }

  const restoreDefaultReceipt = async () => {
    try {
      await window.api.receipt.clearActive()
      await refreshLists()
      applyEditorState(null, '', [])
      showToast('success', t('receiptEditor.toastDefault'))
    } catch (err) {
      showToast('error', t('receiptEditor.toastError', { error: ipcErrorMessage(err) }))
    }
  }

  const activateCurrent = async () => {
    if (!currentTemplateId) return
    try {
      await window.api.receipt.setActive(currentTemplateId)
      await refreshLists()
      showToast('success', t('receiptEditor.toastActivated', { name: templateName.trim() }))
    } catch (err) {
      showToast('error', t('receiptEditor.toastError', { error: ipcErrorMessage(err) }))
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await window.api.receipt.deleteTemplate(deleteTarget.id)
      if (currentTemplateId === deleteTarget.id) applyEditorState(null, '', [])
      await refreshLists()
      showToast('success', t('receiptEditor.toastDeleted'))
      setDeleteTarget(null)
    } catch (err) {
      showToast('error', t('receiptEditor.toastError', { error: ipcErrorMessage(err) }))
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
      showToast('success', t('receiptEditor.toastSocialSaved'))
    } catch (err) {
      showToast('error', t('receiptEditor.toastError', { error: ipcErrorMessage(err) }))
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
    () => (blocks.length > 0 ? { name: templateName.trim() || 'preview', blocks: JSON.stringify(blocks), is_active: 1 } : null),
    [blocks, templateName]
  )

  const iconBtn = isTouch ? 'p-2' : 'p-1'

  return (
    <div className="h-full flex flex-col">
      {toastView}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b">
        <div className="flex items-center gap-3">
          <button
            onClick={() => guard(() => navigate('/admin/settings?tab=printer'))}
            className={`${iconBtn} hover:bg-gray-100 rounded-lg transition-colors`}
            title={t('receiptEditor.back')}
            aria-label={t('receiptEditor.back')}
          >
            <ArrowLeft className="h-5 w-5 text-gray-500 rtl:rotate-180" />
          </button>
          <LayoutTemplate className="h-5 w-5 text-orange-500" />
          <h1 className="text-lg font-semibold">{t('receiptEditor.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-48"
            placeholder={t('receiptEditor.templateName')}
            value={templateName}
            readOnly={isTouch}
            onClick={isTouch ? () => setKeyboardTarget({ kind: 'templateName' }) : undefined}
            onChange={isTouch ? undefined : (e) => setTemplateName(e.target.value)}
          />
          <Button onClick={() => { void handleSave() }} disabled={!templateName.trim()} loading={saving}>
            <Save className="h-4 w-4" /> {t('common.save')}
          </Button>
          <Button variant="secondary" onClick={() => { setSaveAsName(''); setSaveAsModal(true) }} disabled={saving}>
            {t('receiptEditor.saveAs')}
          </Button>
        </div>
      </div>

      {/* Which layout prints right now */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-orange-50 text-sm">
        <span className="text-gray-700">
          {t('receiptEditor.printingWith', { name: activeTemplate ? activeTemplate.name : t('receiptEditor.defaultReceipt') })}
        </span>
        {activeTemplate && (
          <Button variant="secondary" size="sm" onClick={() => guard(() => { void restoreDefaultReceipt() })}>
            <RotateCcw className="h-3.5 w-3.5" /> {t('receiptEditor.useDefault')}
          </Button>
        )}
        {currentTemplateId !== null && !isDirty && activeTemplate?.id !== currentTemplateId && (
          <Button size="sm" onClick={() => { void activateCurrent() }}>
            <Check className="h-3.5 w-3.5" /> {t('receiptEditor.useThisTemplate')}
          </Button>
        )}
      </div>

      {/* Saved templates bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50 overflow-x-auto">
        <span className="text-xs text-gray-500 shrink-0">{t('receiptEditor.templates')}</span>
        <button
          className={`text-xs px-2 ${isTouch ? 'py-2' : 'py-1'} rounded border shrink-0 ${
            currentTemplateId === null && blocks.length === 0
              ? 'bg-orange-100 border-orange-300 text-orange-700'
              : 'bg-white border-gray-200 hover:bg-gray-100'
          }`}
          onClick={() => guard(() => applyEditorState(null, '', []))}
        >
          {t('receiptEditor.defaultReceipt')}{!activeTemplate ? ` ✓` : ''}
        </button>
        {templates.map((tm) => (
          <div key={tm.id} className="flex items-center gap-1 shrink-0">
            <button
              className={`text-xs px-2 ${isTouch ? 'py-2' : 'py-1'} rounded border ${
                currentTemplateId === tm.id
                  ? 'bg-orange-100 border-orange-300 text-orange-700'
                  : 'bg-white border-gray-200 hover:bg-gray-100'
              }`}
              onClick={() => guard(() => loadTemplate(tm))}
            >
              {tm.name} {tm.is_active ? `✓ ${t('receiptEditor.active')}` : ''}
            </button>
            <button
              className={`${iconBtn} rounded text-gray-400 hover:text-red-500 hover:bg-red-50`}
              onClick={() => setDeleteTarget(tm)}
              title={t('receiptEditor.deleteTemplate')}
              aria-label={t('receiptEditor.deleteTemplate')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Block editor (60%) */}
        <div className="w-[60%] border-e flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {blocks.map((block, index) => {
              const typeDef = BLOCK_TYPES.find((bt) => bt.value === block.type)
              const Icon = typeDef?.icon || Type
              return (
                <div key={block.id} className="border rounded-lg bg-white">
                  <div className={`flex items-center gap-2 px-3 ${isTouch ? 'py-3' : 'py-2'}`}>
                    <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                    <div className="flex items-center gap-1 shrink-0">
                      <button className={`${iconBtn} hover:bg-gray-100 rounded disabled:opacity-30`} disabled={index === 0} onClick={() => moveBlock(index, -1)} aria-label={t('receiptEditor.moveUp')}>
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button className={`${iconBtn} hover:bg-gray-100 rounded disabled:opacity-30`} disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)} aria-label={t('receiptEditor.moveDown')}>
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <Icon className="h-4 w-4 text-gray-500 shrink-0" />
                    <button
                      className="flex-1 text-start text-sm font-medium truncate"
                      onClick={() => setExpandedBlock(expandedBlock === block.id ? null : block.id)}
                    >
                      {typeDef ? t(`receiptEditor.blocks.${block.type}`) : block.type}
                    </button>
                    <button
                      className={`${iconBtn} hover:bg-gray-100 rounded`}
                      onClick={() => toggleBlock(block.id)}
                      title={block.enabled ? t('receiptEditor.disable') : t('receiptEditor.enable')}
                      aria-label={block.enabled ? t('receiptEditor.disable') : t('receiptEditor.enable')}
                    >
                      {block.enabled ? <Eye className="h-4 w-4 text-green-500" /> : <EyeOff className="h-4 w-4 text-gray-300" />}
                    </button>
                    <button
                      className={`${iconBtn} hover:bg-red-50 rounded text-gray-400 hover:text-red-500`}
                      onClick={() => removeBlock(block.id)}
                      title={t('receiptEditor.removeBlock')}
                      aria-label={t('receiptEditor.removeBlock')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {expandedBlock === block.id && (
                    <ReceiptBlockConfig
                      block={block}
                      onChange={(key, value) => updateBlockConfig(block.id, key, value)}
                      socialMedia={socialMedia}
                      logoDataUrl={logoDataUrl}
                      onEditSocial={openSocialModal}
                      isTouch={isTouch}
                      onRequestKeyboard={(field) => setKeyboardTarget({ kind: 'block', blockId: block.id, field })}
                    />
                  )}
                </div>
              )
            })}

            {blocks.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <LayoutTemplate className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t('receiptEditor.noBlocks')}</p>
              </div>
            )}
          </div>

          {/* Add block + presets */}
          <div className="border-t p-3 space-y-2 bg-gray-50">
            <div className="relative">
              <Button variant="secondary" size="sm" onClick={() => setShowAddMenu(!showAddMenu)}>
                <Plus className="h-4 w-4" /> {t('receiptEditor.addBlock')}
              </Button>
              {showAddMenu && (
                <div className="absolute bottom-full start-0 mb-1 bg-white border rounded-lg shadow-lg py-1 z-10 w-56">
                  {BLOCK_TYPES.map((bt) => {
                    const Icon = bt.icon
                    return (
                      <button
                        key={bt.value}
                        className={`w-full flex items-center gap-2 px-3 ${isTouch ? 'py-2.5' : 'py-1.5'} text-sm hover:bg-gray-50 text-start`}
                        onClick={() => addBlock(bt.value)}
                      >
                        <Icon className="h-4 w-4 text-gray-400" />
                        {t(`receiptEditor.blocks.${bt.value}`)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-gray-500">{t('receiptEditor.presets')}</span>
              {presets.map((p) => (
                <button
                  key={p.name}
                  className={`text-xs px-2 ${isTouch ? 'py-2' : 'py-1'} rounded border border-gray-200 bg-white hover:bg-orange-50 hover:border-orange-200 transition-colors`}
                  onClick={() => guard(() => loadPreset(p))}
                >
                  {presetLabel(p.name)}
                </button>
              ))}
            </div>

            <div>
              <button className={`text-xs text-orange-500 underline ${isTouch ? 'py-2' : ''}`} onClick={openSocialModal}>
                {t('receiptEditor.manageSocial')}
              </button>
            </div>
          </div>
        </div>

        {/* Live preview (40%) — the printer's own HTML for a sample order */}
        <div className="w-[40%] overflow-y-auto bg-gray-100 p-6 flex flex-col">
          <h3 className="text-sm font-medium text-gray-500 mb-1 text-center">{t('receiptEditor.livePreview')}</h3>
          <p className="text-xs text-gray-400 mb-3 text-center">
            {previewTemplate ? t('receiptEditor.previewSample') : t('receiptEditor.previewDefault')}
          </p>
          <ReceiptPreview template={previewTemplate} paperWidth={paperWidth} refreshKey={previewNonce} />
        </div>
      </div>

      {/* Save As modal */}
      <Modal isOpen={saveAsModal} onClose={() => { setSaveAsModal(false); setKeyboardTarget(null) }} title={t('receiptEditor.saveAs')} size="sm">
        <div className="space-y-3 p-4">
          <Input
            placeholder={t('receiptEditor.templateName')}
            value={saveAsName}
            readOnly={isTouch}
            onClick={isTouch ? () => setKeyboardTarget({ kind: 'saveAsName' }) : undefined}
            onChange={isTouch ? undefined : (e) => setSaveAsName(e.target.value)}
            autoFocus={!isTouch}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSaveAsModal(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => { void handleSaveAs() }} disabled={!saveAsName.trim()} loading={saving}>{t('common.save')}</Button>
          </div>
        </div>
      </Modal>

      {/* Social Media modal — edits settings.social_media, same list as Settings > General */}
      <Modal isOpen={showSocialModal} onClose={() => { setShowSocialModal(false); setKeyboardTarget(null) }} title={t('settings.socialMedia')} size="md">
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500">{t('receiptEditor.socialSharedNote')}</p>
          <SocialMediaEditor
            items={socialDraft}
            onChange={setSocialDraft}
            isTouch={isTouch}
            onRequestKeyboard={(index) => setKeyboardTarget({ kind: 'social', index })}
          />
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" onClick={() => setShowSocialModal(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => { void handleSaveSocial() }}>{t('common.save')}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title={t('receiptEditor.deleteConfirmTitle')}
        message={
          <>
            <p>{t('receiptEditor.deleteConfirmMessage', { name: deleteTarget?.name ?? '' })}</p>
            {deleteTarget?.is_active ? <p className="mt-2 text-orange-600">{t('receiptEditor.deleteConfirmActive')}</p> : null}
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
