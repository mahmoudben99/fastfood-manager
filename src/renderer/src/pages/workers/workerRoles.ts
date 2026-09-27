import type { LucideIcon } from 'lucide-react'
import { Bike, Brush, ChefHat, CircleUserRound, ConciergeBell, Receipt } from 'lucide-react'

/**
 * Worker roles. Stored values stay v3-compatible: 'cook' = kitchen station (gets the kitchen
 * tickets / KDS lanes of its categories), 'driver' feeds the delivery driver list (DRIVER_ROLE).
 */
export type WorkerRole = 'cook' | 'cashier' | 'server' | 'driver' | 'cleaner' | 'other'

export interface RoleMeta {
  role: WorkerRole
  icon: LucideIcon
  /** Tile / chip colours (tokens only). */
  tone: string
}

export const ROLES: RoleMeta[] = [
  { role: 'cook', icon: ChefHat, tone: 'bg-primary-soft text-primary-ink' },
  { role: 'cashier', icon: Receipt, tone: 'bg-success-soft text-success-ink' },
  { role: 'server', icon: ConciergeBell, tone: 'bg-info-soft text-info-ink' },
  { role: 'driver', icon: Bike, tone: 'bg-warning-soft text-warning-ink' },
  { role: 'cleaner', icon: Brush, tone: 'bg-surface-3 text-ink-2' },
  { role: 'other', icon: CircleUserRound, tone: 'bg-surface-3 text-ink-2' }
]

export function roleMeta(role: string): RoleMeta {
  return ROLES.find((r) => r.role === role) ?? ROLES[ROLES.length - 1]
}

export interface Worker {
  id: number
  name: string
  role: string
  pay_full_day: number
  pay_half_day: number
  phone: string | null
  category_ids?: number[]
}
