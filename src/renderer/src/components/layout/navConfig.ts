import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Bike,
  ChefHat,
  ClipboardList,
  Monitor,
  Package,
  Settings,
  Tag,
  Users,
  UtensilsCrossed,
  Wallet
} from 'lucide-react'

export interface NavItem {
  path: string
  icon: LucideIcon
  /** i18n key */
  label: string
}

export interface NavGroup {
  id: string
  /** i18n key */
  label: string
  items: NavItem[]
}

/**
 * Admin navigation. New admin pages: add ONE entry to the right group (keep groups ≤ 5 items).
 * Groups: sales (money in), catalog (what we sell), restaurant (people, screens, system).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'sales',
    label: 'ui.nav.groups.sales',
    items: [
      { path: '/admin/analytics', icon: BarChart3, label: 'nav.analytics' },
      { path: '/admin/orders-history', icon: ClipboardList, label: 'nav.ordersHistory' },
      { path: '/admin/cash', icon: Wallet, label: 'cashAdmin.nav' },
      { path: '/admin/promotions', icon: Tag, label: 'nav.promotions' }
    ]
  },
  {
    id: 'catalog',
    label: 'ui.nav.groups.catalog',
    items: [
      { path: '/admin/menu', icon: UtensilsCrossed, label: 'nav.menu' },
      { path: '/admin/stock', icon: Package, label: 'nav.stock' }
    ]
  },
  {
    id: 'restaurant',
    label: 'ui.nav.groups.restaurant',
    items: [
      { path: '/admin/workers', icon: Users, label: 'nav.workers' },
      { path: '/admin/delivery', icon: Bike, label: 'delivery.nav' },
      { path: '/admin/ambiance', icon: Monitor, label: 'nav.ambianceScreen' },
      { path: '/admin/kds', icon: ChefHat, label: 'kds.title' },
      { path: '/admin/settings', icon: Settings, label: 'nav.settings' }
    ]
  }
]

/** Group + item for a pathname (prefix match so sub-routes keep their parent active). */
export function findNavItem(pathname: string): { group: NavGroup; item: NavItem } | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.path || pathname.startsWith(item.path + '/')) return { group, item }
    }
  }
  return null
}
