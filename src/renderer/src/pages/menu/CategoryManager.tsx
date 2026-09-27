import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronUp, ChevronDown, Pencil, Trash2, Plus } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'
import { ConfirmDialog } from './ConfirmDialog'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'

interface CategoryManagerProps {
  isOpen: boolean
  onClose: () => void
  /** Active categories in display order. */
  categories: any[]
  /** Active menu items (used to count what each category still holds). */
  items: any[]
  onChanged: () => Promise<void>
  isTouch: boolean
  getName: (item: any) => string
}

type Field = 'name' | 'name_ar' | 'name_fr' | 'icon'
const EMPTY_FORM: Record<Field, string> = { name: '', name_ar: '', name_fr: '', icon: '' }

export function CategoryManager({ isOpen, onClose, categories, items, onChanged, isTouch, getName }: CategoryManagerProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [keyboardField, setKeyboardField] = useState<Field | null>(null)

  const countItems = (categoryId: number) => items.filter((item) => item.category_id === categoryId).length
  const setField = (field: Field, value: string) => setForm((prev) => ({ ...prev, [field]: value }))

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  const run = async (action: () => Promise<unknown>, fallback: string): Promise<boolean> => {
    setBusy(true)
    setError('')
    try {
      await action()
      await onChanged()
      return true
    } catch (err) {
      setError(ipcErrorMessage(err, fallback))
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!form.name.trim()) {
      setError(t('menu.categories.nameRequired'))
      return
    }
    const payload = {
      name: form.name.trim(),
      name_ar: form.name_ar.trim() || null,
      name_fr: form.name_fr.trim() || null,
      icon: form.icon.trim() || null
    }
    const ok = await run(
      () => (editingId ? window.api.categories.update(editingId, payload) : window.api.categories.create(payload)),
      t('menu.categories.saveFailed')
    )
    if (ok) resetForm()
  }

  const startEdit = (category: any) => {
    setEditingId(category.id)
    setError('')
    setForm({
      name: category.name || '',
      name_ar: category.name_ar || '',
      name_fr: category.name_fr || '',
      icon: category.icon || ''
    })
  }

  const move = (index: number, direction: -1 | 1) => {
    const ids = categories.map((category) => category.id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void run(() => window.api.categories.reorder(ids), t('menu.categories.saveFailed'))
  }

  const askDelete = (category: any) => {
    const count = countItems(category.id)
    if (count > 0) {
      setError(t('menu.categories.notEmpty', { name: getName(category), count }))
      return
    }
    setError('')
    setConfirmDelete(category)
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    const ok = await run(() => window.api.categories.delete(confirmDelete.id), t('menu.categories.deleteFailed'))
    if (ok && editingId === confirmDelete.id) resetForm()
    setConfirmDelete(null)
  }

  const textInput = (field: Field, label: string, extra: Record<string, unknown> = {}) => {
    // Emoji cannot be typed on the virtual keyboard; the icon stays a plain (pasteable) field.
    const touchField = isTouch && field !== 'icon'
    return (
      <Input
        label={label}
        value={form[field]}
        readOnly={touchField}
        onClick={touchField ? () => setKeyboardField(field) : undefined}
        onChange={touchField ? undefined : (e) => setField(field, e.target.value)}
        {...extra}
      />
    )
  }

  const close = () => {
    resetForm()
    setError('')
    setKeyboardField(null)
    onClose()
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={close} title={t('menu.categories.title')} size="lg">
        <div className="space-y-4">
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

          <div className="border rounded-lg divide-y">
            {categories.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">{t('menu.categories.empty')}</p>
            )}
            {categories.map((category, index) => (
              <div
                key={category.id}
                className={`flex items-center gap-2 px-3 py-2 ${editingId === category.id ? 'bg-orange-50' : ''}`}
              >
                <div className="flex flex-col">
                  <button type="button" onClick={() => move(index, -1)} disabled={busy || index === 0}
                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30" title={t('menu.categories.moveUp')}>
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={busy || index === categories.length - 1}
                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30" title={t('menu.categories.moveDown')}>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-2xl w-8 text-center">{category.icon || ''}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{getName(category)}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {[category.name, category.name_fr, category.name_ar].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Badge>{t('menu.categories.itemCount', { count: countItems(category.id) })}</Badge>
                <Button variant="ghost" size={isTouch ? 'md' : 'sm'} onClick={() => startEdit(category)} title={t('common.edit')}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size={isTouch ? 'md' : 'sm'} onClick={() => askDelete(category)} title={t('common.delete')}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">
              {editingId ? t('menu.categories.edit') : t('menu.categories.add')}
            </p>
            <div className="grid grid-cols-[4rem_1fr_1fr_1fr] gap-3">
              {textInput('icon', t('menu.categories.icon'), { placeholder: '🍔', className: 'text-center text-xl' })}
              {textInput('name', t('menu.name'))}
              {textInput('name_ar', t('menu.nameAr'), { dir: 'rtl' })}
              {textInput('name_fr', t('menu.nameFr'))}
            </div>
            <div className="flex gap-2 justify-end">
              {editingId && (
                <Button variant="secondary" onClick={resetForm} disabled={busy}>{t('common.cancel')}</Button>
              )}
              <Button onClick={save} loading={busy}>
                {!editingId && <Plus className="h-4 w-4" />}
                {editingId ? t('common.save') : t('menu.categories.add')}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title={t('menu.categories.deleteTitle')}
        message={confirmDelete ? t('menu.categories.deleteConfirm', { name: getName(confirmDelete) }) : ''}
        confirmLabel={t('common.delete')}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
        busy={busy}
        zIndex={60}
      />

      {isTouch && keyboardField && (
        <VirtualKeyboard
          visible
          type="text"
          value={form[keyboardField]}
          onChange={(value) => setField(keyboardField, value)}
          onClose={() => setKeyboardField(null)}
        />
      )}
    </>
  )
}
