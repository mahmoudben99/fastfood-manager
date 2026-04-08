import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Save, Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff,
  GripVertical, Type, Image, ListOrdered, Hash, QrCode,
  Share2, Minus, Sparkles, LayoutTemplate, X, ArrowLeft
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'

interface BlockConfig {
  fontSize?: 'small' | 'medium' | 'large'
  alignment?: 'left' | 'center' | 'right'
  bold?: boolean
  text?: string
  textAr?: string
  textFr?: string
  decorationType?: string
  qrContent?: string
  customValue?: string
  language?: string
}

interface Block {
  id: string
  type: string
  enabled: boolean
  config: BlockConfig
  sortOrder: number
}

interface Template {
  id?: number
  name: string
  is_active: number
  blocks: string
}

interface SocialMediaItem {
  id?: number
  platform: string
  handle: string
}

const BLOCK_TYPES = [
  { value: 'logo', label: 'Logo', icon: Image },
  { value: 'restaurant_name', label: 'Restaurant Name', icon: Type },
  { value: 'order_details', label: 'Order Details', icon: ListOrdered },
  { value: 'items_table', label: 'Items Table', icon: Hash },
  { value: 'total', label: 'Total', icon: Hash },
  { value: 'qr_code', label: 'QR Code', icon: QrCode },
  { value: 'social_media', label: 'Social Media', icon: Share2 },
  { value: 'custom_text', label: 'Custom Text', icon: Type },
  { value: 'divider', label: 'Divider', icon: Minus },
  { value: 'edge_decoration', label: 'Edge Decoration', icon: Sparkles }
]

// QR code preview component
function QRPreview({ url, size = '80px' }: { url: string; size?: string }) {
  const [qrSrc, setQrSrc] = useState('')
  useEffect(() => {
    if (!url) return
    window.api.receipt.generateQR(url).then((dataUrl: string) => {
      if (dataUrl) setQrSrc(dataUrl)
    }).catch(() => {})
  }, [url])
  if (!qrSrc) return <span style={{ fontSize: '10px', color: '#888' }}>Enter URL above</span>
  return <img src={qrSrc} alt="QR" style={{ width: size, height: size, display: 'inline-block' }} />
}

const PLATFORMS = ['facebook', 'instagram', 'snapchat', 'tiktok', 'twitter', 'youtube', 'whatsapp']

const PLATFORM_ICONS: Record<string, string> = {
  facebook: 'fb', instagram: 'ig', snapchat: 'snap',
  tiktok: 'tt', twitter: 'x', youtube: 'yt', whatsapp: 'wa'
}

let blockIdCounter = 100

function generateId(): string {
  return String(++blockIdCounter)
}

export function ReceiptEditor() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [templateName, setTemplateName] = useState('')
  const [currentTemplateId, setCurrentTemplateId] = useState<number | null>(null)
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null)
  const [presets, setPresets] = useState<{ name: string; blocks: string }[]>([])
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [saveAsModal, setSaveAsModal] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')

  // Social media
  const [socialMedia, setSocialMedia] = useState<SocialMediaItem[]>([])
  const [showSocialModal, setShowSocialModal] = useState(false)
  const [socialDraft, setSocialDraft] = useState<SocialMediaItem[]>([])

  // Settings for preview
  const [restaurantName, setRestaurantName] = useState('My Restaurant')
  const [logoPath, setLogoPath] = useState('')
  const [restaurantPhone, setRestaurantPhone] = useState('')
  const [restaurantAddress, setRestaurantAddress] = useState('')

  const loadData = useCallback(async () => {
    const [tmpl, active, pres, social, settings] = await Promise.all([
      window.api.receipt.getTemplates(),
      window.api.receipt.getActive(),
      window.api.receipt.getPresets(),
      window.api.receipt.getSocialMedia(),
      window.api.settings.getAll()
    ])
    setTemplates(tmpl)
    setPresets(pres)
    setSocialMedia(social)
    setRestaurantName(settings.restaurant_name || 'My Restaurant')
    setLogoPath(settings.logo_path || '')
    setRestaurantPhone(settings.restaurant_phone || '')
    setRestaurantAddress(settings.restaurant_address || '')

    if (active) {
      setCurrentTemplateId(active.id)
      setTemplateName(active.name)
      setBlocks(JSON.parse(active.blocks))
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= blocks.length) return
    const updated = [...blocks]
    ;[updated[index], updated[target]] = [updated[target], updated[index]]
    setBlocks(updated.map((b, i) => ({ ...b, sortOrder: i })))
  }

  const toggleBlock = (id: string) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, enabled: !b.enabled } : b))
  }

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id).map((b, i) => ({ ...b, sortOrder: i })))
    if (expandedBlock === id) setExpandedBlock(null)
  }

  const addBlock = (type: string) => {
    const newBlock: Block = {
      id: generateId(),
      type,
      enabled: true,
      config: {},
      sortOrder: blocks.length
    }
    setBlocks([...blocks, newBlock])
    setShowAddMenu(false)
  }

  const updateBlockConfig = (id: string, key: string, value: any) => {
    setBlocks(blocks.map(b =>
      b.id === id ? { ...b, config: { ...b.config, [key]: value } } : b
    ))
  }

  const loadPreset = (preset: { name: string; blocks: string }) => {
    setBlocks(JSON.parse(preset.blocks))
    setTemplateName(preset.name)
    setCurrentTemplateId(null)
  }

  const handleSave = async () => {
    if (!templateName.trim()) return
    const payload = { name: templateName, blocks: JSON.stringify(blocks), is_active: 1 }
    if (currentTemplateId) {
      await window.api.receipt.updateTemplate(currentTemplateId, payload)
      await window.api.receipt.setActive(currentTemplateId)
    } else {
      const result = await window.api.receipt.saveTemplate(payload)
      setCurrentTemplateId(result.id)
      await window.api.receipt.setActive(result.id)
    }
    await loadData()
  }

  const handleSaveAs = async () => {
    if (!saveAsName.trim()) return
    const payload = { name: saveAsName, blocks: JSON.stringify(blocks), is_active: 1 }
    const result = await window.api.receipt.saveTemplate(payload)
    setCurrentTemplateId(result.id)
    setTemplateName(saveAsName)
    await window.api.receipt.setActive(result.id)
    setSaveAsModal(false)
    setSaveAsName('')
    await loadData()
  }

  const handleDeleteTemplate = async (id: number) => {
    await window.api.receipt.deleteTemplate(id)
    if (currentTemplateId === id) {
      setCurrentTemplateId(null)
      setBlocks([])
      setTemplateName('')
    }
    await loadData()
  }

  const loadTemplate = (tmpl: Template) => {
    setCurrentTemplateId(tmpl.id!)
    setTemplateName(tmpl.name)
    setBlocks(JSON.parse(tmpl.blocks))
  }

  const handleSaveSocial = async () => {
    await window.api.receipt.saveSocialMedia(socialDraft.filter(s => s.handle.trim()))
    const updated = await window.api.receipt.getSocialMedia()
    setSocialMedia(updated)
    setShowSocialModal(false)
  }

  // --- Renderers ---

  const renderBlockConfig = (block: Block) => {
    const { type, id, config } = block
    return (
      <div className="p-3 bg-gray-50 border-t space-y-2">
        {/* Common options — hide for types that don't need them */}
        {!['divider', 'edge_decoration', 'logo'].includes(type) && (
          <div className="flex gap-2 flex-wrap">
            <label className="flex items-center gap-1 text-xs text-gray-600">
              Size:
              <select
                className="border rounded px-1 py-0.5 text-xs"
                value={config.fontSize || 'medium'}
                onChange={e => updateBlockConfig(id, 'fontSize', e.target.value)}
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              Align:
              <select
                className="border rounded px-1 py-0.5 text-xs"
                value={config.alignment || 'left'}
                onChange={e => updateBlockConfig(id, 'alignment', e.target.value)}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            {type !== 'qr_code' && (
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={config.bold || false}
                  onChange={e => updateBlockConfig(id, 'bold', e.target.checked)}
                />
                Bold
              </label>
            )}
          </div>
        )}

        {/* Type-specific options */}
        {type === 'custom_text' && (
          <div className="space-y-1">
            <Input
              placeholder="Text (EN/FR)"
              value={config.text || ''}
              onChange={e => updateBlockConfig(id, 'text', e.target.value)}
            />
            <Input
              placeholder="Text (Arabic)"
              value={config.textAr || ''}
              onChange={e => updateBlockConfig(id, 'textAr', e.target.value)}
              dir="rtl"
            />
            <Input
              placeholder="Text (French)"
              value={config.textFr || ''}
              onChange={e => updateBlockConfig(id, 'textFr', e.target.value)}
            />
          </div>
        )}

        {type === 'divider' && (
          <label className="flex items-center gap-1 text-xs text-gray-600">
            Style:
            <select
              className="border rounded px-1 py-0.5 text-xs"
              value={config.decorationType || 'none'}
              onChange={e => updateBlockConfig(id, 'decorationType', e.target.value)}
            >
              <option value="none">Line</option>
              <option value="dots">Dots</option>
              <option value="stars">Stars</option>
              <option value="food-emoji">Food Emoji</option>
            </select>
          </label>
        )}

        {type === 'edge_decoration' && (
          <label className="flex items-center gap-1 text-xs text-gray-600">
            Style:
            <select
              className="border rounded px-1 py-0.5 text-xs"
              value={config.decorationType || 'food-emoji'}
              onChange={e => updateBlockConfig(id, 'decorationType', e.target.value)}
            >
              <option value="food-emoji">Food Emoji</option>
              <option value="stars">Stars</option>
              <option value="dots">Dots</option>
              <option value="fire">Fire</option>
              <option value="hearts">Hearts</option>
            </select>
          </label>
        )}

        {type === 'qr_code' && (
          <div className="space-y-1">
            <Input
              placeholder="Enter URL for QR code (e.g. https://instagram.com/myrestaurant)"
              value={config.qrUrl || ''}
              onChange={e => updateBlockConfig(id, 'qrUrl', e.target.value)}
            />
          </div>
        )}

        {type === 'social_media' && (
          <div className="text-xs text-gray-500">
            {socialMedia.length === 0
              ? 'No social media configured.'
              : socialMedia.map(s => `${s.platform}: ${s.handle}`).join(', ')}
            <button
              className="ml-2 text-orange-500 underline"
              onClick={() => {
                setSocialDraft(socialMedia.length > 0
                  ? socialMedia.map(s => ({ ...s }))
                  : [{ platform: 'facebook', handle: '' }])
                setShowSocialModal(true)
              }}
            >
              Edit
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderPreview = () => {
    const enabled = blocks.filter(b => b.enabled)
    const fontSize = (s?: string) =>
      s === 'large' ? 'text-base' : s === 'small' ? 'text-[10px]' : 'text-xs'
    const align = (a?: string) =>
      a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'

    return (
      <div className="bg-white border-2 border-dashed border-gray-300 mx-auto p-4 font-mono"
        style={{ width: 302, minHeight: 400 }}>
        {enabled.map(block => {
          const cls = `${fontSize(block.config.fontSize)} ${align(block.config.alignment)} ${block.config.bold ? 'font-bold' : ''}`

          switch (block.type) {
            case 'logo':
              return (
                <div key={block.id} className="text-center py-2">
                  {logoPath ? (
                    <img
                      src={`file:///${logoPath.replace(/\\/g, '/')}`}
                      alt="Logo"
                      className="h-12 mx-auto object-contain"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="h-12 flex items-center justify-center text-gray-400 text-xs border border-dashed rounded">
                      [Logo]
                    </div>
                  )}
                </div>
              )

            case 'restaurant_name': {
              const nameAlign = block.config.alignment || 'center'
              const nameBold = block.config.bold ? 'font-weight:bold;' : ''
              const nameSize = block.config.fontSize === 'large' ? '18px' : block.config.fontSize === 'small' ? '10px' : '12px'
              return (
                <div key={block.id} style={{ textAlign: nameAlign as any, fontSize: nameSize, ...(nameBold ? { fontWeight: 'bold' } : {}) }} className="py-1">
                  {restaurantName}
                  {restaurantAddress && <div style={{ textAlign: 'center', fontSize: '10px', color: '#666' }}>{restaurantAddress}</div>}
                  {restaurantPhone && <div style={{ textAlign: 'center', fontSize: '10px', color: '#666' }}>{restaurantPhone}</div>}
                </div>
              )
            }

            case 'order_details':
              return (
                <div key={block.id} className="py-1" style={{ fontSize: '11px' }}>
                  <div>Order #1 | 10:30 AM</div>
                  {block.config.language === 'bilingual' && <div dir="rtl" style={{ color: '#888' }}>{'طلب #1 | 10:30 ص'}</div>}
                  <div>Table: 3</div>
                  <div>At Table</div>
                </div>
              )

            case 'items_table': {
              const itemSize = block.config.fontSize === 'large' ? '14px' : block.config.fontSize === 'small' ? '10px' : '12px'
              const isBilingual = block.config.language === 'bilingual'
              return (
                <div key={block.id} className="py-1" style={{ fontSize: itemSize }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>2x Burger</span><span>500 DA</span></div>
                  {isBilingual && <div dir="rtl" style={{ fontSize: '10px', color: '#888', padding: '0 0 2px 0' }}>{'2x برغر'}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>1x Fries</span><span>200 DA</span></div>
                  {isBilingual && <div dir="rtl" style={{ fontSize: '10px', color: '#888', padding: '0 0 2px 0' }}>{'1x بطاطس'}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>2x Soda</span><span>300 DA</span></div>
                  {isBilingual && <div dir="rtl" style={{ fontSize: '10px', color: '#888', padding: '0 0 2px 0' }}>{'2x مشروب'}</div>}
                </div>
              )
            }

            case 'total': {
              const totalSize = block.config.fontSize === 'large' ? '18px' : block.config.fontSize === 'small' ? '10px' : '12px'
              return (
                <div key={block.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: totalSize, fontWeight: block.config.bold ? 'bold' : 'normal', borderTop: '1px dashed currentColor', paddingTop: '6px', margin: '8px 0' }}>
                  <span>Total</span>
                  <span>1,000.00 DA</span>
                </div>
              )
            }

            case 'qr_code': {
              const qrUrl = block.config.qrUrl || ''
              const qrAlign = block.config.alignment || 'center'
              const qrSize = block.config.fontSize === 'large' ? '120px' : block.config.fontSize === 'small' ? '60px' : '80px'
              return (
                <div key={block.id} style={{ textAlign: qrAlign as any, margin: '8px 0' }}>
                  {qrUrl ? (
                    <QRPreview url={qrUrl} size={qrSize} />
                  ) : (
                    <span style={{ fontSize: '10px', color: '#888' }}>Enter a URL to generate QR code</span>
                  )}
                </div>
              )
            }

            case 'social_media': {
              const platformEmoji: Record<string, string> = {
                facebook: '\uD83D\uDCD8', instagram: '\uD83D\uDCF8', snapchat: '\uD83D\uDC7B', tiktok: '\uD83C\uDFB5',
                twitter: '\uD83D\uDC26', x: '\uD83D\uDC26', youtube: '\uD83C\uDFAC', whatsapp: '\uD83D\uDCAC',
                threads: '\uD83E\uDDF5', telegram: '\u2708\uFE0F', phone: '\uD83D\uDCDE'
              }
              return (
                <div key={block.id} style={{ textAlign: 'center', fontSize: '10px', margin: '6px 0' }}>
                  {socialMedia.length === 0 ? (
                    <span style={{ color: '#888' }}>[Social Media]</span>
                  ) : socialMedia.map((s, i) => (
                    <div key={i}>{platformEmoji[s.platform] || '\uD83D\uDD17'} {s.handle}</div>
                  ))}
                </div>
              )
            }

            case 'custom_text': {
              const ctAlign = block.config.alignment || 'center'
              const ctSize = block.config.fontSize === 'large' ? '14px' : block.config.fontSize === 'small' ? '10px' : '12px'
              return (
                <div key={block.id} style={{ textAlign: ctAlign as any, fontSize: ctSize, fontWeight: block.config.bold ? 'bold' : 'normal', margin: '6px 0' }}>
                  {block.config.text || '[Custom Text]'}
                  {block.config.textAr && <div dir="rtl" style={{ margin: '4px 0' }}>{block.config.textAr}</div>}
                  {block.config.textFr && <div style={{ margin: '4px 0' }}>{block.config.textFr}</div>}
                </div>
              )
            }

            case 'divider':
              return (
                <div key={block.id} style={{ borderTop: '1px dashed currentColor', margin: '8px 0' }} />
              )

            case 'edge_decoration': {
              const decoMap: Record<string, string> = {
                'food-emoji': '\uD83C\uDF54 \uD83C\uDF39 \uD83C\uDF54 \uD83C\uDF5F \uD83C\uDF55 \uD83C\uDF2E \uD83E\uDD64 \uD83C\uDF57 \uD83C\uDF54 \uD83C\uDF39',
                'stars': '\u2B50 \u2728 \u2B50 \u2728 \u2B50 \u2728 \u2B50 \u2728 \u2B50 \u2728',
                'dots': '\u25CF \u25CB \u25CF \u25CB \u25CF \u25CB \u25CF \u25CB \u25CF \u25CB',
                'fire': '\uD83D\uDD25 \uD83D\uDD25 \uD83D\uDD25 \uD83D\uDD25 \uD83D\uDD25 \uD83D\uDD25 \uD83D\uDD25 \uD83D\uDD25 \uD83D\uDD25 \uD83D\uDD25',
                'hearts': '\u2764\uFE0F \uD83E\uDDE1 \uD83D\uDC9B \uD83D\uDC9A \uD83D\uDC99 \uD83D\uDC9C \u2764\uFE0F \uD83E\uDDE1 \uD83D\uDC9B \uD83D\uDC9A'
              }
              return (
                <div key={block.id} style={{ textAlign: 'center', fontSize: '10px', margin: '6px 0', letterSpacing: '2px' }}>
                  {decoMap[block.config.decorationType || 'food-emoji'] || decoMap['food-emoji']}
                </div>
              )
            }

            default:
              return null
          }
        })}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/settings?tab=printer')}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Back to Settings"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <LayoutTemplate className="h-5 w-5 text-orange-500" />
          <h1 className="text-lg font-semibold">Receipt Editor</h1>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-48"
            placeholder="Template name"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
          />
          <Button onClick={handleSave} disabled={!templateName.trim()}>
            <Save className="h-4 w-4" /> Save
          </Button>
          <Button variant="secondary" onClick={() => { setSaveAsName(''); setSaveAsModal(true) }}>
            Save As
          </Button>
        </div>
      </div>

      {/* Saved templates bar */}
      {templates.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50 overflow-x-auto">
          <span className="text-xs text-gray-500 shrink-0">Templates:</span>
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-1 shrink-0">
              <button
                className={`text-xs px-2 py-1 rounded border ${
                  currentTemplateId === t.id
                    ? 'bg-orange-100 border-orange-300 text-orange-700'
                    : 'bg-white border-gray-200 hover:bg-gray-100'
                }`}
                onClick={() => loadTemplate(t)}
              >
                {t.name} {t.is_active ? '\u2713' : ''}
              </button>
              <button
                className="text-gray-400 hover:text-red-500"
                onClick={() => handleDeleteTemplate(t.id!)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Block editor (60%) */}
        <div className="w-[60%] border-r flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {blocks.map((block, index) => {
              const typeDef = BLOCK_TYPES.find(bt => bt.value === block.type)
              const Icon = typeDef?.icon || Type
              return (
                <div key={block.id} className="border rounded-lg bg-white">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => moveBlock(index, -1)}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30"
                        disabled={index === blocks.length - 1}
                        onClick={() => moveBlock(index, 1)}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <Icon className="h-4 w-4 text-gray-500 shrink-0" />
                    <button
                      className="flex-1 text-left text-sm font-medium truncate"
                      onClick={() => setExpandedBlock(expandedBlock === block.id ? null : block.id)}
                    >
                      {typeDef?.label || block.type}
                    </button>
                    <button
                      className="p-1 hover:bg-gray-100 rounded"
                      onClick={() => toggleBlock(block.id)}
                      title={block.enabled ? 'Disable' : 'Enable'}
                    >
                      {block.enabled ? (
                        <Eye className="h-4 w-4 text-green-500" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-gray-300" />
                      )}
                    </button>
                    <button
                      className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
                      onClick={() => removeBlock(block.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {expandedBlock === block.id && renderBlockConfig(block)}
                </div>
              )
            })}

            {blocks.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <LayoutTemplate className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No blocks yet. Add blocks or load a preset.</p>
              </div>
            )}
          </div>

          {/* Add block + presets */}
          <div className="border-t p-3 space-y-2 bg-gray-50">
            <div className="relative">
              <Button variant="secondary" size="sm" onClick={() => setShowAddMenu(!showAddMenu)}>
                <Plus className="h-4 w-4" /> Add Block
              </Button>
              {showAddMenu && (
                <div className="absolute bottom-full left-0 mb-1 bg-white border rounded-lg shadow-lg py-1 z-10 w-48">
                  {BLOCK_TYPES.map(bt => {
                    const Icon = bt.icon
                    return (
                      <button
                        key={bt.value}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50"
                        onClick={() => addBlock(bt.value)}
                      >
                        <Icon className="h-4 w-4 text-gray-400" />
                        {bt.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-gray-500">Presets:</span>
              {presets.map(p => (
                <button
                  key={p.name}
                  className="text-xs px-2 py-1 rounded border border-gray-200 bg-white hover:bg-orange-50 hover:border-orange-200 transition-colors"
                  onClick={() => loadPreset(p)}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div>
              <button
                className="text-xs text-orange-500 underline"
                onClick={() => {
                  setSocialDraft(socialMedia.length > 0
                    ? socialMedia.map(s => ({ ...s }))
                    : [{ platform: 'facebook', handle: '' }])
                  setShowSocialModal(true)
                }}
              >
                Manage Social Media Accounts
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Live preview (40%) */}
        <div className="w-[40%] overflow-y-auto bg-gray-100 p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3 text-center">Live Preview</h3>
          {renderPreview()}
        </div>
      </div>

      {/* Save As modal */}
      <Modal isOpen={saveAsModal} onClose={() => setSaveAsModal(false)} title="Save As" size="sm">
        <div className="space-y-3 p-4">
          <Input
            placeholder="Template name"
            value={saveAsName}
            onChange={e => setSaveAsName(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSaveAsModal(false)}>Cancel</Button>
            <Button onClick={handleSaveAs} disabled={!saveAsName.trim()}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Social Media modal */}
      <Modal isOpen={showSocialModal} onClose={() => setShowSocialModal(false)} title="Social Media" size="md">
        <div className="p-4 space-y-3">
          {socialDraft.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                className="border rounded px-2 py-1.5 text-sm w-32"
                value={item.platform}
                onChange={e => {
                  const updated = [...socialDraft]
                  updated[idx] = { ...updated[idx], platform: e.target.value }
                  setSocialDraft(updated)
                }}
              >
                {PLATFORMS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
              <Input
                className="flex-1"
                placeholder="@handle or URL"
                value={item.handle}
                onChange={e => {
                  const updated = [...socialDraft]
                  updated[idx] = { ...updated[idx], handle: e.target.value }
                  setSocialDraft(updated)
                }}
              />
              <button
                className="text-gray-400 hover:text-red-500 p-1"
                onClick={() => setSocialDraft(socialDraft.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSocialDraft([...socialDraft, { platform: 'facebook', handle: '' }])}
          >
            <Plus className="h-4 w-4" /> Add Platform
          </Button>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" onClick={() => setShowSocialModal(false)}>Cancel</Button>
            <Button onClick={handleSaveSocial}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
