import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { LanguageSelect } from './steps/LanguageSelect'
import { RestaurantInfo } from './steps/RestaurantInfo'
import { AdminPassword } from './steps/AdminPassword'
import { WorkSchedule } from './steps/WorkSchedule'
import { CategorySetup } from './steps/CategorySetup'
import { ExcelSetup } from './steps/ExcelSetup'
import { InputModeSelect } from './steps/InputModeSelect'

export interface SetupData {
  language: string
  foodLanguage: string
  restaurantName: string
  phone: string
  phone2: string
  address: string
  currency: string
  currencySymbol: string
  logoPath: string
  password: string
  schedule: {
    day_of_week: number
    status: string
    open_time: string | null
    close_time: string | null
    half_end: string | null
  }[]
  inputMode: 'keyboard' | 'touchscreen'
  categories: { name: string; name_ar?: string; name_fr?: string; icon?: string }[]
}

const STEPS = ['language', 'inputMode', 'restaurant', 'password', 'schedule', 'excel', 'categories'] as const

export function SetupWizard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setSetupComplete, loadSettings } = useAppStore()
  const [currentStep, setCurrentStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [excelImported, setExcelImported] = useState(false)

  const [data, setData] = useState<SetupData>({
    language: 'en',
    foodLanguage: 'fr',
    restaurantName: '',
    phone: '',
    phone2: '',
    address: '',
    currency: 'DZD',
    currencySymbol: 'DA',
    logoPath: '',
    inputMode: 'keyboard',
    password: '',
    schedule: Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i,
      status: i === 5 ? 'closed' : 'full',
      open_time: '08:00',
      close_time: '23:00',
      half_end: null
    })),
    categories: [
      { name: 'Tacos', name_ar: 'تاكوس', name_fr: 'Tacos', icon: '🌮' },
      { name: 'Burger', name_ar: 'برغر', name_fr: 'Burger', icon: '🍔' },
      { name: 'Sandwich', name_ar: 'ساندويتش', name_fr: 'Sandwich', icon: '🥪' },
      { name: 'Pizza', name_ar: 'بيتزا', name_fr: 'Pizza', icon: '🍕' },
      { name: 'Plat', name_ar: 'طبق', name_fr: 'Plat', icon: '🍽️' },
      { name: 'Box', name_ar: 'بوكس', name_fr: 'Box', icon: '📦' },
      { name: 'Drinks', name_ar: 'مشروبات', name_fr: 'Boissons', icon: '🥤' }
    ]
  })

  // When entering categories step after Excel import, load actual categories from DB
  useEffect(() => {
    if (STEPS[currentStep] === 'categories' && excelImported) {
      window.api.categories.getAll().then((cats: any[]) => {
        if (cats.length > 0) {
          setData((prev) => ({
            ...prev,
            categories: cats.map((c: any) => ({
              name: c.name,
              name_ar: c.name_ar || undefined,
              name_fr: c.name_fr || undefined,
              icon: c.icon || '🍽️'
            }))
          }))
        }
      })
    }
  }, [currentStep, excelImported])

  const updateData = (partial: Partial<SetupData>) => {
    setData((prev) => ({ ...prev, ...partial }))
  }

  const canProceed = (): boolean => {
    switch (STEPS[currentStep]) {
      case 'language':
        return true
      case 'inputMode':
        return true
      case 'restaurant':
        return data.restaurantName.trim() !== '' && data.phone.trim() !== ''
      case 'password':
        return data.password.length >= 4
      case 'schedule':
        return true
      case 'excel':
        return true
      case 'categories':
        return excelImported || data.categories.length > 0
      default:
        return true
    }
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      // Hash password
      const hash = await window.api.settings.hashPassword(data.password)

      // Save all settings
      await window.api.settings.setMultiple({
        language: data.language,
        food_language: data.foodLanguage,
        restaurant_name: data.restaurantName,
        restaurant_phone: data.phone,
        restaurant_phone2: data.phone2,
        restaurant_address: data.address,
        currency: data.currency,
        currency_symbol: data.currencySymbol,
        logo_path: data.logoPath,
        input_mode: data.inputMode,
        admin_password_hash: hash,
        setup_complete: 'true'
      })

      // Save schedule
      await window.api.settings.setSchedule(data.schedule)

      // Save categories only if Excel wasn't used (Excel already imported them)
      if (!excelImported) {
        await window.api.categories.createMany(
          data.categories.map((c) => ({ name: c.name, name_ar: c.name_ar, name_fr: c.name_fr, icon: c.icon }))
        )
      }

      // Sync restaurant name & version to cloud so admin dashboard shows correct data
      window.api.installation.sync().catch(() => {})

      setSetupComplete(true)
      await loadSettings()
      navigate('/orders')
    } catch (err) {
      console.error('Setup failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const stepComponents = [
    <LanguageSelect key="lang" data={data} updateData={updateData} />,
    <InputModeSelect key="input" data={data} updateData={updateData} />,
    <RestaurantInfo key="rest" data={data} updateData={updateData} />,
    <AdminPassword key="pass" data={data} updateData={updateData} />,
    <WorkSchedule key="sched" data={data} updateData={updateData} />,
    <ExcelSetup key="excel" onImported={() => setExcelImported(true)} />,
    <CategorySetup key="cat" data={data} updateData={updateData} />
  ]

  const isLastStep = currentStep === STEPS.length - 1

  return (
    <div className="h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex flex-col">
      {/* Header */}
      <div className="text-center pt-8 pb-4">
        <h1 className="text-3xl font-bold text-gray-900">{t('setup.title')}</h1>
        <p className="text-gray-500 mt-2">
          {t('setup.step', { current: currentStep + 1, total: STEPS.length })}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex justify-center gap-2 mb-6">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-2 w-12 rounded-full transition-colors ${
              i <= currentStep ? 'bg-orange-500' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="max-w-2xl mx-auto">{stepComponents[currentStep]}</div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center max-w-2xl mx-auto w-full px-4 py-6">
        <Button
          variant="secondary"
          onClick={() => setCurrentStep((s) => s - 1)}
          disabled={currentStep === 0}
        >
          {t('setup.previous')}
        </Button>

        {isLastStep ? (
          <Button onClick={handleFinish} loading={saving} disabled={!canProceed()}>
            {t('setup.finish')}
          </Button>
        ) : (
          <Button onClick={() => setCurrentStep((s) => s + 1)} disabled={!canProceed()}>
            {t('setup.next')}
          </Button>
        )}
      </div>
    </div>
  )
}
