import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bike, ChefHat, ChevronRight, Landmark, LayoutTemplate, Lightbulb, Wallet } from 'lucide-react'
import { categoryColor, categoryTint } from '../../../theme/categoryColors'

interface Area {
  path: string
  icon: ReactNode
  /** i18n key stem under settings.more.* (title + Desc) */
  key: string
  /** category accent for the icon tile (tokens.css --cat-n) */
  cat: number
}

const AREAS: Area[] = [
  { path: '/admin/cash', icon: <Wallet />, key: 'cash', cat: 3 },
  { path: '/admin/delivery', icon: <Bike />, key: 'delivery', cat: 5 },
  { path: '/admin/insights', icon: <Lightbulb />, key: 'insights', cat: 2 },
  { path: '/admin/kds', icon: <ChefHat />, key: 'kds', cat: 1 },
  { path: '/admin/compliance', icon: <Landmark />, key: 'compliance', cat: 6 },
  { path: '/admin/receipt-editor', icon: <LayoutTemplate />, key: 'receipt', cat: 9 }
]

/** Settings > More settings: entry points to the other admin areas that hold configuration. */
export function MoreSettingsSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {AREAS.map((area) => (
          <button
            key={area.path}
            type="button"
            onClick={() => navigate(area.path)}
            className="tap contain-card group flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 text-start shadow-e1 hover:border-line-strong hover:shadow-e2"
          >
            <span className="flex w-full items-center justify-between">
              <span
                className="h-12 w-12 rounded-2xl flex items-center justify-center [&_svg]:h-6 [&_svg]:w-6"
                style={{ background: categoryTint(area.cat, 16), color: categoryColor(area.cat) }}
              >
                {area.icon}
              </span>
              <ChevronRight className="h-5 w-5 text-faint group-hover:text-ink rtl:-scale-x-100" />
            </span>
            <span>
              <span className="block text-base font-semibold text-ink">{t(`settings.more.${area.key}`)}</span>
              <span className="mt-1 block text-sm text-muted leading-relaxed">{t(`settings.more.${area.key}Desc`)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
