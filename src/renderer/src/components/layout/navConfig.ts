import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  Lightbulb,
  Monitor,
  Package,
  Settings,
  ShieldCheck,
  Tag,
  Users,
  UtensilsCrossed
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
      { path: '/admin/dashboard', icon: LayoutDashboard, label: 'dashboard.nav' },
      { path: '/admin/analytics', icon: BarChart3, label: 'nav.analytics' },
      { path: '/admin/insights', icon: Lightbulb, label: 'insights.nav' },
      { path: '/admin/orders-history', icon: ClipboardList, label: 'nav.ordersHistory' },
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
      { path: '/admin/ambiance', icon: Monitor, label: 'nav.ambianceScreen' },
      { path: '/admin/kds', icon: ChefHat, label: 'kds.title' },
      { path: '/admin/settings', icon: Settings, label: 'nav.settings' },
      { path: '/admin/compliance', icon: ShieldCheck, label: 'compliance.nav' }
    ]
  }
]

/** Admin pages reached from Settings (not in the sidebar): breadcrumb only. */
const EXTRA_PAGES: { path: string; group: string; label: string }[] = [
  { path: '/admin/receipt-editor', group: 'nav.settings', label: 'receiptEditor.title' },
  { path: '/admin/backup', group: 'nav.settings', label: 'nav.backup' },
  { path: '/admin/excel', group: 'nav.settings', label: 'nav.excel' }
]

/** Breadcrumb labels (i18n keys) for a pathname: sidebar pages first, then Settings sub-pages. */
export function breadcrumbFor(pathname: string): { group: string; label: string } | null {
  const hit = findNavItem(pathname)
  if (hit) return { group: hit.group.label, label: hit.item.label }
  const extra = EXTRA_PAGES.find((page) => pathname === page.path || pathname.startsWith(page.path + '/'))
  return extra ? { group: extra.group, label: extra.label } : null
}

/** Group + item for a pathname (prefix match so sub-routes keep their parent active). */
export function findNavItem(pathname: string): { group: NavGroup; item: NavItem } | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.path || pathname.startsWith(item.path + '/')) return { group, item }
    }
  }
  return null
}
