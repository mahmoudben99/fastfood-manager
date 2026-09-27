import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Eye, EyeOff, Layers, LayoutTemplate, Plus, Share2, Trash2, Type } from 'lucide-react'
import { Badge, Button, EmptyState, IconButton, cn } from '../../../components/ui'
import type { SocialMediaEntry } from '../../../../../shared/settings-rules'
import { BLOCK_TYPES, ReceiptBlockConfig, type Block, type BlockConfig, type BlockTextField } from '../ReceiptBlockConfig'

interface BlockListProps {
  blocks: Block[]
  expandedBlock: string | null
  presets: { name: string; blocks: string }[]
  presetLabel: (name: string) => string
  socialMedia: SocialMediaEntry[]
  logoDataUrl: string | null
  isTouch: boolean
  onExpand: (id: string | null) => void
  onMove: (index: number, direction: -1 | 1) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onAdd: (type: string) => void
  onConfig: (id: string, key: keyof BlockConfig, value: unknown) => void
  onLoadPreset: (preset: { name: string; blocks: string }) => void
  onEditSocial: () => void
  onRequestKeyboard: (blockId: string, field: BlockTextField) => void
}

/** Left panel of the Receipt Editor: ordered blocks, add menu, presets, social accounts. */
export function BlockList(props: BlockListProps) {
  const { t } = useTranslation()
  const { blocks, expandedBlock, isTouch } = props
  const btnSize = isTouch ? 'md' : 'sm'

  return (
    <section className="flex min-h-[420px] flex-col rounded-2xl border border-line bg-surface shadow-e1">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-9 w-9 shrink-0 rounded-xl bg-primary-soft text-primary-ink flex items-center justify-center">
            <Layers className="h-[18px] w-[18px]" />
          </span>
          <h3 className="min-w-0 truncate text-base font-semibold text-ink">{t('receiptEditor.v4.blocks')}</h3>
        </div>
        <AddBlockMenu isTouch={isTouch} onAdd={props.onAdd} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {blocks.length === 0 ? (
          <EmptyState compact icon={<LayoutTemplate />} title={t('receiptEditor.noBlocks')} />
        ) : (
          <ol className="space-y-2">
            {blocks.map((block, index) => {
              const typeDef = BLOCK_TYPES.find((bt) => bt.value === block.type)
              const Icon = typeDef?.icon || Type
              const expanded = expandedBlock === block.id
              return (
                <li
                  key={block.id}
                  className={cn('rounded-xl border bg-surface', expanded ? 'border-line-strong shadow-e2' : 'border-line')}
                >
                  <div className={cn('flex items-center gap-1.5 px-2', isTouch ? 'min-h-16' : 'min-h-14')}>
                    <IconButton icon={<ChevronUp />} label={t('receiptEditor.moveUp')} size={btnSize} disabled={index === 0} onClick={() => props.onMove(index, -1)} />
                    <IconButton icon={<ChevronDown />} label={t('receiptEditor.moveDown')} size={btnSize} disabled={index === blocks.length - 1} onClick={() => props.onMove(index, 1)} />
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => props.onExpand(expanded ? null : block.id)}
                      className="tap flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-start hover:bg-surface-2"
                    >
                      <span
                        className={cn(
                          'h-9 w-9 shrink-0 rounded-lg flex items-center justify-center',
                          block.enabled ? 'bg-surface-2 text-ink-2' : 'bg-surface-2 text-faint'
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className={cn('min-w-0 flex-1 truncate text-sm font-semibold', block.enabled ? 'text-ink' : 'text-muted line-through')}>
                        {typeDef ? t(`receiptEditor.blocks.${block.type}`) : block.type}
                      </span>
                      {!block.enabled && <Badge variant="neutral">{t('receiptEditor.v4.hidden')}</Badge>}
                      <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform', expanded && 'rotate-180')} />
                    </button>
                    <IconButton
                      icon={block.enabled ? <Eye className="text-success-ink" /> : <EyeOff />}
                      label={block.enabled ? t('receiptEditor.disable') : t('receiptEditor.enable')}
                      size={btnSize}
                      onClick={() => props.onToggle(block.id)}
                    />
                    <IconButton icon={<Trash2 />} label={t('receiptEditor.removeBlock')} variant="danger" size={btnSize} onClick={() => props.onRemove(block.id)} />
                  </div>
                  {expanded && (
                    <ReceiptBlockConfig
                      block={block}
                      onChange={(key, value) => props.onConfig(block.id, key, value)}
                      socialMedia={props.socialMedia}
                      logoDataUrl={props.logoDataUrl}
                      onEditSocial={props.onEditSocial}
                      isTouch={isTouch}
                      onRequestKeyboard={(field) => props.onRequestKeyboard(block.id, field)}
                    />
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-line bg-surface-2/60 px-4 py-3">
        <span className="me-1 text-xs font-bold uppercase tracking-wider text-muted rtl:normal-case rtl:tracking-normal">
          {t('receiptEditor.presets').replace(/[:：]\s*$/, '')}
        </span>
        {props.presets.map((p) => (
          <Button key={p.name} variant="secondary" size={isTouch ? 'lg' : 'sm'} onClick={() => props.onLoadPreset(p)}>
            {props.presetLabel(p.name)}
          </Button>
        ))}
        <Button variant="ghost" size={isTouch ? 'lg' : 'sm'} icon={<Share2 className="h-4 w-4" />} onClick={props.onEditSocial} className="ms-auto">
          {t('receiptEditor.manageSocial')}
        </Button>
      </footer>
    </section>
  )
}

/** "Add block" button + popover grid of block types (closes on outside tap / Escape). */
function AddBlockMenu({ isTouch, onAdd }: { isTouch: boolean; onAdd: (type: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <Button variant="soft" size={isTouch ? 'lg' : 'md'} icon={<Plus className="h-4 w-4" />} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t('receiptEditor.addBlock')}
      </Button>
      {open && (
        <div className="absolute end-0 top-full z-20 mt-2 grid w-80 grid-cols-2 gap-1 rounded-2xl border border-line bg-surface p-2 shadow-e3 animate-pop-in">
          {BLOCK_TYPES.map((bt) => {
            const Icon = bt.icon
            return (
              <button
                key={bt.value}
                type="button"
                className={cn('tap flex items-center gap-2.5 rounded-xl px-3 text-start text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink', isTouch ? 'min-h-12' : 'min-h-11')}
                onClick={() => {
                  onAdd(bt.value)
                  setOpen(false)
                }}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted" />
                <span className="truncate">{t(`receiptEditor.blocks.${bt.value}`)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
