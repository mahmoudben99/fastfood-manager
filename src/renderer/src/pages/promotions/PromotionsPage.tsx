import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, Plus, Tag, Users } from 'lucide-react'
import { LoyaltyDashboard } from './LoyaltyDashboard'
import { useAppStore } from '../../store/appStore'
import { Button, ConfirmDialog, EmptyState, PageHeader, Skeleton, Tabs, toast } from '../../components/ui'
import { DiscountForm } from './parts/DiscountForm'
import { PackForm } from './parts/PackForm'
import { DiscountCard, PackCard } from './parts/PromoCards'
import { errorText, localName, type MenuItemLite, type Pack, type Promo } from './parts/promoTypes'

type Tab = 'promos' | 'packs' | 'loyalty'
/** Form being shown: `key` remounts it with fresh state each time it opens. */
type FormState<T> = { item: T | null; key: number } | null
type PendingDelete = { kind: 'promo' | 'pack'; id: number; name: string } | null

const GRID = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'

export function PromotionsPage() {
  const { t } = useTranslation()
  const foodLanguage = useAppStore((s) => s.foodLanguage)
  const [tab, setTab] = useState<Tab>('promos')
  const [promos, setPromos] = useState<Promo[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [menuItems, setMenuItems] = useState<MenuItemLite[]>([])
  const [loading, setLoading] = useState(true)
  const [promoForm, setPromoForm] = useState<FormState<Promo>>(null)
  const [packForm, setPackForm] = useState<FormState<Pack>>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    void loadData()
  }, [])

  const loadData = async () => {
    try {
      const [p, pk, items] = await Promise.all([
        window.api.promotions.getAll(),
        window.api.packs.getAll(),
        window.api.menu.getAll()
      ])
      setPromos(p)
      setPacks(pk)
      setMenuItems(items)
    } catch (error) {
      toast.error(t('orderHistory.toast.actionFailed', { message: errorText(error) }))
    } finally {
      setLoading(false)
    }
  }

  const toggle = async (kind: 'promo' | 'pack', row: Promo | Pack) => {
    try {
      if (kind === 'promo') await window.api.promotions.toggle(row.id)
      else await window.api.packs.toggle(row.id)
      const name = localName(row, foodLanguage)
      toast.success(row.is_active ? t('promotions.toast.paused', { name }) : t('promotions.toast.activated', { name }))
    } catch (error) {
      toast.error(t('promotions.toast.failed', { message: errorText(error) }))
    }
    void loadData()
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      if (pendingDelete.kind === 'promo') await window.api.promotions.delete(pendingDelete.id)
      else await window.api.packs.delete(pendingDelete.id)
      toast.success(t('promotions.toast.deleted', { name: pendingDelete.name }))
      setPendingDelete(null)
      void loadData()
    } catch (error) {
      setDeleteError(errorText(error))
    } finally {
      setDeleting(false)
    }
  }

  const askDelete = (kind: 'promo' | 'pack', row: Promo | Pack) => {
    setDeleteError('')
    setPendingDelete({ kind, id: row.id, name: localName(row, foodLanguage) })
  }

  const headerAction =
    tab === 'promos' ? (
      <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => setPromoForm({ item: null, key: Date.now() })}>
        {t('promotions.addDiscount')}
      </Button>
    ) : tab === 'packs' ? (
      <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => setPackForm({ item: null, key: Date.now() })}>
        {t('promotions.addPack')}
      </Button>
    ) : null

  const skeletons = (
    <div className={GRID}>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-44 rounded-2xl" />
      ))}
    </div>
  )

  return (
    <div>
      <PageHeader
        title={t('promotions.title', { defaultValue: 'Promotions & Loyalty' })}
        actions={headerAction}
      />

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'promos', label: t('promotions.tabs.discounts'), icon: <Tag />, count: promos.length },
          { id: 'packs', label: t('promotions.tabs.packs'), icon: <Package />, count: packs.length },
          { id: 'loyalty', label: t('promotions.tabLoyalty', { defaultValue: 'Loyalty' }), icon: <Users /> }
        ]}
      />

      {tab === 'promos' &&
        (loading ? skeletons : promos.length === 0 ? (
          <EmptyState
            icon={<Tag />}
            title={t('promotions.noDiscounts')}
            action={
              <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => setPromoForm({ item: null, key: Date.now() })}>
                {t('promotions.addDiscount')}
              </Button>
            }
          />
        ) : (
          <div className={GRID}>
            {promos.map((promo) => (
              <DiscountCard
                key={promo.id}
                promo={promo}
                onToggle={() => void toggle('promo', promo)}
                onEdit={() => setPromoForm({ item: promo, key: Date.now() })}
                onDelete={() => askDelete('promo', promo)}
              />
            ))}
          </div>
        ))}

      {tab === 'packs' &&
        (loading ? skeletons : packs.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title={t('promotions.noPacks')}
            description={t('promotions.noPacksHint')}
            action={
              <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => setPackForm({ item: null, key: Date.now() })}>
                {t('promotions.addPack')}
              </Button>
            }
          />
        ) : (
          <div className={GRID}>
            {packs.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                menuItems={menuItems}
                onToggle={() => void toggle('pack', pack)}
                onEdit={() => setPackForm({ item: pack, key: Date.now() })}
                onDelete={() => askDelete('pack', pack)}
              />
            ))}
          </div>
        ))}

      {tab === 'loyalty' && <LoyaltyDashboard menuItems={menuItems} />}

      {promoForm && (
        <DiscountForm
          key={promoForm.key}
          promo={promoForm.item}
          menuItems={menuItems}
          onClose={() => setPromoForm(null)}
          onSaved={() => { setPromoForm(null); void loadData() }}
        />
      )}
      {packForm && (
        <PackForm
          key={packForm.key}
          pack={packForm.item}
          menuItems={menuItems}
          onClose={() => setPackForm(null)}
          onSaved={() => { setPackForm(null); void loadData() }}
        />
      )}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title={pendingDelete?.kind === 'pack' ? t('promotions.deletePackTitle') : t('promotions.deleteDiscountTitle')}
        message={
          pendingDelete?.kind === 'pack'
            ? t('promotions.deletePackBody', { name: pendingDelete?.name ?? '' })
            : t('promotions.deleteDiscountBody', { name: pendingDelete?.name ?? '' })
        }
        confirmLabel={t('common.delete')}
        busy={deleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
