import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { ArchiveRestore, Ban, CookingPot, PackageOpen, PackageX, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react'
import { Badge, Button, IconButton, Money, Toggle, cn } from '../../components/ui'
import { categoryColor, categoryTint } from '../../theme/categoryColors'
import { useFoodName } from './catalogShared'
import type { CategoryRow, ItemFacts, MenuRow } from './menuTypes'

interface MenuItemCardProps {
  item: MenuRow
  category: CategoryRow | undefined
  facts: ItemFacts | undefined
  deleted: boolean
  onOpen: (item: MenuRow) => void
  onDelete: (item: MenuRow) => void
  onRestore: (item: MenuRow) => void
  onSoldOut: (item: MenuRow, soldOut: boolean) => void
}

/** Admin menu tile: same colour language as the order screen, plus status badges and quick actions. */
export const MenuItemCard = memo(function MenuItemCard({ item, category, facts, deleted, onOpen, onDelete, onRestore, onSoldOut }: MenuItemCardProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const manual = item.is_sold_out === 1
  const auto = item.sold_out === 1 && !manual
  const combo = item.is_combo === 1

  return (
    <div className="contain-card relative flex flex-col rounded-2xl border border-line bg-surface shadow-e1 overflow-hidden">
      <span className="absolute top-0 inset-x-0 h-1 z-[1]" style={{ background: categoryColor(item.category_id) }} />
      <button
        type="button"
        onClick={() => (deleted ? onRestore(item) : onOpen(item))}
        className="tap text-start flex-1 flex flex-col hover:bg-surface-2/40"
        aria-label={deleted ? `${t('menu.restore')} ${getName(item)}` : `${t('common.edit')} ${getName(item)}`}
      >
        <div
          className={cn('relative h-24 w-full flex items-center justify-center text-5xl', (manual || deleted) && 'opacity-55')}
          style={{ background: `linear-gradient(135deg, ${categoryTint(item.category_id, 24)}, ${categoryTint(item.category_id, 8)})` }}
        >
          {item.image_path ? (
            <img src={`app-image://${item.image_path}`} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <span aria-hidden="true">{item.emoji || category?.icon || '🍽️'}</span>
          )}
          <div className="absolute top-2.5 start-2.5 end-2.5 flex flex-wrap gap-1.5">
            {combo && <Badge variant="solid" icon={<PackageOpen />}>{t('menu.badges.combo')}</Badge>}
            {manual && <Badge variant="danger" className="bg-danger-strong text-white" icon={<Ban />}>{t('menu.badges.soldOut')}</Badge>}
            {auto && <Badge variant="warning" icon={<PackageX />}>{t('menu.badges.outOfStock')}</Badge>}
          </div>
        </div>
        <div className="p-3 pt-2.5 flex-1 flex flex-col">
          <p className="text-[15px] font-semibold text-ink leading-snug line-clamp-2 min-h-[2.6em]">{getName(item)}</p>
          <p className="mt-1 text-lg font-extrabold text-ink">
            <Money value={item.price} decimals={item.price % 1 ? 2 : 0} />
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 min-h-6">
            {deleted && item.category_active === 0 && <Badge variant="warning">{t('menu.categoryDeleted')}</Badge>}
            {facts && facts.groups > 0 && (
              <Badge variant="primary" icon={<SlidersHorizontal />}>{t('menu.badges.options', { count: facts.groups })}</Badge>
            )}
            {facts && !facts.hasRecipe && !combo && <Badge variant="neutral" icon={<CookingPot />}>{t('menu.badges.noRecipe')}</Badge>}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-1 border-t border-line ps-3 pe-1.5 py-1">
        {deleted ? (
          <Button variant="soft" size="lg" fullWidth className="my-1 me-1.5" icon={<ArchiveRestore className="h-5 w-5" />} onClick={() => onRestore(item)}>
            {t('menu.restore')}
          </Button>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <Toggle
                size="md"
                checked={!manual}
                onChange={(available) => onSoldOut(item, !available)}
                label={<span className={cn('block truncate text-[13px]', manual ? 'text-danger-ink' : 'text-ink-2')}>{manual ? t('menu.badges.soldOut') : t('menu.card.available')}</span>}
              />
            </div>
            <IconButton icon={<Pencil />} label={t('common.edit')} onClick={() => onOpen(item)} />
            <IconButton icon={<Trash2 />} variant="danger" label={t('common.delete')} onClick={() => onDelete(item)} />
          </>
        )}
      </div>
    </div>
  )
})
