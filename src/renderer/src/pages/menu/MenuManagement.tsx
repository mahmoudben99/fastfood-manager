import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { formatCurrency } from '../../utils/formatCurrency'

export function MenuManagement() {
  const { t } = useTranslation()
  const { foodLanguage } = useAppStore()
  const [items, setItems] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [stockItems, setStockItems] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formNameAr, setFormNameAr] = useState('')
  const [formNameFr, setFormNameFr] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formImagePath, setFormImagePath] = useState('')
  const [formEmoji, setFormEmoji] = useState('')
  const [formIngredients, setFormIngredients] = useState<
    { stock_item_id: number; quantity: number; unit: string }[]
  >([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [menuItems, cats, stock] = await Promise.all([
      window.api.menu.getAll(),
      window.api.categories.getAll(),
      window.api.stock.getAll()
    ])
    setItems(menuItems)
    setCategories(cats)
    setStockItems(stock)
  }

  const getName = (item: any) => {
    if (foodLanguage === 'ar' && item.name_ar) return item.name_ar
    if (foodLanguage === 'fr' && item.name_fr) return item.name_fr
    return item.name
  }

  const filtered = items.filter((item) => {
    const matchSearch = getName(item).toLowerCase().includes(search.toLowerCase())
    const matchCategory = !filterCategory || item.category_id === Number(filterCategory)
    return matchSearch && matchCategory
  })

  const openForm = async (item?: any) => {
    if (item) {
      const full = await window.api.menu.getById(item.id)
      setEditItem(full)
      setFormName(full.name)
      setFormNameAr(full.name_ar || '')
      setFormNameFr(full.name_fr || '')
      setFormPrice(String(full.price))
      setFormCategory(String(full.category_id))
      setFormImagePath(full.image_path || '')
      setFormEmoji(full.emoji || '')
      setFormIngredients(
        full.ingredients?.map((i: any) => ({
          stock_item_id: i.stock_item_id,
          quantity: i.quantity,
          unit: i.unit
        })) || []
      )
    } else {
      setEditItem(null)
      setFormName('')
      setFormNameAr('')
      setFormNameFr('')
      setFormPrice('')
      setFormCategory(categories[0]?.id?.toString() || '')
      setFormImagePath('')
      setFormEmoji('')
      setFormIngredients([])
    }
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const data = {
      name: formName,
      name_ar: formNameAr || undefined,
      name_fr: formNameFr || undefined,
      price: Number(formPrice),
      category_id: Number(formCategory),
      image_path: formImagePath || undefined,
      emoji: formEmoji || undefined,
      ingredients: formIngredients
    }

    if (editItem) {
      await window.api.menu.update(editItem.id, data)
    } else {
      await window.api.menu.create(data)
    }

    setShowForm(false)
    setSaving(false)
    loadData()
  }

  const handleUploadImage = async () => {
    const path = await window.api.menu.uploadImage()
    if (path) setFormImagePath(path)
  }

  const handleDelete = async (id: number) => {
    await window.api.menu.delete(id)
    loadData()
  }

  const addIngredient = () => {
    setFormIngredients([...formIngredients, { stock_item_id: 0, quantity: 0, unit: 'g' }])
  }

  const updateIngredient = (index: number, field: string, value: any) => {
    const updated = [...formIngredients]
    updated[index] = { ...updated[index], [field]: value }
    setFormIngredients(updated)
  }

  const removeIngredient = (index: number) => {
    setFormIngredients(formIngredients.filter((_, i) => i !== index))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('menu.title')}</h1>
        <Button onClick={() => openForm()}>
          <Plus className="h-4 w-4" />
          {t('menu.addItem')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('menu.search')}
            className="w-full ps-10 pe-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
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
          <div key={item.id} className="bg-white rounded-xl border p-4 group">
            {item.image_path ? (
              <div className="aspect-video rounded-lg bg-gray-100 mb-3 overflow-hidden">
                <img
                  src={`app-image://${item.image_path}`}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="aspect-video rounded-lg bg-gradient-to-br from-orange-50 to-amber-50 mb-3 flex items-center justify-center">
                <span className="text-4xl">{item.emoji || categories.find((c: any) => c.id === item.category_id)?.icon || '🍔'}</span>
              </div>
            )}
            <h3 className="font-semibold text-gray-900">{getName(item)}</h3>
            <div className="flex items-center justify-between mt-2">
              <span className="text-orange-600 font-bold">{formatCurrency(item.price)}</span>
              <Badge>{categories.find((c: any) => c.id === item.category_id)?.icon || ''} {item.category_name}</Badge>
            </div>
            <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" onClick={() => openForm(item)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">{t('menu.noItems')}</div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editItem ? t('menu.editItem') : t('menu.addItem')}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Input
              label={t('menu.name')}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            <Input
              label={t('menu.nameAr')}
              value={formNameAr}
              onChange={(e) => setFormNameAr(e.target.value)}
              dir="rtl"
            />
            <Input
              label={t('menu.nameFr')}
              value={formNameFr}
              onChange={(e) => setFormNameFr(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('menu.price')}
              type="number"
              value={formPrice}
              onChange={(e) => setFormPrice(e.target.value)}
              step="0.01"
            />
            <Select
              label={t('menu.category')}
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              options={categories.map((c: any) => ({ value: String(c.id), label: `${c.icon ? c.icon + ' ' : ''}${getName(c)}` }))}
            />
          </div>

          {/* Emoji */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Emoji</label>
            <div className="flex items-center gap-2">
              <input
                value={formEmoji}
                onChange={(e) => setFormEmoji(e.target.value)}
                placeholder="🍔"
                className="w-16 h-10 border rounded-lg text-center text-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                maxLength={2}
              />
              <span className="text-xs text-gray-400">Paste or type a food emoji</span>
            </div>
          </div>

          {/* Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('menu.image')}</label>
            <div className="flex items-center gap-3">
              {formImagePath && (
                <img
                  src={`app-image://${formImagePath}`}
                  className="w-16 h-16 rounded-lg object-cover"
                />
              )}
              <Button variant="secondary" size="sm" onClick={handleUploadImage}>
                {t('menu.uploadImage')}
              </Button>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">{t('menu.ingredients')}</label>
              <Button variant="ghost" size="sm" onClick={addIngredient}>
                <Plus className="h-4 w-4" />
                {t('menu.addIngredient')}
              </Button>
            </div>
            <div className="space-y-2">
              {formIngredients.map((ing, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={ing.stock_item_id}
                    onChange={(e) => updateIngredient(i, 'stock_item_id', Number(e.target.value))}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                  >
                    <option value={0}>{t('menu.stockItem')}</option>
                    {stockItems.map((s: any) => (
                      <option key={s.id} value={s.id}>{getName(s)}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(i, 'quantity', Number(e.target.value))}
                    placeholder={t('menu.quantity')}
                    className="w-24 border rounded-lg px-2 py-1.5 text-sm"
                  />
                  <select
                    value={ing.unit}
                    onChange={(e) => updateIngredient(i, 'unit', e.target.value)}
                    className="w-20 border rounded-lg px-2 py-1.5 text-sm"
                  >
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="unit">unit</option>
                  </select>
                  <button
                    onClick={() => removeIngredient(i)}
                    className="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowForm(false)} className="flex-1">
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={!formName || !formPrice || !formCategory}
              className="flex-1"
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
