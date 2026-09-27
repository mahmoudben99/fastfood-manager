import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { breadcrumbFor } from './navConfig'
import { DisplayMenu, ThemeSwitch } from './DisplayMenu'

/** Slim admin header: breadcrumb (group › page) + display controls. Blends into the canvas. */
export function TopBar() {
  const { t } = useTranslation()
  const location = useLocation()
  const hit = breadcrumbFor(location.pathname)

  return (
    <header className="h-16 shrink-0 flex items-center justify-between gap-4 px-6 lg:px-8 border-b border-line bg-canvas">
      <nav aria-label={t('ui.shell.breadcrumb')} className="flex items-center gap-2 min-w-0 text-sm">
        {hit ? (
          <>
            <span className="text-muted truncate">{t(hit.group)}</span>
            <ChevronRight className="h-4 w-4 text-faint shrink-0 rtl:-scale-x-100" />
            <span className="font-semibold text-ink truncate">{t(hit.label)}</span>
          </>
        ) : (
          <span className="font-semibold text-ink">{t('nav.admin')}</span>
        )}
      </nav>
      <div className="flex items-center gap-2">
        <ThemeSwitch />
        <DisplayMenu />
      </div>
    </header>
  )
}
