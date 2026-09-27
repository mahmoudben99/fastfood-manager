import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Money } from '../components/ui'

export function Section({ id, title, children, aside }: { id: string; title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-end justify-between gap-4 mb-4">
        <h2 className="text-xl font-extrabold tracking-tight text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Swatch({ name, token, text }: { name: string; token: string; text?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden">
      <div className="h-16 flex items-end p-2.5" style={{ background: `var(${token})`, color: text ? `var(${text})` : undefined }}>
        {text && <span className="text-sm font-bold">Aa 1 250</span>}
      </div>
      <div className="px-3 py-2">
        <p className="text-sm font-semibold text-ink">{name}</p>
        <p className="text-xs text-muted font-mono">{token}</p>
      </div>
    </div>
  )
}

const SURFACES: [string, string, string?][] = [
  ['canvas', '--canvas', '--ink'],
  ['surface', '--surface', '--ink'],
  ['surface-2', '--surface-2', '--ink-2'],
  ['surface-3', '--surface-3', '--ink-2'],
  ['inverse', '--surface-inverse', '--on-inverse'],
  ['line', '--line'],
  ['line-strong', '--line-strong'],
  ['ink', '--ink'],
  ['ink-2', '--ink-2'],
  ['muted', '--muted'],
  ['faint', '--faint']
]

const BRAND: [string, string, string?][] = [
  ['primary', '--primary', '--on-primary'],
  ['primary-soft', '--primary-soft', '--primary-ink'],
  ['primary-ink', '--primary-ink'],
  ['accent', '--accent'],
  ['success', '--success-soft', '--success-ink'],
  ['warning', '--warning-soft', '--warning-ink'],
  ['danger', '--danger-soft', '--danger-ink'],
  ['info', '--info-soft', '--info-ink']
]

const CATEGORY_NAMES = ['Burgers', 'Pizza', 'Salads', 'Tacos', 'Drinks', 'Desserts', 'Crêpes', 'Sandwiches', 'Coffee', 'Extras']

export function TokenSwatches() {
  const { t } = useTranslation()
  return (
    <div className="space-y-10">
      <Section id="surfaces" title={t('ui.sg.surfaces')}>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-3">
          {SURFACES.map(([name, token, text]) => (
            <Swatch key={name} name={name} token={token} text={text} />
          ))}
        </div>
      </Section>

      <Section id="brand" title={t('ui.sg.brand')}>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-3">
          <div className="col-span-2 rounded-2xl overflow-hidden border border-line">
            <div className="h-16 bg-ember shadow-glow flex items-end p-2.5 text-sm font-bold">Aa 1 250 DA</div>
            <div className="px-3 py-2 bg-surface">
              <p className="text-sm font-semibold text-ink">bg-ember</p>
              <p className="text-xs text-muted font-mono">--primary-from → --primary-to</p>
            </div>
          </div>
          {BRAND.map(([name, token, text]) => (
            <Swatch key={name} name={name} token={token} text={text} />
          ))}
        </div>
      </Section>

      <Section id="categories" title={t('ui.sg.categories')}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {CATEGORY_NAMES.map((name, i) => (
            <div
              key={name}
              className="relative overflow-hidden rounded-2xl border border-line bg-surface p-3 ps-5 flex items-center justify-between gap-2"
              style={{ ['--cat' as string]: `var(--cat-${i + 1})` }}
            >
              <span className="absolute inset-y-0 start-0 w-1.5 bg-[var(--cat)]" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink truncate">{name}</p>
                <p className="text-xs text-muted font-mono">cat-{i + 1}</p>
              </div>
              <span className="h-8 w-8 shrink-0 rounded-xl bg-[color-mix(in_oklab,var(--cat)_16%,var(--surface))] ring-1 ring-[color-mix(in_oklab,var(--cat)_35%,transparent)]" />
            </div>
          ))}
        </div>
      </Section>

      <Section id="type" title={t('ui.sg.type')}>
        <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
          {[
            ['text-display', 'Display 40/800', <span key="d">{t('ui.sg.sampleTitle')}</span>],
            ['text-total', 'Total 32/800', <Money key="m" value={12450} />],
            ['text-kpi', 'KPI 28/700', <Money key="k" value={48750} />],
            ['text-2xl font-extrabold tracking-tight', 'H1 24/800', t('ui.sg.sampleTitle')],
            ['text-xl font-bold', 'H2 20/700', t('ui.sg.orderBlueprint')],
            ['text-lg font-semibold', 'H3 18/600', t('ui.sg.topItems')],
            ['text-base', 'Body 16/400', t('ui.sg.sampleBody')],
            ['text-sm text-ink-2', 'Small 14/400', t('ui.sg.sampleBody')],
            ['text-xs text-muted', 'Caption 12/500', t('ui.sg.tapTargets')]
          ].map(([cls, spec, sample]) => (
            <div key={spec as string} className="flex items-baseline gap-6 px-5 py-3">
              <span className="w-36 shrink-0 text-xs font-mono text-muted">{spec as string}</span>
              <div className={`${cls as string} text-ink min-w-0 truncate`}>{sample as ReactNode}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
