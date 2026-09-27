import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Landmark, SlidersHorizontal } from 'lucide-react'
import { Button, Card, Input, SegmentedControl, Skeleton, Toggle, cn, toast } from '../../../components/ui'
import { useAppStore } from '../../../store/appStore'
import { Hint, errorText } from '../cashShared'
import { PaymentMethodsSettings } from './PaymentMethodsSettings'
import { ApprovalsSettings } from './ApprovalsSettings'

type Settings = Record<string, string>

const LEGAL_KEYS = ['legal_name', 'legal_nif', 'legal_nis', 'legal_rc', 'legal_ai', 'restaurant_address', 'invoice_tva_rate'] as const

function useSettings(): [Settings | null, (patch: Settings) => Promise<boolean>] {
  const { t } = useTranslation()
  const [all, setAll] = useState<Settings | null>(null)
  useEffect(() => {
    window.api.settings.getAll().then((s: Settings) => setAll(s ?? {})).catch(() => setAll({}))
  }, [])
  const save = async (patch: Settings): Promise<boolean> => {
    try {
      await window.api.settings.setMultiple(patch)
      setAll((s) => ({ ...(s ?? {}), ...patch }))
      return true
    } catch (e) {
      toast.error(t('cashAdmin.saveFailed'), { description: errorText(e, '') })
      return false
    }
  }
  return [all, save]
}

/** Cash rounding, shift rules, Telegram shift report and the tablet-order default. Saved on change. */
function CashOptions({ all, save }: { all: Settings | null; save: (p: Settings) => Promise<boolean> }) {
  const { t } = useTranslation()
  const symbol = useAppStore((s) => s.currencySymbol)
  const apply = async (key: string, value: string): Promise<void> => {
    if (await save({ [key]: value })) toast.success(t('cashAdmin.saved'), { id: 'cash-settings-saved', duration: 1600 })
  }
  return (
    <Card title={t('cashAdmin.options.title')} icon={<SlidersHorizontal />}>
      {!all ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : (
        <div className="divide-y divide-line">
          <div className="pb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink flex items-center gap-1.5">
              {t('cashAdmin.options.rounding')}<Hint text={t('cashAdmin.options.roundingHint')} />
            </p>
            <SegmentedControl
              value={['5', '10'].includes(all.cash_rounding) ? all.cash_rounding : '0'}
              onChange={(v) => apply('cash_rounding', v)}
              options={[
                { value: '0', label: t('cashAdmin.options.roundingOff') },
                { value: '5', label: <bdi dir="ltr">5 {symbol}</bdi> },
                { value: '10', label: <bdi dir="ltr">10 {symbol}</bdi> }
              ]}
            />
          </div>
          <div className="py-3">
            <Toggle checked={all.require_open_shift === 'true'} onChange={(v) => apply('require_open_shift', v ? 'true' : 'false')}
              label={t('cashAdmin.options.requireShift')} />
          </div>
          <div className="py-3">
            <Toggle checked={all.telegram_shift_report !== 'false'} onChange={(v) => apply('telegram_shift_report', v ? 'true' : 'false')}
              label={t('cashAdmin.options.telegram')} />
          </div>
          <div className="pt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">{t('cashAdmin.options.tablet')}</p>
            <SegmentedControl
              value={all.tablet_order_payment === 'cash' ? 'cash' : 'unpaid'}
              onChange={(v) => apply('tablet_order_payment', v)}
              options={[
                { value: 'unpaid', label: t('cashAdmin.options.tabletUnpaid') },
                { value: 'cash', label: t('cashAdmin.options.tabletCash') }
              ]}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

/** Seller identity printed on invoices (legal name, NIF, NIS, RC, AI, address, VAT rate). */
function LegalSettings({ all, save }: { all: Settings | null; save: (p: Settings) => Promise<boolean> }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<Settings>({})
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (all) setForm(Object.fromEntries(LEGAL_KEYS.map((k) => [k, all[k] ?? ''])))
  }, [all])
  const dirty = Boolean(all && LEGAL_KEYS.some((k) => (all[k] ?? '') !== (form[k] ?? '')))
  const rate = form.invoice_tva_rate ?? ''

  const submit = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault()
    const n = Number(rate)
    if (rate.trim() !== '' && (!Number.isFinite(n) || n < 0 || n > 100)) return void toast.error(t('cashAdmin.legal.rateInvalid'))
    setSaving(true)
    const clean = Object.fromEntries(LEGAL_KEYS.map((k) => [k, (form[k] ?? '').trim()]))
    if (await save(clean)) toast.success(t('cashAdmin.saved'))
    setSaving(false)
  }

  const field = (key: (typeof LEGAL_KEYS)[number], label: string, ltr = false) => (
    <Input label={label} value={form[key] ?? ''} maxLength={key === 'restaurant_address' ? 200 : key === 'legal_name' ? 120 : 30}
      dir={ltr ? 'ltr' : 'auto'} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
  )

  return (
    <Card
      title={t('cashAdmin.legal.title')}
      icon={<Landmark />}
      actions={dirty ? <Button size="sm" loading={saving} onClick={() => submit()}>{t('common.save')}</Button> : undefined}
    >
      {!all ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {field('legal_name', t('cashAdmin.legal.name'))}
          {field('restaurant_address', t('cashAdmin.legal.address'))}
          <div className="grid grid-cols-2 gap-3">
            {field('legal_nif', 'NIF', true)}
            {field('legal_nis', 'NIS', true)}
            {field('legal_rc', 'RC', true)}
            {field('legal_ai', 'AI', true)}
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink-2 mb-1.5">{t('cashAdmin.legal.tva')}<Hint text={t('cashAdmin.legal.tvaHint')} /></p>
            <div className="flex flex-wrap items-center gap-2">
              {['', '9', '19'].map((v) => (
                <button key={v || 'none'} type="button" onClick={() => setForm((f) => ({ ...f, invoice_tva_rate: v }))}
                  className={cn('tap num min-h-11 px-4 rounded-xl border text-sm font-semibold',
                    rate === v ? 'bg-inverse text-on-inverse border-transparent' : 'bg-surface text-ink-2 border-line hover:bg-surface-2')}>
                  {v ? `${v}%` : t('cashAdmin.legal.noTva')}
                </button>
              ))}
              <div className="w-28">
                <Input aria-label={t('cashAdmin.legal.tva')} type="number" min={0} max={100} inputMode="decimal" value={rate}
                  trailing={<span className="pe-2 text-sm font-semibold">%</span>} onChange={(e) => setForm((f) => ({ ...f, invoice_tva_rate: e.target.value }))} />
              </div>
            </div>
          </div>
        </form>
      )}
    </Card>
  )
}

/** Cash settings as self-contained cards (SettingsPage.tsx belongs to another screen). */
export function CashSettingsTab() {
  const [all, save] = useSettings()
  return (
    <div className="grid xl:grid-cols-2 gap-6 items-start">
      <div className="space-y-6">
        <PaymentMethodsSettings />
        <CashOptions all={all} save={save} />
      </div>
      <div className="space-y-6">
        <ApprovalsSettings />
        <LegalSettings all={all} save={save} />
      </div>
    </div>
  )
}
