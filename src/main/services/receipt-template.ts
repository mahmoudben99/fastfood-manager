import {
  currencySymbol, esc, fontSizes, logoImgHTML, orderTypeLabel, printableWidth, receiptLabels,
  receiptLang, reprintBannerHTML, type ReceiptLabels
} from './print-format'
import { receiptRows, receiptSubLinesHTML } from './print-catalog'
import { receiptDeliveryHTML, receiptFeeRowsHTML, receiptPaymentsHTML } from './print-cash'
import { fiscalNumberHTML } from './fiscal/print-fiscal' // v4 fiscal

/** Everything about the destination printer / run that is not part of the order or settings. */
export interface ReceiptContext {
  logoDataUrl: string | null
  paperWidth: string | null
  receiptFontSize: string | null
  reprint?: boolean
}

interface TemplateBlock {
  type: string
  enabled?: boolean
  config?: Record<string, any>
}

/** Blocks arrive as a JSON string (receipt_templates row) or an array (unsaved editor state). */
export function parseTemplateBlocks(blocks: unknown): TemplateBlock[] {
  const parsed = typeof blocks === 'string' ? JSON.parse(blocks || '[]') : blocks
  return Array.isArray(parsed) ? parsed.filter((block) => block && typeof block === 'object') : []
}

const DIVIDER_DECORATIONS: Record<string, string> = {
  dots: '· · · · · · · · · · · · · · · · · · · ·',
  stars: '★ ☆ ★ ☆ ★ ☆ ★ ☆ ★ ☆ ★ ☆ ★',
  'food-emoji': '🍔 🍟 🍕 🌮 🥤 🍗 🍔 🍟 🍕 🌮'
}

const EDGE_DECORATIONS: Record<string, string> = {
  'food-emoji': '🍔 🍟 🍕 🌮 🥤 🍗 🍔 🍟 🍕 🌮',
  'stars': '⭐ ✨ ⭐ ✨ ⭐ ✨ ⭐ ✨ ⭐ ✨',
  'dots': '● ○ ● ○ ● ○ ● ○ ● ○',
  'fire': '🔥 🔥 🔥 🔥 🔥 🔥 🔥 🔥 🔥 🔥',
  'hearts': '❤️ 🧡 💛 💚 💙 💜 ❤️ 🧡 💛 💚'
}

const SOCIAL_EMOJI: Record<string, string> = {
  facebook: '📘', instagram: '📸', snapchat: '👻', tiktok: '🎵',
  twitter: '🐦', x: '🐦', youtube: '🎬', whatsapp: '💬',
  threads: '🧵', telegram: '✈️', phone: '📞'
}

function dividerHTML(cfg: Record<string, any>): string {
  const style = ['solid', 'dashed', 'dotted', 'double'].includes(cfg.style) ? cfg.style : null
  if (style) {
    return `<hr style="border:none;border-top:${style === 'double' ? '3px' : '1px'} ${style} #000;margin:8px 0;">`
  }
  const deco = DIVIDER_DECORATIONS[cfg.decorationType]
  if (deco) {
    return `<div style="text-align:center;font-size:10px;margin:6px 0;white-space:nowrap;overflow:hidden;">${deco}</div>`
  }
  return '<hr style="border:none;border-top:1px dashed #000;margin:8px 0;">'
}

/**
 * Builds a receipt from a Receipt Editor template. Used for real printing AND the editor
 * preview (printer:previewTemplate), so the preview is exactly what prints.
 * Returns null when the template has no blocks (caller prints the default receipt).
 */
export async function buildFromTemplate(
  template: { blocks: unknown },
  order: any,
  settings: Record<string, string>,
  ctx: ReceiptContext
): Promise<string | null> {
  try {
    const blocks = parseTemplateBlocks(template.blocks)
    if (blocks.length === 0) return null

    const width = printableWidth(ctx.paperWidth || settings.printer_width)
    const lang = receiptLang(settings)
    const isRTL = lang === 'ar'
    const L = receiptLabels(settings)
    const secondary: ReceiptLabels = receiptLabels({ language: isRTL ? 'fr' : 'ar' })
    const currency = currencySymbol(settings)
    const items = order.items || []
    // The printer's "Receipt Font" setting is the base size; block sizes are relative to it
    // (at the default "medium" base they are exactly the historical 10/12/18 px).
    const base = fontSizes(ctx.receiptFontSize || settings.receipt_font_size, 'medium').body
    const money = (value: unknown) => `${Number(value || 0).toLocaleString()} ${esc(currency)}`

    let body = ctx.reprint ? reprintBannerHTML(L.reprint, base + 4) : ''
    for (const block of blocks) {
      if (!block.enabled) continue
      const cfg = block.config || {}
      const size = cfg.fontSize === 'large' ? base + 6 : cfg.fontSize === 'small' ? base - 2 : base
      const align = ['left', 'center', 'right'].includes(cfg.alignment) ? cfg.alignment : 'center'
      const bold = cfg.bold ? 'font-weight:bold;' : ''
      // Rows (item / total) keep "name … price" spacing unless explicitly centred or right-aligned.
      const justify = cfg.alignment === 'center'
        ? 'center;gap:8px'
        : cfg.alignment === 'right'
          ? `${isRTL ? 'flex-start' : 'flex-end'};gap:8px`
          : 'space-between'

      switch (block.type) {
        case 'logo':
          // No logo → print nothing (a restaurant_name block, if any, carries the name).
          body += logoImgHTML(ctx.logoDataUrl)
          break
        case 'restaurant_name':
          body += `<div style="text-align:${align};font-size:${size}px;${bold}">${esc(settings.restaurant_name || 'Restaurant')}</div>`
          if (settings.restaurant_address) body += `<div style="text-align:center;font-size:${base - 2}px;color:#666;">${esc(settings.restaurant_address)}</div>`
          if (settings.restaurant_phone) body += `<div style="text-align:center;font-size:${base - 2}px;color:#666;">${esc(settings.restaurant_phone)}</div>`
          break
        case 'order_details': {
          const time = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          const line = (text: string, extra = '') => `<div style="${extra}">${text}</div>`
          body += `<div style="text-align:${align};font-size:${size - 1}px;${bold}margin:8px 0;">`
          body += line(`${esc(L.order)} #${esc(order.daily_number)} | ${esc(time)}`)
          if (cfg.language === 'bilingual') {
            body += line(`${esc(secondary.order)} #${esc(order.daily_number)} | ${esc(time)}`, `font-size:${base - 2}px;color:#888;margin:2px 0;direction:${isRTL ? 'ltr' : 'rtl'};`)
          }
          body += fiscalNumberHTML(order, settings, `font-size:${base - 1}px;`) // v4 fiscal
          if (order.table_number) body += line(`${esc(L.table)}: ${esc(order.table_number)}`)
          if (order.order_type) body += line(esc(orderTypeLabel(order.order_type, L)))
          // Customer name + phone: delivery receipts need the phone for the driver.
          if (order.customer_name) body += line(`${esc(L.customer)}: ${esc(order.customer_name)}`)
          if (order.customer_phone) body += line(`${esc(L.phone)}: ${esc(order.customer_phone)}`, 'font-weight:bold;')
          body += receiptDeliveryHTML(order, settings)
          body += '</div>'
          break
        }
        case 'items_table':
          body += '<div style="margin:8px 0;">'
          // v4 catalog: combo children print under their combo; options (with prices) under their line.
          for (const item of receiptRows(items) as any[]) {
            body += `<div style="display:flex;justify-content:${justify};font-size:${size}px;${bold}padding:2px 0;"><span>${esc(item.quantity)}x ${esc(item.menu_item_name)}</span><span>${money(item.total_price)}</span></div>`
            body += receiptSubLinesHTML(item, items, lang, { fontSize: base - 2, money: (value) => `${value.toLocaleString()} ${currency}`, color: '#444' })
            if (cfg.language === 'bilingual' && item.menu_item_name_ar) {
              body += `<div style="font-size:${base - 3}px;color:#888;direction:rtl;padding:0 0 2px 0;">${esc(item.quantity)}x ${esc(item.menu_item_name_ar)}</div>`
            }
            if (item.notes) body += `<div style="font-size:${base - 3}px;color:#888;padding-inline-start:16px;">* ${esc(item.notes)}</div>`
          }
          body += '</div>'
          break
        case 'total':
          body += `<div style="display:flex;justify-content:${justify};font-size:${size}px;${bold}margin:8px 0;border-top:1px dashed #000;padding-top:6px;"><span>${esc(L.total)}</span><span>${money(order.total)}</span></div>`
          if (Number(order.discount_amount) > 0) {
            body += `<div style="text-align:${align};font-size:${base - 2}px;color:#666;">${esc(order.discount_details || L.discount)}: -${money(order.discount_amount)}</div>`
          }
          body += `<div style="font-size:${base - 1}px;">${receiptFeeRowsHTML(order, settings, true, 0)}${receiptPaymentsHTML(order, settings)}</div>`
          break
        case 'divider':
          body += dividerHTML(cfg)
          break
        case 'custom_text':
          body += `<div style="text-align:${align};font-size:${size}px;${bold}margin:6px 0;">${esc(cfg.text || '')}</div>`
          if (cfg.textAr) body += `<div style="text-align:${align};font-size:${size}px;${bold}margin:4px 0;direction:rtl;">${esc(cfg.textAr)}</div>`
          if (cfg.textFr) body += `<div style="text-align:${align};font-size:${size}px;${bold}margin:4px 0;">${esc(cfg.textFr)}</div>`
          break
        case 'social_media': {
          let social: { platform?: string; handle?: string }[] = []
          try {
            const parsed = JSON.parse(settings.social_media || '[]')
            if (Array.isArray(parsed)) social = parsed
          } catch (error) {
            console.warn('[Printer] settings.social_media is not valid JSON; social block skipped:', error)
          }
          if (social.length > 0) {
            body += `<div style="text-align:${align};font-size:${base - 2}px;margin:6px 0;">`
            for (const s of social) body += `<div>${SOCIAL_EMOJI[s.platform || ''] || '🔗'} ${esc(s.handle)}</div>`
            body += '</div>'
          }
          break
        }
        case 'qr_code': {
          // 'Modern' / 'Full Featured' presets ship `qrContent: 'phone'` with no qrUrl: encode
          // the restaurant phone as a dialable tel: link.
          const qrUrl = cfg.qrUrl ||
            (cfg.qrContent === 'phone' && settings.restaurant_phone ? `tel:${settings.restaurant_phone}` : '')
          const qrPx = cfg.fontSize === 'large' ? 120 : cfg.fontSize === 'small' ? 60 : 80
          if (qrUrl) {
            try {
              const QRCode = (await import('qrcode')).default
              const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: qrPx * 2, margin: 1 })
              body += `<div style="text-align:${align};margin:8px 0;"><img src="${qrDataUrl}" style="width:${qrPx}px;height:${qrPx}px;display:inline-block;" /></div>`
            } catch (error) {
              console.warn('[Printer] QR code generation failed; printing the link as text:', error)
              body += `<div style="text-align:${align};margin:8px 0;font-size:${base - 2}px;">[QR: ${esc(qrUrl)}]</div>`
            }
          }
          break
        }
        case 'edge_decoration': {
          const deco = EDGE_DECORATIONS[cfg.decorationType || 'food-emoji'] || EDGE_DECORATIONS['food-emoji']
          body += `<div style="text-align:center;font-size:${base - 2}px;margin:6px 0;letter-spacing:2px;">${deco}</div>`
          break
        }
      }
    }

    return `<!DOCTYPE html><html dir="${isRTL ? 'rtl' : 'ltr'}" lang="${lang}"><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{width:${width.css};font-family:'Courier New',monospace;padding:8px;font-size:${base}px;text-align:center;}img{display:block;margin:0 auto 8px auto;max-width:70%;max-height:100px;}</style></head><body>${body}</body></html>`
  } catch (error) {
    console.error('[Printer] Receipt template failed; the default receipt will print instead:', error)
    return null
  }
}
