import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Pencil, Trash2, Tags, ArchiveRestore, X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { Badge } from '../../components/ui/Badge'
import { formatCurrency } from '../../utils/formatCurrency'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'
import { MenuItemForm, toRecipeRows } from './MenuItemForm'
import { CategoryManager } from './CategoryManager'
import { ConfirmDialog } from './ConfirmDialog'
import { checkRecipeRows, isBlockingIssue } from './recipeUnits'

type Notice = { tone: 'success' | 'warning' | 'error'; text: string } | null

const NOTICE_STYLES = {
  success: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error: 'bg-red-50 border-red-200 text-red-700'
}

export function MenuManagement() {
  const { t } = useTranslation()
  const { foodLanguage, inputMode } = useAppStore()
  const isTouch = inputMode === 'touchscreen'
  const [items, setItems] = useState<any[]>([])
  const [deletedItems, setDeletedItems] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [stockItems, setStockItems] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Add/edit form: remounted (fresh state) every time it opens.
  const [form, setForm] = useState<{ item: any | null; validate: boolean; key: number } | null>(null)

  // Virtual keyboard (search field; the form has its own)
  const [searchKeyboard, setSearchKeyboard] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async (): Promise<any[]> => {
    try {
      const [menuItems, cats, stock, deleted] = await Promise.all([
        window.api.menu.getAll(),
        window.api.categories.getAll(),
        window.api.stock.getAll(),
        window.api.menu.getDeleted()
      ])
      setItems(menuItems)
      setCategories(cats)
      setStockItems(stock)
      setDeletedItems(deleted)
      if (filterCategory && !cats.some((c: any) => String(c.id) === filterCategory)) setFilterCategory('')
      return stock
    } catch (err) {
      setNotice({ tone: 'error', text: ipcErrorMessage(err, t('menu.loadFailed')) })
      return stockItems
    }
  }

  const getName = (item: any) => {
    if (foodLanguage === 'ar' && item.name_ar) return item.name_ar
    if (foodLanguage === 'fr' && item.name_fr) return item.name_fr
    return item.name
  }

  const filtered = (showDeleted ? deletedItems : items).filter((item) => {
    const matchSearch = getName(item).toLowerCase().includes(search.toLowerCase())
    const matchCategory = !filterCategory || item.category_id === Number(filterCategory)
    return matchSearch && matchCategory
  })

  const openForm = async (item?: any, validate = false) => {
    if (!item) {
      setForm({ item: null, validate: false, key: Date.now() })
      return
    }
    try {
      const full = await window.api.menu.getById(item.id)
      if (full) setForm({ item: full, validate, key: Date.now() })
    } catch (err) {
      setNotice({ tone: 'error', text: ipcErrorMessage(err, t('menu.loadFailed')) })
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await window.api.menu.delete(confirmDelete.id)
      setNotice({ tone: 'success', text: t('menu.deleted', { name: getName(confirmDelete) }) })
      setConfirmDelete(null)
      await loadData()
    } catch (err) {
      setDeleteError(ipcErrorMessage(err, t('menu.deleteFailed')))
    } finally {
      setDeleting(false)
    }
  }

  const handleRestore = async (item: any) => {
    const name = getName(item)
    try {
      const { item: restored, categoryRestored } = await window.api.menu.restore(item.id)
      const stock = await loadData()
      const full = await window.api.menu.getById(restored.id)
      if (checkRecipeRows(toRecipeRows(full?.ingredients), stock).some(isBlockingIssue)) {
        setNotice({ tone: 'warning', text: t('menu.restoredNeedsRecipeFix', { name }) })
        await openForm(restored, true)
      } else {
        setNotice({
          tone: 'success',
          text: categoryRestored
            ? t('menu.restoredWithCategory', { name, category: restored.category_name })
            : t('menu.restored', { name })
        })
      }
    } catch (err) {
      setNotice({ tone: 'error', text: ipcErrorMessage(err, t('menu.restoreFailed')) })
    }
  }

  const categoryOf = (item: any) => categories.find((c: any) => c.id === item.category_id)

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">{showDeleted ? t('menu.deletedTitle') : t('menu.title')}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCategories(true)}>
            <Tags className="h-4 w-4" />
            {t('menu.categories.manage')}
          </Button>
          <Button variant="secondary" onClick={() => setShowDeleted(!showDeleted)}>
            <ArchiveRestore className="h-4 w-4" />
            {showDeleted ? t('menu.hideDeleted') : t('menu.showDeleted', { count: deletedItems.length })}
          </Button>
          {!showDeleted && (
            <Button onClick={() => openForm()}>
              <Plus className="h-4 w-4" />
              {t('menu.addItem')}
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <div className={`flex items-start gap-3 mb-4 border rounded-lg p-3 text-sm ${NOTICE_STYLES[notice.tone]}`}>
          <p className="flex-1">{notice.text}</p>
          <button type="button" onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100" title={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            readOnly={isTouch}
            onClick={isTouch ? () => setSearchKeyboard(true) : undefined}
            onChange={isTouch ? undefined : (e) => setSearch(e.target.value)}
            placeholder={t('menu.search')}
            className={`w-full ps-10 pe-3 ${isTouch ? 'py-3 text-base' : 'py-2 text-sm'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500`}
          />
        </div>
        <Select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          options={[
            { value: '', label: t('common.all') },
            ...categories.map((c: any) => ({ value: String(c.id), label: `${c.icon ? c.icon + ' ' : ''}${getName(c)}` }))
          ]}
          className="w-48"
        />
      </div>

      {/* Items grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((item) => (
          <div key={item.id} className={`bg-white rounded-xl border p-4 group ${showDeleted ? 'opacity-80' : ''}`}>
            {item.image_path ? (
              <div className="aspect-video rounded-lg bg-gray-100 mb-3 overflow-hidden">
                <img src={`app-image://${item.image_path}`} alt={item.name} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="aspect-video rounded-lg bg-gradient-to-br from-orange-50 to-amber-50 mb-3 flex items-center justify-center">
                <span className="text-4xl">{item.emoji || categoryOf(item)?.icon || '🍔'}</span>
              </div>
            )}
            <h3 className="font-semibold text-gray-900">{getName(item)}</h3>
            <div className="flex items-center justify-between mt-2 gap-2">
              <span className="text-orange-600 font-bold">{formatCurrency(item.price)}</span>
              <Badge variant={item.category_active === 0 ? 'warning' : 'default'}>
                {categoryOf(item)?.icon || ''} {item.category_name}
                {item.category_active === 0 ? ` (${t('menu.categoryDeleted')})` : ''}
              </Badge>
            </div>
            {showDeleted ? (
              <Button variant="secondary" size={isTouch ? 'md' : 'sm'} onClick={() => handleRestore(item)} className="mt-3 w-full">
                <ArchiveRestore className="h-4 w-4" />
                {t('menu.restore')}
              </Button>
            ) : (
              <div className={`flex gap-2 mt-3 transition-opacity ${isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <Button variant="ghost" size={isTouch ? 'md' : 'sm'} onClick={() => openForm(item)} title={t('common.edit')}>
                  <Pencil className={isTouch ? 'h-5 w-5' : 'h-4 w-4'} />
                </Button>
                <Button variant="ghost" size={isTouch ? 'md' : 'sm'} onClick={() => { setDeleteError(''); setConfirmDelete(item) }} title={t('common.delete')}>
                  <Trash2 className={`${isTouch ? 'h-5 w-5' : 'h-4 w-4'} text-red-500`} />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">{showDeleted ? t('menu.noDeletedItems') : t('menu.noItems')}</div>
      )}

      {form && (
        <MenuItemForm
          key={form.key}
          item={form.item}
          validateOnOpen={form.validate}
          categories={categories}
          stockItems={stockItems}
          getName={getName}
          isTouch={isTouch}
          onClose={() => setForm(null)}
          onSaved={loadData}
        />
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title={t('menu.deleteTitle')}
        message={confirmDelete ? t('menu.deleteConfirm', { name: getName(confirmDelete) }) : ''}
        confirmLabel={t('common.delete')}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        busy={deleting}
        error={deleteError}
      />

      <CategoryManager
        isOpen={showCategories}
        onClose={() => setShowCategories(false)}
        categories={categories}
        items={items}
        onChanged={async () => { await loadData() }}
        isTouch={isTouch}
        getName={getName}
      />

      {/* Virtual Keyboard for touchscreen mode */}
      {isTouch && searchKeyboard && (
        <VirtualKeyboard
          visible
          type="text"
          value={search}
          onChange={setSearch}
          onClose={() => setSearchKeyboard(false)}
        />
      )}
    </div>
  )
}
