import type { MenuQuadrant } from '../../../../../shared/insights'
import type { BadgeVariant } from '../../../components/ui'

export interface QuadrantMeta {
  id: MenuQuadrant
  emoji: string
  badge: BadgeVariant
  /** Soft background of the chart zone / advice card. */
  zone: string
  /** Dot fill (CSS colour). */
  dot: string
  ink: string
}

/** Kasavana–Smith menu engineering quadrants; order = advice panel order. */
export const QUADRANTS: QuadrantMeta[] = [
  { id: 'star', emoji: '⭐', badge: 'success', zone: 'bg-success-soft', dot: 'var(--success)', ink: 'text-success-ink' },
  { id: 'plowhorse', emoji: '🐴', badge: 'info', zone: 'bg-info-soft', dot: 'var(--info)', ink: 'text-info-ink' },
  { id: 'puzzle', emoji: '🧩', badge: 'warning', zone: 'bg-warning-soft', dot: 'var(--warning)', ink: 'text-warning-ink' },
  { id: 'dog', emoji: '🐶', badge: 'danger', zone: 'bg-danger-soft', dot: 'var(--danger)', ink: 'text-danger-ink' }
]

export const QUADRANT_BY_ID = Object.fromEntries(QUADRANTS.map((q) => [q.id, q])) as Record<MenuQuadrant, QuadrantMeta>
