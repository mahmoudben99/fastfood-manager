import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Tag, Package, ToggleLeft, ToggleRight, Percent, DollarSign } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { formatCurrency } from '../../utils/formatCurrency'

export function PromotionsPage() {
  const { t } = useTranslation()
  const { foodLanguage } = useAppStore()
  const [tab, setTab] = useState<'promos' | 'packs'>('promos')

  // Promos state
  const [promos, setPromos] = useState<any[]>([])
  const [showPromoForm, setShowPromoForm] = useState(false)
  const [editPromo, setEditPromo] = useState<any>(null)
  const [promoName, setPromoName] = useState('')
  const [promoNameAr, setPromoNameAr] = useState('')
  const [promoNameFr, setPromoNameFr] = useState('')
  const [promoType, setPromoType] = useState<'percentage' | 'fixed'>('percentage')
  const [promoValue, setPromoValue] = useState('')
  const [promoAppliesTo, setPromoAppliesTo] = useState<'all' | 'specific'>('all')
  const [promoItemIds, setPromoItemIds] = useState<number[]>([])

  // Packs state
  const [packs, setPacks] = useState<any[]>([])
  const [showPackForm, setShowPackForm] = useState(false)
  const [editPack, setEditPack] = useState<any>(null)
  const [packName, setPackName] = useState('')
  const [packNameAr, setPackNameAr] = useState('')
  const [packNameFr, setPackNameFr] = useState('')
  const [packPrice, setPackPrice] = useState('')
  const [packEmoji, setPackEmoji] = useState('')
  const [packItems, setPackItems] = useState<{ menu_item_id: number; quantity: number }[]>([])

  // Menu items for selection
  const [menuItems, setMenuItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [p, pk, items] = await Promise.all([
      window.api.promotions.getAll(),
      window.api.packs.getAll(),
      window.api.menu.getAll()
    ])
    setPromos(p)
    setPacks(pk)
    setMenuItems(items)
  }

  const getName = (item: any) => {
    if (foodLanguage === 'ar' && item.name_ar) return item.name_ar
    if (foodLanguage === 'fr' && item.name_fr) return item.name_fr
    return item.name
  }

  // --- Promo handlers ---
  const openPromoForm = (promo?: any) => {
    if (promo) {
      setEditPromo(promo)
      setPromoName(promo.name)
      setPromoNameAr(promo.name_ar || '')
      setPromoNameFr(promo.name_fr || '')
      setPromoType(promo.type)
      setPromoValue(String(promo.discount_value))
      setPromoAppliesTo(promo.applies_to)
      setPromoItemIds(promo.menu_item_ids || [])
    } else {
      setEditPromo(null)
      setPromoName('')
      setPromoNameAr('')
      setPromoNameFr('')
      setPromoType('percentage')
      setPromoValue('')
      setPromoAppliesTo('all')
      setPromoItemIds([])
    }
    setShowPromoForm(true)
  }

  const savePromo = async () => {
    setSaving(true)
    const input = {
      name: promoName,
      name_ar: promoNameAr || undefined,
      name_fr: promoNameFr || undefined,
      type: promoType,
      discount_value: Number(promoValue),
      applies_to: promoAppliesTo,
      menu_item_ids: promoAppliesTo === 'specific' ? promoItemIds : undefined
    }
    if (editPromo) {
      await window.api.promotions.update(editPromo.id, input)
    } else {
      await window.api.promotions.create(input)
    }
    setShowPromoForm(false)
    setSaving(false)
    loadData()
  }

  const deletePromo = async (id: number) => {
    await window.api.promotions.delete(id)
    loadData()
  }

  const togglePromo = async (id: number) => {
    await window.api.promotions.toggle(id)
    loadData()
  }

  // --- Pack handlers ---
  const openPackForm = (pack?: any) => {
    if (pack) {
      setEditPack(pack)
      setPackName(pack.name)
      setPackNameAr(pack.name_ar || '')
      setPackNameFr(pack.name_fr || '')
      setPackPrice(String(pack.pack_price))
      setPackEmoji(pack.emoji || '')
      setPackItems(pack.items?.map((i: any) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })) || [])
    } else {
      setEditPack(null)
      setPackName('')
      setPackNameAr('')
      setPackNameFr('')
      setPackPrice('')
      setPackEmoji('')
      setPackItems([])
    }
    setShowPackForm(true)
  }

  const savePack = async () => {
    setSaving(true)
    const input = {
      name: packName,
      name_ar: packNameAr || undefined,
      name_fr: packNameFr || undefined,
      pack_price: Number(packPrice),
      emoji: packEmoji || undefined,
      items: packItems.filter(i => i.menu_item_id > 0)
    }
    if (editPack) {
      await window.api.packs.update(editPack.id, input)
    } else {
      await window.api.packs.create(input)
    }
    setShowPackForm(false)
    setSaving(false)
    loadData()
  }

  const deletePack = async (id: number) => {
    await window.api.packs.delete(id)
    loadData()
  }

  const togglePack = async (id: number) => {
    await window.api.packs.toggle(id)
    loadData()
  }

  const toggleItemInPromo = (itemId: number) => {
    setPromoItemIds(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    )
  }

  const addPackItem = () => {
    setPackItems([...packItems, { menu_item_id: 0, quantity: 1 }])
  }

  const updatePackItem = (index: number, field: string, value: any) => {
    const updated = [...packItems]
    updated[index] = { ...updated[index], [field]: value }
    setPackItems(updated)
  }

  const removePackItem = (index: number) => {
    setPackItems(packItems.filter((_, i) => i !== index))
  }

  // Calculate savings for a pack
  const getPackSavings = (pack: any) => {
    if (!pack.items) return 0
    const individualTotal = pack.items.reduce((sum: number, item: any) => {
      const menuItem = menuItems.find(m => m.id === item.menu_item_id)
      return sum + (menuItem?.price || 0) * item.quantity
    }, 0)
    return Math.max(0, individualTotal - pack.pack_price)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Promotions & Loyalty</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('promos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'promos' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Tag className="h-4 w-4" />
          Discounts ({promos.length})
        </button>
        <button
          onClick={() => setTab('packs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'packs' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Package className="h-4 w-4" />
          Packs ({packs.length})
        </button>
      </div>

      {/* ===== PROMOS TAB ===== */}
      {tab === 'promos' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button onClick={() => openPromoForm()}>
              <Plus className="h-4 w-4" />
              Add Discount
            </Button>
          </div>

          {promos.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Tag className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No discounts yet</p>
              <p className="text-sm mt-1">Create your first discount to attract more customers</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {promos.map((promo) => (
                <div key={promo.id} className={`rounded-xl border-2 p-4 transition-all ${
                  promo.is_active ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white opacity-60'
                }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{getName(promo)}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                          {promo.type === 'percentage' ? <Percent className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />}
                          {promo.type === 'percentage' ? `${promo.discount_value}%` : formatCurrency(promo.discount_value)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {promo.applies_to === 'all' ? 'All items' : 'Specific items'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => togglePromo(promo.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {promo.is_active
                        ? <ToggleRight className="h-6 w-6 text-green-500" />
                        : <ToggleLeft className="h-6 w-6" />
                      }
                    </button>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => openPromoForm(promo)} className="p-1.5 hover:bg-gray-100 rounded">
                      <Pencil className="h-4 w-4 text-gray-500" />
                    </button>
                    <button onClick={() => deletePromo(promo.id)} className="p-1.5 hover:bg-red-100 rounded">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== PACKS TAB ===== */}
      {tab === 'packs' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button onClick={() => openPackForm()}>
              <Plus className="h-4 w-4" />
              Add Pack
            </Button>
          </div>

          {packs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No pack promotions yet</p>
              <p className="text-sm mt-1">Group items together at a special price</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {packs.map((pack) => {
                const savings = getPackSavings(pack)
                return (
                  <div key={pack.id} className={`rounded-xl border-2 p-4 transition-all ${
                    pack.is_active ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white opacity-60'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {pack.emoji && <span className="mr-1">{pack.emoji}</span>}
                          {getName(pack)}
                        </h3>
                        <p className="text-lg font-bold text-orange-600 mt-1">{formatCurrency(pack.pack_price)}</p>
                        {savings > 0 && (
                          <p className="text-xs text-green-600 font-medium">Save {formatCurrency(savings)}</p>
                        )}
                      </div>
                      <button
                        onClick={() => togglePack(pack.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {pack.is_active
                          ? <ToggleRight className="h-6 w-6 text-green-500" />
                          : <ToggleLeft className="h-6 w-6" />
                        }
                      </button>
                    </div>
                    {pack.items && pack.items.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {pack.items.map((item: any, i: number) => (
                          <p key={i} className="text-xs text-gray-600">
                            {item.quantity}x {item.menu_item_name || `Item #${item.menu_item_id}`}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => openPackForm(pack)} className="p-1.5 hover:bg-gray-100 rounded">
                        <Pencil className="h-4 w-4 text-gray-500" />
                      </button>
                      <button onClick={() => deletePack(pack.id)} className="p-1.5 hover:bg-red-100 rounded">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== PROMO FORM MODAL ===== */}
      <Modal
        isOpen={showPromoForm}
        onClose={() => setShowPromoForm(false)}
        title={editPromo ? 'Edit Discount' : 'New Discount'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Input label="Name" value={promoName} onChange={(e) => setPromoName(e.target.value)} />
            <Input label="Name (AR)" value={promoNameAr} onChange={(e) => setPromoNameAr(e.target.value)} dir="rtl" />
            <Input label="Name (FR)" value={promoNameFr} onChange={(e) => setPromoNameFr(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Discount Type"
              value={promoType}
              onChange={(e) => setPromoType(e.target.value as 'percentage' | 'fixed')}
              options={[
                { value: 'percentage', label: 'Percentage (%)' },
                { value: 'fixed', label: 'Fixed Amount' }
              ]}
            />
            <Input
              label={promoType === 'percentage' ? 'Discount (%)' : 'Discount Amount'}
              type="number"
              value={promoValue}
              onChange={(e) => setPromoValue(e.target.value)}
              step="0.01"
            />
          </div>

          <Select
            label="Applies To"
            value={promoAppliesTo}
            onChange={(e) => setPromoAppliesTo(e.target.value as 'all' | 'specific')}
            options={[
              { value: 'all', label: 'All menu items' },
              { value: 'specific', label: 'Specific items only' }
            ]}
          />

          {promoAppliesTo === 'specific' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Items</label>
              <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                {menuItems.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={promoItemIds.includes(item.id)}
                      onChange={() => toggleItemInPromo(item.id)}
                      className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                    />
                    <span className="text-sm">{getName(item)}</span>
                    <span className="text-xs text-gray-400 ml-auto">{formatCurrency(item.price)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowPromoForm(false)} className="flex-1">Cancel</Button>
            <Button onClick={savePromo} loading={saving} disabled={!promoName || !promoValue} className="flex-1">Save</Button>
          </div>
        </div>
      </Modal>

      {/* ===== PACK FORM MODAL ===== */}
      <Modal
        isOpen={showPackForm}
        onClose={() => setShowPackForm(false)}
        title={editPack ? 'Edit Pack' : 'New Pack'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Input label="Pack Name" value={packName} onChange={(e) => setPackName(e.target.value)} />
            <Input label="Name (AR)" value={packNameAr} onChange={(e) => setPackNameAr(e.target.value)} dir="rtl" />
            <Input label="Name (FR)" value={packNameFr} onChange={(e) => setPackNameFr(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input label="Pack Price" type="number" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} step="0.01" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emoji</label>
              <input
                value={packEmoji}
                onChange={(e) => setPackEmoji(e.target.value)}
                placeholder="🍔"
                className="w-16 h-10 border rounded-lg text-center text-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                maxLength={2}
              />
            </div>
          </div>

          {/* Pack items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Items in Pack</label>
              <button
                onClick={addPackItem}
                className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 font-medium"
              >
                <Plus className="h-4 w-4" />
                Add Item
              </button>
            </div>
            <div className="space-y-2">
              {packItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={item.menu_item_id}
                    onChange={(e) => updatePackItem(i, 'menu_item_id', Number(e.target.value))}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                  >
                    <option value={0}>Select item...</option>
                    {menuItems.map((m: any) => (
                      <option key={m.id} value={m.id}>{getName(m)} — {formatCurrency(m.price)}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updatePackItem(i, 'quantity', Number(e.target.value))}
                    min={1}
                    className="w-16 border rounded-lg px-2 py-1.5 text-sm text-center"
                  />
                  <button onClick={() => removePackItem(i)} className="p-1 hover:bg-red-100 rounded">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
            {packItems.length > 0 && packPrice && (
              <div className="mt-3 p-2 bg-gray-50 rounded-lg text-sm">
                <span className="text-gray-500">Individual total: </span>
                <span className="font-medium">
                  {formatCurrency(packItems.reduce((sum, pi) => {
                    const m = menuItems.find(x => x.id === pi.menu_item_id)
                    return sum + (m?.price || 0) * pi.quantity
                  }, 0))}
                </span>
                <span className="text-gray-500"> → Pack price: </span>
                <span className="font-bold text-green-600">{formatCurrency(Number(packPrice))}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowPackForm(false)} className="flex-1">Cancel</Button>
            <Button onClick={savePack} loading={saving} disabled={!packName || !packPrice || packItems.length === 0} className="flex-1">Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
