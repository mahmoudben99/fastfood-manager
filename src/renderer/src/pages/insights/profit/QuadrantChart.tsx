import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ArrowUp } from 'lucide-react'
import type { MenuProfitItem, MenuProfitReport } from '../../../../../shared/insights'
import { cn } from '../../../components/ui'
import { useLocalName } from '../shared/format'
import { QUADRANT_BY_ID } from './quadrants'

interface QuadrantChartProps {
  report: MenuProfitReport
  selectedId: number | null
  onSelect: (menuItemId: number) => void
}

const PAD = 6 // % inset so dots on the edges stay inside

/**
 * Piecewise scale: the split value sits in the middle, each half stretches to its own extreme,
 * so the four quadrants are the same size whatever the data (classic menu-engineering chart).
 */
function split(value: number, min: number, mid: number, max: number): number {
  if (value <= mid) return mid > min ? 0.5 * ((value - min) / (mid - min)) : 0.5
  return max > mid ? 0.5 + 0.5 * ((value - mid) / (max - mid)) : 0.5
}

const LABEL_H = 20
const CHAR_W = 6.4

/**
 * Greedy label placement: biggest sellers first, each label tries the right then the left of its
 * dot and is dropped (still shown on hover / when selected) if it would overlap a placed one.
 */
function placeLabels(points: { id: number; x: number; y: number; text: string; weight: number }[], width: number, height: number): Map<number, 'right' | 'left'> {
  const placed: { l: number; r: number; t: number; b: number }[] = []
  const out = new Map<number, 'right' | 'left'>()
  const overlaps = (box: { l: number; r: number; t: number; b: number }) =>
    box.l < 0 || box.r > width || placed.some((p) => box.l < p.r + 4 && box.r + 4 > p.l && box.t < p.b && box.b > p.t)
  // Corner zone names and the dots are obstacles too.
  for (const [l, t] of [[0, 0], [width - 150, 0], [0, height - 34], [width - 150, height - 34]]) placed.push({ l, r: l + 150, t, b: t + 34 })
  for (const p of points) {
    const cx = (p.x / 100) * width
    const cy = height - (p.y / 100) * height
    placed.push({ l: cx - 8, r: cx + 8, t: cy - 8, b: cy + 8 })
  }
  for (const p of [...points].sort((a, b) => b.weight - a.weight)) {
    const cx = (p.x / 100) * width
    const cy = height - (p.y / 100) * height
    const w = Math.min(144, p.text.length * CHAR_W + 14)
    const right = { l: cx + 13, r: cx + 13 + w, t: cy - LABEL_H / 2, b: cy + LABEL_H / 2 }
    const left = { l: cx - 13 - w, r: cx - 13, t: cy - LABEL_H / 2, b: cy + LABEL_H / 2 }
    for (const [side, box] of [['right', right], ['left', left]] as const) {
      if (!overlaps(box)) {
        placed.push(box)
        out.set(p.id, side)
        break
      }
    }
  }
  return out
}

const ZONES = [
  { id: 'puzzle', pos: 'start-0 top-0', label: 'top-3 start-3' },
  { id: 'star', pos: 'end-0 top-0', label: 'top-3 end-3 text-end' },
  { id: 'dog', pos: 'start-0 bottom-0', label: 'bottom-3 start-3' },
  { id: 'plowhorse', pos: 'end-0 bottom-0', label: 'bottom-3 end-3 text-end' }
] as const

/** Popularity (sold) → right, profit per sale (margin DA) → up. Always drawn left-to-right. */
export function QuadrantChart({ report, selectedId, onSelect }: QuadrantChartProps) {
  const { t } = useTranslation()
  const nameOf = useLocalName()
  const points = useMemo(() => {
    const items = report.items.filter((i): i is MenuProfitItem & { marginDa: number } => i.quadrant !== null && i.marginDa !== null)
    if (items.length === 0) return []
    const maxQty = Math.max(...items.map((i) => i.qtySold), report.popularityThreshold)
    const margins = items.map((i) => i.marginDa)
    const minM = Math.min(...margins, report.averageMarginDa)
    const maxM = Math.max(...margins, report.averageMarginDa)
    return items.map((item) => ({
      item,
      x: PAD + (100 - 2 * PAD) * split(item.qtySold, 0, report.popularityThreshold, maxQty),
      y: PAD + (100 - 2 * PAD) * split(item.marginDa, minM, report.averageMarginDa, maxM)
    }))
  }, [report])
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 640, height: 384 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const sides = useMemo(
    () => placeLabels(points.map(({ item, x, y }) => ({ id: item.menuItemId, x, y, text: nameOf(item), weight: item.revenue })), size.width, size.height),
    [points, size, nameOf]
  )

  return (
    <div dir="ltr" className="relative">
      <div ref={box} className="relative h-96 rounded-xl overflow-hidden border border-line">
        {ZONES.map((zone) => {
          const meta = QUADRANT_BY_ID[zone.id]
          return (
            <div key={zone.id} className={cn('absolute h-1/2 w-1/2 opacity-70', meta.zone, zone.pos)}>
              <span className={cn('absolute text-xs font-bold uppercase tracking-wide rtl:normal-case', meta.ink, zone.label)}>
                {meta.emoji} {t(`insights.profit.quadrant.${zone.id}.name`)}
              </span>
            </div>
          )
        })}
        <div className="absolute inset-y-0 left-1/2 border-s border-dashed border-line-strong" />
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line-strong" />
        {points.map(({ item, x, y }) => {
          const meta = QUADRANT_BY_ID[item.quadrant!]
          const selected = item.menuItemId === selectedId
          const side = sides.get(item.menuItemId) ?? (selected ? (x > 70 ? 'left' : 'right') : null)
          return (
            <button
              key={item.menuItemId}
              type="button"
              onClick={() => onSelect(item.menuItemId)}
              title={`${nameOf(item)} — ${t('insights.profit.dotTitle', { sold: item.qtySold, margin: Math.round(item.marginDa) })}`}
              className="group absolute -translate-x-1/2 translate-y-1/2 flex items-center gap-1.5"
              style={{ left: `${x}%`, bottom: `${y}%` }}
            >
              <span
                className={cn(
                  'block rounded-full border-2 border-surface shadow-e1',
                  selected ? 'h-5 w-5 ring-4 ring-ink/15' : 'h-3.5 w-3.5 group-hover:h-4 group-hover:w-4'
                )}
                style={{ background: meta.dot }}
              />
              {side && (
                <span
                  className={cn(
                    'absolute whitespace-nowrap max-w-[9rem] truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                    side === 'left' ? 'right-full me-1' : 'left-full ms-1',
                    selected ? 'bg-inverse text-on-inverse' : 'bg-surface/85 text-ink-2'
                  )}
                >
                  <bdi>{nameOf(item)}</bdi>
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] font-medium text-muted">
        <span className="inline-flex items-center gap-1"><ArrowUp className="h-3.5 w-3.5" /><bdi>{t('insights.profit.axisMargin')}</bdi></span>
        <span className="inline-flex items-center gap-1"><bdi>{t('insights.profit.axisPopular')}</bdi><ArrowRight className="h-3.5 w-3.5" /></span>
      </div>
    </div>
  )
}
