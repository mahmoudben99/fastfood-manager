import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, AlertTriangle, Pencil, Wrench, SlidersHorizontal, ShoppingBag } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { formatCurrency } from '../../utils/formatCurrency'

const UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  liter: 'L',
  unit: 'pcs'
}

export function StockManagement() {
  const { t } = useTranslation()
  const { language, foodLanguage } = useAppStore()
  const [items, setItems] = useState<any[]>([])
  const [tab, setTab] = useState<'all' | 'low'>('all')
  const [lowCount, setLowCount] = useState(0)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [formName, setFormName] = useState('')
  const [formNameAr, setFormNameAr] = useState('')
  const [formNameFr, setFormNameFr] = useState('')
  const [formUnitType, setFormUnitType] = useState('kg')
  const [formPrice, setFormPrice] = useState('')
  const [formThreshold, setFormThreshold] = useState('')

  // Adjustment modal
  const [adjustModal, setAdjustModal] = useState<{
    item: any
    type: 'fix' | 'adjust' | 'purchase'
  } | null>(null)
  const [adjQuantity, setAdjQuantity] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [adjPrice, setAdjPrice] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [all, count] = await Promise.all([
      window.api.stock.getAll(),
      window.api.stock.getLowStockCount()
    ])
    setItems(all)
    setLowCount(count)
  }

  const getName = (item: any) => {
    // Primary name in food language
    let primary = item.name
    if (foodLanguage === 'ar' && item.name_ar) primary = item.name_ar
    else if (foodLanguage === 'fr' && item.name_fr) primary = item.name_fr

    // If food language differs from app language, show dual: "primary - (translation)"
    if (foodLanguage !== language) {
      let translation = item.name
      if (language === 'ar' && item.name_ar) translation = item.name_ar
      else if (language === 'fr' && item.name_fr) translation = item.name_fr
      if (translation !== primary) return `${primary} - (${translation})`
    }
    return primary
  }

  const getStatus = (item: any): 'ok' | 'low' | 'out' => {
    if (item.quantity <= 0) return 'out'
    if (item.quantity <= item.alert_threshold) return 'low'
    return 'ok'
  }

  const formatQty = (item: any) => {
    const unit = UNIT_LABELS[item.unit_type] || item.unit_type
    if (item.unit_type === 'unit') {
      return `${Math.round(item.quantity)} ${unit}`
    }
    return `${item.quantity.toFixed(2)} ${unit}`
  }

  const statusBadge = (status: string) => {
    const map: Record<string, 'success' | 'warning' | 'danger'> = {
      ok: 'success',
      low: 'warning',
      out: 'danger'
    }
    return <Badge variant={map[status]}>{t(`stock.${status}`)}</Badge>
  }

  const displayed = tab === 'low' ? items.filter((i) => i.quantity <= i.alert_threshold) : items

  const openForm = (item?: any) => {
    if (item) {
      setEditItem(item)
      setFormName(item.name)
      setFormNameAr(item.name_ar || '')
      setFormNameFr(item.name_fr || '')
      setFormUnitType(item.unit_type)
      setFormPrice(String(item.price_per_unit))
      setFormThreshold(String(item.alert_threshold))
    } else {
      setEditItem(null)
      setFormName('')
      setFormNameAr('')
      setFormNameFr('')
      setFormUnitType('kg')
      setFormPrice('')
      setFormThreshold('5')
    }
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const data = {
      name: formName,
      name_ar: formNameAr || undefined,
      name_fr: formNameFr || undefined,
      unit_type: formUnitType,
      price_per_unit: Number(formPrice),
      alert_threshold: Number(formThreshold) || 0
    }
    if (editItem) {
      await window.api.stock.update(editItem.id, data)
    } else {
      await window.api.stock.create(data)
    }
    setShowForm(false)
    setSaving(false)
    loadData()
  }

  const handleAdjustment = async () => {
    if (!adjustModal) return
    setSaving(true)

    const { item, type } = adjustModal
    if (type === 'fix') {
      await window.api.stock.fix(item.id, Number(adjQuantity), adjReason)
    } else if (type === 'adjust') {
      await window.api.stock.adjust(item.id, Number(adjQuantity), adjReason)
    } else if (type === 'purchase') {
      await window.api.stock.addPurchase(item.id, Number(adjQuantity), Number(adjPrice))
    }

    setAdjustModal(null)
    setSaving(false)
    loadData()
  }

  const openAdjust = (item: any, type: 'fix' | 'adjust' | 'purchase') => {
    setAdjQuantity(type === 'purchase' ? '' : String(item.quantity))
    setAdjReason('')
    setAdjPrice(String(item.price_per_unit))
    setAdjustModal({ item, type })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('stock.title')}</h1>
        <Button onClick={() => openForm()}>
          <Plus className="h-4 w-4" />
          {t('stock.addItem')}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'all' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {t('stock.allStock')}
        </button>
        <button
          onClick={() => setTab('low')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === 'low' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          {t('stock.lowStock')}
          {lowCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
              {lowCount}
            </span>
          )}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-start px-4 py-3 font-medium text-gray-600">{t('stock.name')}</th>
              <th className="text-start px-4 py-3 font-medium text-gray-600">{t('stock.currentQty')}</th>
              <th className="text-start px-4 py-3 font-medium text-gray-600">{t('stock.pricePerUnit')}</th>
              <th className="text-start px-4 py-3 font-medium text-gray-600">{t('stock.status')}</th>
              <th className="text-end px-4 py-3 font-medium text-gray-600">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{getName(item)}</td>
                <td className="px-4 py-3">{formatQty(item)}</td>
                <td className="px-4 py-3">{formatCurrency(item.price_per_unit)}</td>
                <td className="px-4 py-3">{statusBadge(getStatus(item))}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openForm(item)} className="p-1.5 hover:bg-gray-100 rounded" title={t('common.edit')}>
                      <Pencil className="h-4 w-4 text-gray-500" />
                    </button>
                    <button onClick={() => openAdjust(item, 'fix')} className="p-1.5 hover:bg-blue-50 rounded" title={t('stock.fix')}>
                      <Wrench className="h-4 w-4 text-blue-500" />
                    </button>
                    <button onClick={() => openAdjust(item, 'adjust')} className="p-1.5 hover:bg-yellow-50 rounded" title={t('stock.adjust')}>
                      <SlidersHorizontal className="h-4 w-4 text-yellow-600" />
                    </button>
                    <button onClick={() => openAdjust(item, 'purchase')} className="p-1.5 hover:bg-green-50 rounded" title={t('stock.purchase')}>
                      <ShoppingBag className="h-4 w-4 text-green-600" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayed.length === 0 && (
          <div className="text-center py-12 text-gray-400">{t('stock.noItems')}</div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editItem ? t('stock.editItem') : t('stock.addItem')}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Input label={t('stock.name')} value={formName} onChange={(e) => setFormName(e.target.value)} />
            <Input label={t('menu.nameAr')} value={formNameAr} onChange={(e) => setFormNameAr(e.target.value)} dir="rtl" />
            <Input label={t('menu.nameFr')} value={formNameFr} onChange={(e) => setFormNameFr(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select
              label={t('stock.unitType')}
              value={formUnitType}
              onChange={(e) => setFormUnitType(e.target.value)}
              options={[
                { value: 'kg', label: t('stock.units.kg') },
                { value: 'liter', label: t('stock.units.liter') },
                { value: 'unit', label: t('stock.units.unit') }
              ]}
            />
            <Input label={t('stock.pricePerUnit')} type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} step="0.01" />
            <Input label={t('stock.alertThreshold')} type="number" value={formThreshold} onChange={(e) => setFormThreshold(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowForm(false)} className="flex-1">{t('common.cancel')}</Button>
            <Button onClick={handleSave} loading={saving} disabled={!formName || !formPrice} className="flex-1">{t('common.save')}</Button>
          </div>
        </div>
      </Modal>

      {/* Adjustment Modal */}
      {adjustModal && (
        <Modal
          isOpen
          onClose={() => setAdjustModal(null)}
          title={
            adjustModal.type === 'fix' ? t('stock.fixTitle') :
            adjustModal.type === 'adjust' ? t('stock.adjustTitle') :
            t('stock.purchaseTitle')
          }
        >
          <div className="space-y-4">
            {adjustModal.type !== 'purchase' && (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                {adjustModal.type === 'fix' ? t('stock.fixDesc') : t('stock.adjustDesc')}
              </p>
            )}
            <p className="text-sm">
              <span className="text-gray-500">{t('stock.currentQty')}:</span>{' '}
              <strong>{formatQty(adjustModal.item)}</strong>
            </p>
            <Input
              label={adjustModal.type === 'purchase' ? t('stock.purchaseQty') : t('stock.newQuantity')}
              type="number"
              value={adjQuantity}
              onChange={(e) => setAdjQuantity(e.target.value)}
              step="0.01"
            />
            {adjustModal.type === 'purchase' && (
              <>
                <Input
                  label={t('stock.purchasePrice')}
                  type="number"
                  value={adjPrice}
                  onChange={(e) => setAdjPrice(e.target.value)}
                  step="0.01"
                />
                {adjQuantity && adjPrice && (
                  <p className="text-sm font-medium">
                    {t('stock.totalCost')}: {formatCurrency(Number(adjQuantity) * Number(adjPrice))}
                  </p>
                )}
              </>
            )}
            {adjustModal.type !== 'purchase' && (
              <Input
                label={t('stock.reason')}
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
              />
            )}
            <div className="flex gap-2 pt-4 border-t">
              <Button variant="secondary" onClick={() => setAdjustModal(null)} className="flex-1">{t('common.cancel')}</Button>
              <Button onClick={handleAdjustment} loading={saving} className="flex-1">{t('common.confirm')}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
