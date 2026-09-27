import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bell, ChefHat, ClipboardList, Pencil, Plus, Printer, Search, ShoppingBag, Trash2, Truck, Utensils, Wallet
} from 'lucide-react'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, Modal, SegmentedControl, Select,
  Skeleton, SkeletonText, Tabs, Textarea, Toggle, toast
} from '../components/ui'
import { Section } from './Swatches'

const VARIANTS = ['primary', 'secondary', 'soft', 'outline', 'ghost', 'success', 'danger'] as const
const SIZES = ['sm', 'md', 'lg', 'xl', 'touch'] as const

export function ComponentsDemo() {
  const { t } = useTranslation()
  const [orderType, setOrderType] = useState<'dine' | 'take' | 'delivery'>('dine')
  const [tab, setTab] = useState<'today' | 'week' | 'month'>('today')
  const [pill, setPill] = useState('all')
  const [on, setOn] = useState(true)
  const [off, setOff] = useState(false)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState(false)

  return (
    <div className="space-y-10">
      <Section id="buttons" title={t('ui.sg.buttons')} aside={<p className="text-xs text-muted">{t('ui.sg.tapTargets')}</p>}>
        <Card>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              {VARIANTS.map((v) => (
                <Button key={v} variant={v} size="lg">
                  {v}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {SIZES.map((s) => (
                <Button key={s} size={s} icon={<Plus />}>
                  {s}
                </Button>
              ))}
              <Button size="lg" loading>
                {t('common.save')}
              </Button>
              <Button size="lg" variant="secondary" disabled>
                {t('common.cancel')}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <IconButton icon={<Pencil />} label={t('common.edit')} variant="secondary" size="lg" />
              <IconButton icon={<Trash2 />} label={t('common.delete')} variant="danger" size="lg" />
              <IconButton icon={<Printer />} label={t('orders.printReceipt')} variant="soft" size="lg" />
              <IconButton icon={<Bell />} label={t('ui.sg.orders')} variant="ghost" size="lg" badge={3} />
              <IconButton icon={<Plus />} label={t('common.add')} variant="primary" size="xl" />
              <Button variant="primary" size="touch" icon={<Wallet />} cooldownMs={800} className="ms-auto min-w-64">
                {t('ui.sg.pay')}
              </Button>
            </div>
          </div>
        </Card>
      </Section>

      <Section id="inputs" title={t('ui.sg.inputs')}>
        <Card>
          <div className="grid md:grid-cols-2 gap-5">
            <Input label={t('ui.sg.fieldName')} defaultValue="Cheeseburger" helperText={t('ui.sg.helper')} />
            <Input label={t('ui.sg.fieldPrice')} placeholder="0.00" error={t('ui.sg.errorRequired')} />
            <Input leading={<Search />} placeholder={t('ui.sg.search')} inputSize="lg" />
            <Select
              label={t('ui.sg.fieldCategory')}
              defaultValue="b"
              options={[
                { value: 'b', label: 'Burgers' },
                { value: 'p', label: 'Pizza' },
                { value: 'd', label: 'Drinks' }
              ]}
            />
            <Textarea label={t('ui.sg.fieldNotes')} defaultValue={t('ui.sg.allergens')} className="md:col-span-2" />
            <div className="md:col-span-2 grid sm:grid-cols-2 gap-x-8 rounded-xl bg-surface-2 border border-line px-4 py-1">
              <Toggle checked={on} onChange={setOn} label={t('ui.display.perfMode')} description={t('ui.sg.perfNote')} />
              <Toggle checked={off} onChange={setOff} label={t('ui.sg.delivery')} description={t('ui.sg.helper')} />
            </div>
          </div>
        </Card>
      </Section>

      <Section id="choice" title={t('ui.sg.choice')}>
        <Card>
          <div className="space-y-5">
            <SegmentedControl
              size="lg"
              value={orderType}
              onChange={setOrderType}
              options={[
                { value: 'dine', label: t('ui.sg.dineIn'), icon: <Utensils /> },
                { value: 'take', label: t('ui.sg.takeaway'), icon: <ShoppingBag /> },
                { value: 'delivery', label: t('ui.sg.delivery'), icon: <Truck /> }
              ]}
            />
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'today', label: t('ui.sg.today'), count: 42 },
                { id: 'week', label: t('ui.sg.week') },
                { id: 'month', label: t('ui.sg.month') }
              ]}
            />
            <Tabs
              variant="pills"
              value={pill}
              onChange={setPill}
              tabs={[
                { id: 'all', label: t('common.all'), count: 18 },
                { id: 'new', label: t('ui.sg.new'), icon: <Bell /> },
                { id: 'kitchen', label: t('ui.sg.pending'), icon: <ChefHat /> },
                { id: 'ready', label: t('ui.sg.ready') }
              ]}
            />
          </div>
        </Card>
      </Section>

      <Section id="feedback" title={t('ui.sg.feedback')}>
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title={t('ui.sg.showToast')} icon={<Bell />}>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => toast.success(t('ui.sg.toastSaved'))}>
                success
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  toast.info(t('ui.sg.toastRemoved'), {
                    description: 'Cheeseburger ×2',
                    action: { label: t('ui.undo'), onClick: () => toast.success(t('ui.sg.toastSaved')) }
                  })
                }
              >
                undo
              </Button>
              <Button variant="secondary" onClick={() => toast.error(t('ui.sg.toastError'))}>
                error
              </Button>
              <Button variant="secondary" onClick={() => toast.warning(t('ui.sg.toastInfo'))}>
                warning
              </Button>
              <Button variant="soft" onClick={() => setModal(true)}>
                {t('ui.sg.openModal')}
              </Button>
              <Button variant="outline" onClick={() => setConfirm(true)}>
                {t('ui.sg.openConfirm')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-5">
              <Badge variant="success" dot>{t('ui.sg.paid')}</Badge>
              <Badge variant="warning" dot>{t('ui.sg.pending')}</Badge>
              <Badge variant="danger" dot>{t('ui.sg.late')}</Badge>
              <Badge variant="info">{t('ui.sg.new')}</Badge>
              <Badge variant="primary">−10%</Badge>
              <Badge variant="neutral">{t('ui.sg.takeaway')}</Badge>
              <Badge variant="solid" size="md">{t('ui.sg.ready')}</Badge>
            </div>
          </Card>
          <Card variant="flat" padding={false}>
            <EmptyState
              icon={<ClipboardList />}
              title={t('ui.sg.emptyTitle')}
              description={t('ui.sg.emptyBody')}
              action={<Button icon={<Plus />}>{t('ui.sg.newOrder')}</Button>}
            />
          </Card>
          <Card title={t('common.loading')}>
            <div className="flex gap-4">
              <Skeleton className="h-16 w-16 rounded-2xl" />
              <SkeletonText lines={3} className="flex-1" />
            </div>
          </Card>
        </div>
      </Section>

      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        title={t('ui.sg.modalTitle')}
        description={t('ui.sg.modalDesc')}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="lg" onClick={() => setModal(false)}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label={t('ui.sg.fieldName')} defaultValue="Double Burger" />
          <Input label={t('ui.sg.fieldPrice')} defaultValue="500.00" inputMode="decimal" />
        </div>
      </Modal>
      <ConfirmDialog
        isOpen={confirm}
        title={t('ui.sg.confirmTitle')}
        message={t('ui.sg.confirmBody')}
        confirmLabel={t('ui.sg.voidOrder')}
        onConfirm={() => setConfirm(false)}
        onCancel={() => setConfirm(false)}
      />
    </div>
  )
}
