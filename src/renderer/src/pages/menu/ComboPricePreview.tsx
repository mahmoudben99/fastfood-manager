import { useTranslation } from 'react-i18next'
import { PieChart, TrendingDown, TriangleAlert } from 'lucide-react'
import { Money, cn } from '../../components/ui'
import { useFoodName } from './catalogShared'
import { allocate, examplePicks, type SlotDraft } from './comboLogic'
import type { MenuRow } from './menuTypes'

interface ComboPricePreviewProps {
  comboPrice: number
  comboId: number | null
  slots: SlotDraft[]
  items: MenuRow[]
}

/**
 * What one default combo costs vs. its parts, and how its price is split between the picks in the
 * reports (same rule as the main process: upcharges stay with their pick, the rest by menu price).
 */
export function ComboPricePreview({ comboPrice, comboId, slots, items }: ComboPricePreviewProps) {
  const { t } = useTranslation()
  const getName = useFoodName()
  const picks = examplePicks(slots, items, comboId)
  const upcharges = picks.reduce((sum, p) => sum + p.upcharge, 0)
  const total = comboPrice + upcharges
  const shares = allocate(total, picks.map((p) => ({ weight: p.item.price, own: p.upcharge })))
  const separate = picks.reduce((sum, p) => sum + p.item.price + p.upcharge, 0)
  const saving = separate - total
  const usesDefaults = picks.some((p) => p.isDefault)

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-e2 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-surface-2/60" title={t('combos.preview.splitHint')}>
        <div className="h-10 w-10 shrink-0 rounded-xl bg-primary-soft text-primary-ink flex items-center justify-center">
          <PieChart className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-ink">{t('combos.preview.title')}</p>
          <p className="text-xs text-muted">{usesDefaults ? t('combos.preview.withDefaults') : t('combos.preview.withFirst')}</p>
        </div>
      </div>

      {picks.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">{t('combos.preview.empty')}</p>
      ) : (
        <div className="px-4 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="text-start font-semibold pb-2">{t('combos.preview.pick')}</th>
                <th className="text-end font-semibold pb-2">{t('combos.preview.alone')}</th>
                <th className="text-end font-semibold pb-2">{t('combos.preview.share')}</th>
              </tr>
            </thead>
            <tbody>
              {picks.map((pick, i) => (
                <tr key={`${pick.item.id}-${i}`} className="border-t border-line">
                  <td className="py-2 pe-2">
                    <p className="font-semibold text-ink truncate max-w-[10rem]">
                      <span className="me-1">{pick.item.emoji ?? ''}</span>
                      {getName(pick.item)}
                    </p>
                    <p className="text-xs text-muted truncate max-w-[10rem]">
                      {getName(pick.slot)}
                      {pick.upcharge > 0 && <> · <bdi dir="ltr" className="num">+{pick.upcharge}</bdi></>}
                    </p>
                  </td>
                  <td className="py-2 text-end text-ink-2"><Money value={pick.item.price + pick.upcharge} decimals={0} /></td>
                  <td className="py-2 text-end font-bold text-ink"><Money value={shares[i] ?? 0} decimals={shares[i] % 1 ? 2 : 0} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-strong">
                <td className="pt-2 font-bold text-ink">{t('combos.preview.total')}</td>
                <td className="pt-2 text-end text-muted line-through decoration-1"><Money value={separate} decimals={0} /></td>
                <td className="pt-2 text-end text-lg font-extrabold text-ink"><Money value={total} decimals={0} /></td>
              </tr>
            </tfoot>
          </table>

          <div
            className={cn(
              'mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2 text-sm font-semibold',
              saving > 0 ? 'bg-success-soft text-success-ink' : 'bg-warning-soft text-warning-ink'
            )}
          >
            {saving > 0 ? <TrendingDown className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />}
            <span>
              {saving > 0 ? (
                <>
                  {t('combos.preview.saves')} <Money value={saving} decimals={0} />
                </>
              ) : (
                t('combos.preview.noSaving')
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
