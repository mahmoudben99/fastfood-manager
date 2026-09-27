import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, ChevronDown, Info, Link2, ListOrdered, ShieldCheck, Undo2 } from 'lucide-react'
import { Button, Card, cn } from '../../components/ui'

/** What the software guarantees: four one-liners; the full explanation + limits behind "More". */
export function GuaranteesCard() {
  const { t } = useTranslation()
  const [more, setMore] = useState(false)
  const items: [string, ReactNode][] = [
    ['numbering', <ListOrdered key="n" />],
    ['journal', <Link2 key="j" />],
    ['noDelete', <Undo2 key="d" />],
    ['retention', <CalendarClock key="r" />]
  ]
  return (
    <Card
      title={t('compliance.guarantees.title')}
      icon={<ShieldCheck />}
      actions={
        <Button size="sm" variant="ghost" aria-expanded={more} iconEnd={<ChevronDown className={cn('transition-transform', more && 'rotate-180')} />}
          onClick={() => setMore(!more)}>
          {t(more ? 'compliance.guarantees.less' : 'compliance.guarantees.more')}
        </Button>
      }
    >
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map(([key, icon]) => (
          <li key={key} className="flex gap-3" title={more ? undefined : t(`compliance.guarantees.${key}`)}>
            <div className="h-8 w-8 shrink-0 rounded-lg bg-primary-soft text-primary-ink flex items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
              {icon}
            </div>
            <div className="min-w-0 self-center">
              <div className="text-sm font-medium text-ink">{t(`compliance.guarantees.${key}Short`)}</div>
              {more && <p className="text-sm text-muted mt-1">{t(`compliance.guarantees.${key}`)}</p>}
            </div>
          </li>
        ))}
      </ul>
      {more && (
        <div className="mt-4 flex gap-3 rounded-xl bg-surface-2 border border-line p-3">
          <Info className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          <div>
            <div className="text-sm font-semibold text-ink">{t('compliance.guarantees.limitsTitle')}</div>
            <p className="text-sm text-ink-2 mt-0.5">{t('compliance.guarantees.limits')}</p>
          </div>
        </div>
      )}
    </Card>
  )
}
