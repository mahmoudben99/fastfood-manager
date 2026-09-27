import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Store } from 'lucide-react'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { VirtualKeyboard } from '../../../components/VirtualKeyboard'
import { LogoUploader } from '../../../components/LogoUploader'
import { StepLayout } from '../parts/StepLayout'
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

  // Touch mode: fields are read-only and open the on-screen keyboard on tap.
  const touchField = (field: string, type: 'numeric' | 'text') =>
    isTouch ? { readOnly: true, onClick: () => setKeyboardTarget({ field, type }), className: 'cursor-pointer' } : {}

  return (
    <StepLayout icon={<Store />} title={t('setup.restaurant.title')}>
      <div className="grid gap-6 sm:grid-cols-[10rem_1fr]">
        {/* Logo — stored by the main process (contract C1), shown via a data URL, removable */}
        <LogoUploader size="md" />

        <div className="space-y-4">
          <Input
            inputSize="lg"
            label={`${t('setup.restaurant.name')} *`}
            value={data.restaurantName}
            {...touchField('restaurantName', 'text')}
            onChange={isTouch ? undefined : (e) => updateData({ restaurantName: e.target.value })}
            placeholder={t('setup.restaurant.namePlaceholder')}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              inputSize="lg"
              dir="ltr"
              inputMode="tel"
              label={`${t('setup.restaurant.phone')} *`}
              value={data.phone}
              {...touchField('phone', 'numeric')}
              onChange={isTouch ? undefined : (e) => updateData({ phone: e.target.value })}
              placeholder={t('setup.restaurant.phonePlaceholder')}
            />
            <Input
              inputSize="lg"
              dir="ltr"
              inputMode="tel"
              label={t('setup.restaurant.phone2')}
              value={data.phone2}
              {...touchField('phone2', 'numeric')}
              onChange={isTouch ? undefined : (e) => updateData({ phone2: e.target.value })}
              placeholder={t('setup.restaurant.phone2Placeholder')}
            />
          </div>

          <Input
            inputSize="lg"
            label={t('setup.restaurant.address')}
            value={data.address || ''}
            {...touchField('address', 'text')}
            onChange={isTouch ? undefined : (e) => updateData({ address: e.target.value })}
            placeholder={t('setup.restaurant.addressPlaceholder')}
          />

          <div className="grid grid-cols-[1fr_9rem] gap-4 border-t border-line pt-4">
            <Select
              selectSize="lg"
              label={t('setup.restaurant.currency')}
              value={data.currency}
              onChange={(e) => handleCurrencyChange(e.target.value)}
              options={currencies.map((c) => ({ value: c.value, label: c.label }))}
            />
            <Input
              inputSize="lg"
              label={t('setup.restaurant.currencySymbol')}
              value={data.currencySymbol}
              {...touchField('currencySymbol', 'text')}
              onChange={isTouch ? undefined : (e) => updateData({ currencySymbol: e.target.value })}
            />
          </div>
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
    </StepLayout>
  )
}
