import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bike, Plus, ShoppingBag, Smartphone, Tags, UtensilsCrossed, X } from 'lucide-react'
import { Badge, Button, Card, EmptyState, IconButton, Input, Money, Skeleton, cn, formatAmount, toast } from '../ui'
import { useAppStore } from '../../store/appStore'
import type { ChannelPrices, SalesChannel } from '../../../../shared/channels'
import { errorCode } from './catalog-ext-helpers'

/**
 * v4 wave-2 CONTRACT: per-channel prices for one menu item (dine-in / takeout / delivery / yassir…).
 * Self-contained: loads and saves through its own IPC. Mounted by the menu item form.
 */
export interface ChannelPricesEditorProps {
  /** null while the item is not saved yet (the editor then explains it must be saved first). */
  menuItemId: number | null
  /** The item's normal price, shown as the default for channels without an override. */
  basePrice: number
}

const ICONS: Record<string, ReactNode> = {
  local: <UtensilsCrossed />,
  takeout: <ShoppingBag />,
  delivery: <Bike />
}

const toInputs = (prices: ChannelPrices): Record<string, string> =>
  Object.fromEntries(Object.entries(prices).map(([channel, price]) => [channel, String(price)]))

export function ChannelPricesEditor({ menuItemId, basePrice }: ChannelPricesEditorProps) {
  const { t } = useTranslation()
  const symbol = useAppStore((s) => s.currencySymbol) || 'DA'
  const [channels, setChannels] = useState<SalesChannel[] | null>(null)
  const [saved, setSaved] = useState<ChannelPrices>({})
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [newPlatform, setNewPlatform] = useState<string | null>(null)

  useEffect(() => {
    if (menuItemId === null) return
    let alive = true
    setChannels(null)
    void Promise.all([window.api.channels.list(), window.api.channels.getItemPrices(menuItemId)])
      .then(([list, prices]) => {
        if (!alive) return
        setChannels(list)
        setSaved(prices)
        setInputs(toInputs(prices))
      })
      .catch(() => alive && setChannels([]))
    return () => { alive = false }
  }, [menuItemId])

  const invalid = useMemo(() => new Set(Object.entries(inputs)
    .filter(([, text]) => text.trim() !== '' && !(Number(text) >= 0 && Number(text) <= 1_000_000_000))
    .map(([channel]) => channel)), [inputs])
  const dirty = useMemo(() => {
    const next = Object.entries(inputs).filter(([, text]) => text.trim() !== '')
    return next.length !== Object.keys(saved).length || next.some(([channel, text]) => Number(text) !== saved[channel])
  }, [inputs, saved])

  const title = t('channels.pricesTitle')
  if (menuItemId === null) {
    return (
      <Card title={title} icon={<Tags />} variant="flat">
        <EmptyState compact icon={<Tags />} title={t('channels.saveItemFirst')} description={t('channels.saveItemFirstHint')} />
      </Card>
    )
  }

  const nameOf = (channel: SalesChannel): string => channel.label || t(`channels.names.${channel.id}`)
  const fail = (error: unknown): void => { toast.error(t(`channels.errors.${errorCode(error, 'CHANNEL')}`, { defaultValue: t('channels.errors.generic') })) }

  const save = async (): Promise<void> => {
    if (invalid.size > 0) return
    setSaving(true)
    try {
      const payload = Object.fromEntries(Object.entries(inputs).map(([channel, text]) => [channel, text.trim() === '' ? null : Number(text)]))
      const next = await window.api.channels.setItemPrices(menuItemId, payload)
      setSaved(next)
      setInputs(toInputs(next))
      toast.success(t('channels.saved'))
    } catch (error) {
      fail(error)
    } finally {
      setSaving(false)
    }
  }

  const platforms = (channels ?? []).filter((channel) => !['local', 'takeout', 'delivery'].includes(channel.id))
  const savePlatforms = async (list: { id?: string; label: string; enabled: boolean }[], added = false): Promise<void> => {
    try {
      setChannels(await window.api.channels.savePlatforms(list))
      if (added) {
        setNewPlatform(null)
        toast.success(t('channels.platformAdded'))
      }
    } catch (error) {
      fail(error)
    }
  }
  const platformList = (): { id: string; label: string; enabled: boolean }[] =>
    platforms.map((platform) => ({ id: platform.id, label: platform.label || 'Yassir', enabled: platform.enabled }))

  const row = (channel: SalesChannel) => {
    const text = inputs[channel.id] ?? ''
    const value = text.trim() === '' ? null : Number(text)
    const diff = value === null || invalid.has(channel.id) ? 0 : value - basePrice
    return (
      <div key={channel.id} className={cn('flex flex-wrap items-center gap-3 py-3', !channel.enabled && 'opacity-60')}>
        <div className="h-10 w-10 shrink-0 rounded-xl bg-surface-2 text-ink-2 flex items-center justify-center [&_svg]:h-5 [&_svg]:w-5">
          {ICONS[channel.id] ?? <Smartphone />}
        </div>
        <div className="min-w-[8rem] flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <bdi>{nameOf(channel)}</bdi>
            {!channel.enabled && <Badge size="sm" variant="neutral">{t('channels.platformOff')}</Badge>}
          </div>
          <div className="text-xs text-muted">
            {value === null || diff === 0
              ? t('channels.samePrice')
              : <span title={t('channels.diffTitle')}>
                  <Badge size="sm" variant={diff > 0 ? 'primary' : 'success'}>
                    <bdi dir="ltr">{`${diff > 0 ? '+' : '−'}${formatAmount(Math.abs(diff), Number.isInteger(diff) ? 0 : 2)} ${symbol}`}</bdi>
                  </Badge>
                </span>}
          </div>
        </div>
        <div className="w-40">
          <Input
            inputMode="decimal"
            aria-label={nameOf(channel)}
            value={text}
            placeholder={formatAmount(basePrice)}
            error={invalid.has(channel.id) ? t('channels.errors.invalid_price') : undefined}
            onChange={(event) => setInputs({ ...inputs, [channel.id]: event.target.value.replace(',', '.') })}
            className="text-end num"
            trailing={<span className="text-xs font-semibold text-muted pe-1">{symbol}</span>}
          />
        </div>
        <IconButton
          icon={<X />}
          label={t('channels.useMenuPrice')}
          size="md"
          className={text === '' ? 'invisible' : undefined}
          onClick={() => setInputs({ ...inputs, [channel.id]: '' })}
        />
      </div>
    )
  }

  return (
    <Card
      title={title}
      icon={<Tags />}
      variant="flat"
      actions={dirty ? <Badge size="sm" variant="warning" dot>{t('channels.unsaved')}</Badge> : undefined}
    >
      {channels === null ? (
        <div className="space-y-3" aria-busy="true" aria-label={t('channels.loading')}>
          {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-12 w-full rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-sm text-muted pb-2 border-b border-line">
            <span>{t('channels.menuPrice')} · {t('channels.pricesSubtitle')}</span>
            <Money value={basePrice} className="font-bold text-ink" />
          </div>
          <div className="divide-y divide-line">{channels.map(row)}</div>

          <div className="mt-4 rounded-xl bg-surface-2 border border-line p-3">
            <div className="text-xs font-semibold uppercase rtl:normal-case tracking-wide text-muted mb-2">{t('channels.platforms')}</div>
            <div className="flex flex-wrap items-center gap-2">
              {platforms.map((platform) => (
                <button
                  key={platform.id}
                  type="button"
                  aria-pressed={platform.enabled}
                  onClick={() => void savePlatforms(platformList().map((p) => p.id === platform.id ? { ...p, enabled: !p.enabled } : p))}
                  className={cn(
                    'tap min-h-10 rounded-full px-4 text-sm font-semibold border',
                    platform.enabled ? 'bg-primary-soft text-primary-ink border-transparent' : 'bg-surface text-muted border-line-strong line-through'
                  )}
                >
                  <bdi>{nameOf(platform)}</bdi>
                </button>
              ))}
              {newPlatform === null ? (
                <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setNewPlatform('')}>{t('channels.addPlatform')}</Button>
              ) : (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (newPlatform.trim()) void savePlatforms([...platformList(), { label: newPlatform.trim(), enabled: true }], true)
                  }}
                >
                  <input
                    autoFocus
                    data-ui="input"
                    value={newPlatform}
                    maxLength={40}
                    placeholder={t('channels.platformName')}
                    onChange={(event) => setNewPlatform(event.target.value)}
                    className="min-h-10 w-48 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink focus:outline-none focus:border-primary"
                  />
                  <Button size="sm" type="submit" variant="soft" disabled={!newPlatform.trim()}>{t('channels.addPlatform')}</Button>
                  <IconButton icon={<X />} label={t('common.close')} size="sm" onClick={() => setNewPlatform(null)} />
                </form>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button variant="soft" loading={saving} disabled={!dirty || invalid.size > 0} onClick={() => void save()} cooldownMs={800}>
              {t('channels.save')}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
