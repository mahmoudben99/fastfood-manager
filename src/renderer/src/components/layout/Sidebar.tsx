import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { Lock, Palette, PanelLeftClose, PanelLeftOpen, ShoppingCart } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useAuthStore } from '../../store/authStore'
import { cn } from '../ui/cn'
import { NAV_GROUPS, findNavItem, type NavItem } from './navConfig'

interface SidebarProps {
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

function RestaurantMark({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const name = useAppStore((s) => s.restaurantName)
  const [logo, setLogo] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    window.api.settings
      .getLogoDataUrl()
      .then((url) => alive && setLogo(url || null))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  const initial = (name || 'F').trim().charAt(0).toUpperCase()
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="h-11 w-11 shrink-0 rounded-2xl overflow-hidden flex items-center justify-center bg-ember text-white text-lg font-black shadow-glow">
        {logo ? <img src={logo} alt="" className="h-full w-full object-cover bg-white" /> : initial}
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-nav-ink truncate leading-tight">{name || t('app.name')}</p>
          <p className="text-xs text-nav-muted truncate">{t('nav.admin')}</p>
        </div>
      )}
    </div>
  )
}

function NavButton({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const Icon = item.icon
  const label = t(item.label)
  return (
    <button
      type="button"
      onClick={() => navigate(item.path)}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'tap group relative w-full flex items-center gap-3 rounded-xl text-[15px] font-medium min-h-12',
        collapsed ? 'justify-center px-0' : 'px-3',
        active ? 'bg-nav-active text-nav-ink' : 'text-nav-muted hover:bg-nav-hover hover:text-nav-ink'
      )}
    >
      {active && (
        <span className="absolute start-0 top-2.5 bottom-2.5 w-[3px] rounded-e-full bg-accent" aria-hidden="true" />
      )}
      <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-accent' : 'text-nav-faint group-hover:text-nav-muted')} />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

export function Sidebar({ collapsed = false, onToggleCollapsed }: SidebarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { lock } = useAuthStore()
  const activePath = findNavItem(location.pathname)?.item.path

  return (
    <aside
      className={cn(
        'relative h-full shrink-0 flex flex-col bg-nav text-nav-ink border-e border-nav-line',
        'bg-[radial-gradient(120%_40%_at_0%_0%,rgb(255_122_26/0.14),transparent_60%),linear-gradient(180deg,var(--nav-bg),var(--nav-bg-2))]',
        'rtl:bg-[radial-gradient(120%_40%_at_100%_0%,rgb(255_122_26/0.14),transparent_60%),linear-gradient(180deg,var(--nav-bg),var(--nav-bg-2))]',
        collapsed ? 'w-[76px]' : 'w-64'
      )}
    >
      <div className={cn('flex items-center gap-2 pt-5 pb-4', collapsed ? 'flex-col px-3' : 'px-4 justify-between')}>
        <RestaurantMark collapsed={collapsed} />
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? t('ui.shell.expand') : t('ui.shell.collapse')}
            title={collapsed ? t('ui.shell.expand') : t('ui.shell.collapse')}
            className="tap h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-nav-faint hover:text-nav-ink hover:bg-nav-hover"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5 rtl:-scale-x-100" />
            ) : (
              <PanelLeftClose className="h-5 w-5 rtl:-scale-x-100" />
            )}
          </button>
        )}
      </div>

      <nav className={cn('flex-1 overflow-y-auto pb-4', collapsed ? 'px-3' : 'px-3')}>
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mt-3 first:mt-1">
            {collapsed ? (
              <div className="mx-3 my-3 h-px bg-nav-line" aria-hidden="true" />
            ) : (
              <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-nav-faint rtl:normal-case rtl:tracking-normal rtl:text-xs">
                {t(group.label)}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavButton key={item.path} item={item} active={activePath === item.path} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
        {import.meta.env.DEV && (
          <div className="mt-3 space-y-1">
            <div className="mx-3 my-3 h-px bg-nav-line" aria-hidden="true" />
            <NavButton
              item={{ path: '/styleguide', icon: Palette, label: 'ui.nav.styleguide' }}
              active={false}
              collapsed={collapsed}
            />
          </div>
        )}
      </nav>

      <div className={cn('border-t border-nav-line p-3 flex gap-2', collapsed ? 'flex-col items-center' : 'items-center')}>
        <button
          type="button"
          onClick={() => {
            lock()
            navigate('/orders')
          }}
          title={t('nav.backToOrders')}
          className={cn(
            'tap flex items-center justify-center gap-2 rounded-xl bg-ember font-semibold text-[15px] shadow-glow hover:brightness-110',
            collapsed ? 'h-12 w-12' : 'flex-1 min-h-12 px-4'
          )}
        >
          <ShoppingCart className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="truncate">{t('nav.backToOrders')}</span>}
        </button>
        <button
          type="button"
          onClick={lock}
          aria-label={t('ui.shell.lock')}
          title={t('ui.shell.lock')}
          className="tap h-12 w-12 shrink-0 rounded-xl flex items-center justify-center text-nav-muted border border-nav-line hover:text-nav-ink hover:bg-nav-hover"
        >
          <Lock className="h-5 w-5" />
        </button>
      </div>
    </aside>
  )
}
