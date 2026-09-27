import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { Badge, Button, IconButton, Input, Modal, cn, toast } from '../../components/ui'
import { AvailabilityEditor } from '../../components/catalog-ext'
import { categoryColor, categoryTint } from '../../theme/categoryColors'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { InlineNotice, MoveButtons, SectionLabel, useFoodName, useTouchKeyboard } from './catalogShared'
import type { CategoryRow, MenuRow } from './menuTypes'

interface CategoryManagerProps {
  isOpen: boolean
  onClose: () => void
  /** Active categories in display order. */
  categories: CategoryRow[]
  /** Active menu items (used to count what each category still holds). */
  items: MenuRow[]
  onChanged: () => Promise<unknown>
}

type Field = 'name' | 'name_ar' | 'name_fr' | 'icon'
const EMPTY_FORM: Record<Field, string> = { name: '', name_ar: '', name_fr: '', icon: '' }

/** Add, rename, reorder (fixed order = cashier muscle memory) and delete empty categories. */
export function CategoryManager({ isOpen, onClose, categories, items, onChanged }: CategoryManagerProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const kb = useTouchKeyboard()
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)

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
    if (ok) {
      toast.success(t('menu.categories.saved', { name: payload.name }))
      resetForm()
    }
  }

  const startEdit = (category: CategoryRow) => {
    setEditingId(category.id)
    setError('')
    setConfirmId(null)
    setForm({ name: category.name || '', name_ar: category.name_ar || '', name_fr: category.name_fr || '', icon: category.icon || '' })
  }

  const move = (index: number, direction: -1 | 1) => {
    const ids = categories.map((category) => category.id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void run(() => window.api.categories.reorder(ids), t('menu.categories.saveFailed'))
  }

  const askDelete = (category: CategoryRow) => {
    const count = countItems(category.id)
    if (count > 0) {
      setError(t('menu.categories.notEmpty', { name: getName(category), count }))
      return
    }
    setError('')
    setConfirmId(category.id)
  }

  const doDelete = async (category: CategoryRow) => {
    const ok = await run(() => window.api.categories.delete(category.id), t('menu.categories.deleteFailed'))
    if (ok && editingId === category.id) resetForm()
    if (ok) toast.success(t('menu.categories.deletedToast', { name: getName(category) }))
    setConfirmId(null)
  }

  const close = () => {
    resetForm()
    setError('')
    setConfirmId(null)
    kb.close()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title={t('menu.categories.title')} size="xl" closeOnBackdrop={false}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-6">
        <div className="space-y-2 min-w-0">
          {error && <InlineNotice>{error}</InlineNotice>}
          {categories.length === 0 && (
            <p className="rounded-xl border border-dashed border-line-strong py-8 text-center text-sm text-muted">{t('menu.categories.empty')}</p>
          )}
          {categories.map((category, index) => {
            const confirming = confirmId === category.id
            return (
              <div
                key={category.id}
                className={cn(
                  'relative flex items-center gap-2 rounded-2xl border ps-4 pe-2 py-1.5 overflow-hidden',
                  editingId === category.id ? 'border-primary bg-primary-soft/40' : 'border-line bg-surface',
                  confirming && 'border-danger bg-danger-soft/40'
                )}
              >
                <span className="absolute start-0 inset-y-0 w-1.5" style={{ background: categoryColor(category.id) }} />
                <MoveButtons disabled={busy} canUp={index > 0} canDown={index < categories.length - 1} onUp={() => move(index, -1)} onDown={() => move(index, 1)} />
                <span className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center text-2xl" style={{ background: categoryTint(category.id, 18) }}>
                  {category.icon || ''}
                </span>
                {confirming ? (
                  <>
                    <p className="flex-1 min-w-0 text-sm font-semibold text-danger-ink">{t('menu.categories.deleteConfirm', { name: getName(category) })}</p>
                    <Button variant="secondary" onClick={() => setConfirmId(null)} disabled={busy}>{t('common.cancel')}</Button>
                    <Button variant="danger" onClick={() => void doDelete(category)} loading={busy}>{t('common.delete')}</Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-ink truncate">{getName(category)}</p>
                      <p className="text-xs text-muted truncate">{[category.name, category.name_fr, category.name_ar].filter(Boolean).join(' · ')}</p>
                    </div>
                    <Badge variant="neutral">{t('menu.categories.itemCount', { count: countItems(category.id) })}</Badge>
                    <IconButton icon={<Pencil />} label={t('common.edit')} onClick={() => startEdit(category)} />
                    <IconButton icon={<Trash2 />} variant="danger" label={t('common.delete')} onClick={() => askDelete(category)} />
                  </>
                )}
              </div>
            )
          })}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface-2/60 p-4 space-y-3">
            <SectionLabel action={editingId ? <IconButton icon={<X />} label={t('common.cancel')} onClick={resetForm} /> : undefined}>
              {editingId ? t('menu.categories.edit') : t('menu.categories.add')}
            </SectionLabel>
            <div className="grid grid-cols-[5rem_1fr] gap-3">
              {/* Emoji cannot be typed on the virtual keyboard; the icon stays a plain (pasteable) field. */}
              <Input label={t('menu.categories.icon')} value={form.icon} onChange={(e) => setField('icon', e.target.value)} placeholder="🍔" className="text-center" style={{ fontSize: '1.5rem' }} maxLength={8} />
              <Input label={t('menu.name')} {...kb.bind(form.name, (v) => setField('name', v))} />
            </div>
            <Input label={t('menu.nameAr')} dir="rtl" {...kb.bind(form.name_ar, (v) => setField('name_ar', v), 'text', true)} />
            <Input label={t('menu.nameFr')} {...kb.bind(form.name_fr, (v) => setField('name_fr', v))} />
            <Button fullWidth size="lg" onClick={save} loading={busy} icon={editingId ? undefined : <Plus className="h-5 w-5" />}>
              {editingId ? t('common.save') : t('menu.categories.add')}
            </Button>
          </div>
          {editingId && <AvailabilityEditor target={{ kind: 'category', id: editingId }} />}
        </div>
      </div>
      {kb.keyboard}
    </Modal>
  )
}
