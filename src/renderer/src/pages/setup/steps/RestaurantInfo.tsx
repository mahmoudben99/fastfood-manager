import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { VirtualKeyboard } from '../../../components/VirtualKeyboard'
import { LogoUploader } from '../../../components/LogoUploader'
import type { SetupData } from '../SetupWizard'

interface Props {
  data: SetupData
  updateData: (partial: Partial<SetupData>) => void
}

const currencies = [
  { value: 'DZD', label: 'DZD - Algerian Dinar (DA)', symbol: 'DA' },
  { value: 'USD', label: 'USD - US Dollar ($)', symbol: '$' },
  { value: 'EUR', label: 'EUR - Euro (EUR)', symbol: 'EUR' },
  { value: 'GBP', label: 'GBP - British Pound (£)', symbol: '£' },
  { value: 'MAD', label: 'MAD - Moroccan Dirham (DH)', symbol: 'DH' },
  { value: 'TND', label: 'TND - Tunisian Dinar (DT)', symbol: 'DT' },
  { value: 'SAR', label: 'SAR - Saudi Riyal (SR)', symbol: 'SR' },
  { value: 'AED', label: 'AED - UAE Dirham (AED)', symbol: 'AED' },
  { value: 'TRY', label: 'TRY - Turkish Lira (TL)', symbol: 'TL' }
]

export function RestaurantInfo({ data, updateData }: Props) {
  const { t } = useTranslation()
  const isTouch = data.inputMode === 'touchscreen'
  const [keyboardTarget, setKeyboardTarget] = useState<{ field: string; type: 'numeric' | 'text' } | null>(null)

  const getKeyboardValue = (): string => {
    if (!keyboardTarget) return ''
    switch (keyboardTarget.field) {
      case 'restaurantName': return data.restaurantName
      case 'phone': return data.phone
      case 'phone2': return data.phone2
      case 'address': return data.address || ''
      case 'currencySymbol': return data.currencySymbol
      default: return ''
    }
  }

  const handleKeyboardChange = (val: string) => {
    if (!keyboardTarget) return
    switch (keyboardTarget.field) {
      case 'restaurantName': updateData({ restaurantName: val }); break
      case 'phone': updateData({ phone: val }); break
      case 'phone2': updateData({ phone2: val }); break
      case 'address': updateData({ address: val }); break
      case 'currencySymbol': updateData({ currencySymbol: val }); break
    }
  }

  const handleCurrencyChange = (value: string) => {
    const curr = currencies.find((c) => c.value === value)
    updateData({
      currency: value,
      currencySymbol: curr?.symbol || value
    })
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">{t('setup.restaurant.title')}</h2>
      </div>

      <div className="bg-white rounded-xl p-6 space-y-5 shadow-sm">
        {/* Logo — stored by the main process (contract C1), shown via a data URL, removable */}
        <LogoUploader size="md" />

        <Input
          label={t('setup.restaurant.name')}
          value={data.restaurantName}
          readOnly={isTouch}
          onClick={isTouch ? () => setKeyboardTarget({ field: 'restaurantName', type: 'text' }) : undefined}
          onChange={isTouch ? undefined : (e) => updateData({ restaurantName: e.target.value })}
          placeholder={t('setup.restaurant.namePlaceholder')}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t('setup.restaurant.phone')}
            value={data.phone}
            readOnly={isTouch}
            onClick={isTouch ? () => setKeyboardTarget({ field: 'phone', type: 'numeric' }) : undefined}
            onChange={isTouch ? undefined : (e) => updateData({ phone: e.target.value })}
            placeholder={t('setup.restaurant.phonePlaceholder')}
          />
          <Input
            label={t('setup.restaurant.phone2')}
            value={data.phone2}
            readOnly={isTouch}
            onClick={isTouch ? () => setKeyboardTarget({ field: 'phone2', type: 'numeric' }) : undefined}
            onChange={isTouch ? undefined : (e) => updateData({ phone2: e.target.value })}
            placeholder={t('setup.restaurant.phone2Placeholder')}
          />
        </div>

        <Input
          label={t('setup.restaurant.address')}
          value={data.address || ''}
          readOnly={isTouch}
          onClick={isTouch ? () => setKeyboardTarget({ field: 'address', type: 'text' }) : undefined}
          onChange={isTouch ? undefined : (e) => updateData({ address: e.target.value })}
          placeholder={t('setup.restaurant.addressPlaceholder')}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label={t('setup.restaurant.currency')}
            value={data.currency}
            onChange={(e) => handleCurrencyChange(e.target.value)}
            options={currencies.map((c) => ({ value: c.value, label: c.label }))}
          />
          <Input
            label={t('setup.restaurant.currencySymbol')}
            value={data.currencySymbol}
            readOnly={isTouch}
            onClick={isTouch ? () => setKeyboardTarget({ field: 'currencySymbol', type: 'text' }) : undefined}
            onChange={isTouch ? undefined : (e) => updateData({ currencySymbol: e.target.value })}
          />
        </div>
      </div>

      {/* Virtual Keyboard for touchscreen mode */}
      {isTouch && keyboardTarget && (
        <VirtualKeyboard
          visible
          type={keyboardTarget.type}
          value={getKeyboardValue()}
          onChange={handleKeyboardChange}
          onClose={() => setKeyboardTarget(null)}
        />
      )}
    </div>
  )
}
