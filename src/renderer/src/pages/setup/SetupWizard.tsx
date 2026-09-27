import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { toast } from '../../components/ui/Toast'
import { ipcErrorMessage } from '../../utils/ipcError'
import { BrandMark } from './parts/BrandMark'
import { Stepper } from './parts/Stepper'
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
  // PIN confirmation lives here (not in the step) so it survives Back/Next and gates Next.
  const [passwordConfirm, setPasswordConfirm] = useState('')

  const [data, setData] = useState<SetupData>(() => ({
    // Start from the language already on screen (chosen on the activation page, or the saved one
    // when setup is re-run) so Finish never silently saves a different language than shown.
    language: useAppStore.getState().language || 'en',
    foodLanguage: 'fr',
    restaurantName: '',
    phone: '',
    phone2: '',
    address: '',
    currency: 'DZD',
    currencySymbol: 'DA',
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
  }))

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
        return data.password.length >= 4 && passwordConfirm === data.password
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
      // Store the admin password AND provision the remote owner-dashboard credential (owner_credentials)
      // via the device-token-authed admin endpoint, so a NEW customer's owner dashboard is reachable.
      await window.api.settings.setAdminPassword(data.password)

      // Save all settings
      await window.api.settings.setMultiple({
        language: data.language,
        food_language: data.foodLanguage,
        restaurant_name: data.restaurantName,
        restaurant_phone: data.phone,
        restaurant_phone2: data.phone2,
        restaurant_address: data.address,
        currency: data.currency,
        currency_symbol: data.currencySymbol || 'DA',
        // logo_path is written by settings:uploadLogo in the main process (contract C1). Writing
        // it here wiped an existing logo when setup was re-run after logout.
        input_mode: data.inputMode,
        // admin_password_hash is stored by setAdminPassword above (which also provisions owner_credentials).
        // Commit the completion marker only after schedule/categories finish successfully.
        setup_complete: 'false'
      })

      // Save schedule
      await window.api.settings.setSchedule(data.schedule)

      // Save categories only if Excel wasn't used (Excel already imported them)
      if (!excelImported) {
        // Logout/reactivation can reopen setup while the restaurant's operational data remains.
        // Never append the seven starter categories on top of its existing categories.
        const existingCategories = await window.api.categories.getAll()
        if (existingCategories.length === 0) {
          await window.api.categories.createMany(
            data.categories.map((c) => ({ name: c.name, name_ar: c.name_ar, name_fr: c.name_fr, icon: c.icon }))
          )
        }
      }

      await window.api.settings.set('setup_complete', 'true')

      // Sync restaurant name & version to cloud so admin dashboard shows correct data
      window.api.installation.sync().catch(() => {})

      setSetupComplete(true)
      await loadSettings()
      navigate('/orders')
    } catch (err) {
      console.error('Setup failed:', err)
      // Finish used to fail silently (button just stopped spinning).
      toast.error(t('common.error'), { description: ipcErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const stepComponents = [
    <LanguageSelect key="lang" data={data} updateData={updateData} />,
    <InputModeSelect key="input" data={data} updateData={updateData} />,
    <RestaurantInfo key="rest" data={data} updateData={updateData} />,
    <AdminPassword
      key="pass"
      data={data}
      updateData={updateData}
      confirm={passwordConfirm}
      onConfirmChange={setPasswordConfirm}
    />,
    <WorkSchedule key="sched" data={data} updateData={updateData} />,
    <ExcelSetup key="excel" onImported={() => setExcelImported(true)} />,
    <CategorySetup key="cat" data={data} updateData={updateData} />
  ]

  const isLastStep = currentStep === STEPS.length - 1
  const canGoNext = canProceed()
  const stepKey = STEPS[currentStep]
  const blockedHint =
    stepKey === 'restaurant' || stepKey === 'password' || stepKey === 'categories'
      ? t(`setup.hint.${stepKey}`)
      : ''

  return (
    <div className="h-screen bg-canvas flex flex-col">
      {/* Header (one row): brand · stepper (numbered dots + current label) */}
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-6 py-3">
          <BrandMark className="shrink-0" />
          <div className="min-w-0 flex-1">
            <Stepper
              ariaLabel={`${t('setup.title')} · ${t('setup.step', { current: currentStep + 1, total: STEPS.length })}`}
              current={currentStep}
              onJump={saving ? undefined : setCurrentStep}
              steps={STEPS.map((key) => ({ key, label: t(`setup.steps.${key}`) }))}
            />
          </div>
        </div>
      </header>

      {/* Content: one card per step (scrolls; header + footer stay put at 720px height) */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-6 py-6">{stepComponents[currentStep]}</div>
      </main>

      {/* Navigation: Back (secondary) · why Next is blocked · ONE ember CTA */}
      <footer className="shrink-0 border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-4 px-6 py-3">
          {currentStep > 0 ? (
            <Button
              variant="secondary"
              size="xl"
              onClick={() => setCurrentStep((s) => s - 1)}
              disabled={saving}
              icon={<ArrowLeft className="h-5 w-5 rtl:-scale-x-100" />}
            >
              {t('setup.previous')}
            </Button>
          ) : null}

          <p className="min-w-0 flex-1 text-center text-sm text-muted">{!canGoNext ? blockedHint : ''}</p>

          {isLastStep ? (
            <Button
              size="xl"
              onClick={handleFinish}
              loading={saving}
              disabled={!canGoNext}
              cooldownMs={800}
              icon={<Check className="h-5 w-5" />}
            >
              {t('setup.finish')}
            </Button>
          ) : (
            <Button
              size="xl"
              onClick={() => setCurrentStep((s) => s + 1)}
              disabled={!canGoNext}
              iconEnd={<ArrowRight className="h-5 w-5 rtl:-scale-x-100" />}
            >
              {t('setup.next')}
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}
