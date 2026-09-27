import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, ShieldCheck, Wallet } from 'lucide-react'
import { Button, Card, Money } from '../../components/ui'
import {
  CustomerLookup, DeliveryPanel, PaymentSheet, ShiftBar, withApproval,
  type DeliveryDraft, type OrderPaymentInput, type RepeatLine
} from '../../components/checkout'
import { Section } from '../Swatches'

const DEMO_TOTAL = 1235
const DEMO_SUBTOTAL = 750
/** Styleguide-only PIN for the approval demo (no database write, no real credential). */
const DEMO_PIN = '2580'

function Json({ value }: { value: unknown }) {
  return (
    <pre dir="ltr" className="mt-3 max-h-40 overflow-auto rounded-xl bg-surface-2 p-3 text-xs text-ink-2 text-start" data-testid="sg-json">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

/**
 * #/styleguide → "Checkout components": the real wave-2 checkout components on the live backend,
 * used for screenshot QA (payment, split, delivery zones, customer lookup, shift close, approval).
 */
export function CheckoutSection() {
  const { t } = useTranslation()
  const [payOpen, setPayOpen] = useState<null | 'plain' | 'later'>(null)
  const [paid, setPaid] = useState<OrderPaymentInput[] | null>(null)
  const [draft, setDraft] = useState<DeliveryDraft | null>(null)
  const [repeat, setRepeat] = useState<RepeatLine[] | null>(null)
  const [approval, setApproval] = useState<string | null>(null)
  const [fullPanel, setFullPanel] = useState(false)

  const demoApproval = async (): Promise<void> => {
    const result = await withApproval(
      async (input) => {
        if (!input) throw new Error('APPROVAL_REQUIRED:discount')
        await new Promise((resolve) => setTimeout(resolve, 250))
        if (input.pin !== DEMO_PIN) throw new Error('APPROVAL_INVALID:discount')
        return `${input.reason}`
      },
      { action: 'discount' }
    )
    setApproval(result === null ? t('checkout.sg.cancelled') : `✓ ${result}`)
  }

  return (
    <Section id="checkout" title={t('checkout.sg.title')}>
      <p className="-mt-2 mb-4 text-sm text-muted">{t('checkout.sg.subtitle')}</p>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t('checkout.sg.payment')} icon={<Wallet />}>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => setPayOpen('plain')} data-testid="sg-pay">
              {t('checkout.sg.openPayment')} · <Money value={DEMO_TOTAL} decimals={0} />
            </Button>
            <Button variant="secondary" size="lg" icon={<Clock className="h-5 w-5" />} onClick={() => setPayOpen('later')} data-testid="sg-pay-later">
              {t('checkout.sg.openPayLater')}
            </Button>
          </div>
          {paid && <Json value={paid} />}
        </Card>
        <Card title={t('checkout.sg.shift')} icon={<Clock />}>
          <div className="flex flex-wrap items-center gap-2">
            <ShiftBar compact />
            <Button variant="ghost" onClick={() => setFullPanel((v) => !v)} data-testid="sg-shift-full">
              {t('checkout.sg.shiftPanel')}
            </Button>
          </div>
        </Card>
        <Card title={t('checkout.sg.approval')} icon={<ShieldCheck />}>
          <Button variant="secondary" size="lg" onClick={demoApproval} data-testid="sg-approval">
            {t('checkout.approval.actions.discount')}
          </Button>
          <p className="mt-2 text-xs text-muted">{t('checkout.sg.demoPin')} <bdi className="num font-bold">{DEMO_PIN}</bdi></p>
          {approval && <p className="mt-2 text-sm font-semibold text-ink" data-testid="sg-approval-result">{approval}</p>}
        </Card>
      </div>

      {fullPanel && (
        <div className="mt-6">
          <ShiftBar initialTab="close" />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={t('checkout.sg.delivery')} data-testid="sg-delivery-card">
          <div data-testid="sg-delivery">
            <DeliveryPanel value={draft} onChange={setDraft} subtotal={DEMO_SUBTOTAL} onRepeatOrder={setRepeat} />
          </div>
          <p className="mt-4 text-xs font-semibold text-muted">{t('checkout.sg.draft')}</p>
          <Json value={draft} />
        </Card>
        <Card title={t('checkout.sg.customer')} data-testid="sg-customer-card">
          <div data-testid="sg-customer">
            <CustomerLookup onSelect={() => undefined} onRepeatOrder={setRepeat} />
          </div>
          {repeat && <Json value={repeat} />}
        </Card>
      </div>

      <PaymentSheet
        open={payOpen !== null}
        total={DEMO_TOTAL}
        allowPayLater={payOpen === 'later'}
        onCancel={() => setPayOpen(null)}
        onConfirm={(payments) => {
          setPaid(payments)
          setPayOpen(null)
        }}
      />
    </Section>
  )
}
