/**
 * Kitchen ticket labels in the app language (receipts already follow it). English keeps the exact
 * wording older tickets and tests use.
 */
import { receiptLang, type ReceiptLang } from './print-format'

export interface KitchenLabels {
  kitchen: string
  dineIn: string
  takeaway: string
  delivery: string
  table: string
  forStation: string
  added: string
  qty: string
  noteChanged: string
  optionsChanged: string
  removed: string
  notes: string
  reprint: string
  combo: string
  item: string
  zone: string
  tel: string
  codUnpaid: string
  events: Record<'updated' | 'cancelled' | 'restored', string>
}

const LABELS: Record<ReceiptLang, KitchenLabels> = {
  en: {
    kitchen: 'KITCHEN', dineIn: 'DINE IN', takeaway: 'TAKEAWAY', delivery: 'DELIVERY', table: 'TABLE', forStation: 'FOR:',
    added: '+ ADDED', qty: 'QTY', noteChanged: 'NOTE CHANGED', optionsChanged: 'OPTIONS CHANGED', removed: 'REMOVED',
    notes: 'Notes:', reprint: 'REPRINT', combo: 'COMBO:', item: 'Item', zone: 'ZONE:', tel: 'TEL:', codUnpaid: 'COD - NOT PAID',
    events: { updated: 'UPDATED', cancelled: 'CANCELLED', restored: 'RESTORED' }
  },
  fr: {
    kitchen: 'CUISINE', dineIn: 'SUR PLACE', takeaway: 'À EMPORTER', delivery: 'LIVRAISON', table: 'TABLE', forStation: 'POUR :',
    added: '+ AJOUTÉ', qty: 'QTÉ', noteChanged: 'NOTE MODIFIÉE', optionsChanged: 'OPTIONS MODIFIÉES', removed: 'SUPPRIMÉ',
    notes: 'Notes :', reprint: 'RÉIMPRESSION', combo: 'COMBO :', item: 'Article', zone: 'ZONE :', tel: 'TÉL :',
    codUnpaid: 'À ENCAISSER - NON PAYÉ',
    events: { updated: 'MODIFIÉE', cancelled: 'ANNULÉE', restored: 'RÉTABLIE' }
  },
  ar: {
    kitchen: 'المطبخ', dineIn: 'في المطعم', takeaway: 'سفري', delivery: 'توصيل', table: 'طاولة', forStation: 'إلى:',
    added: '+ مضاف', qty: 'الكمية', noteChanged: 'تغيّرت الملاحظة', optionsChanged: 'تغيّرت الخيارات', removed: 'محذوف',
    notes: 'ملاحظات:', reprint: 'إعادة طباعة', combo: 'كومبو:', item: 'منتج', zone: 'المنطقة:', tel: 'الهاتف:',
    codUnpaid: 'الدفع عند الاستلام - غير مدفوع',
    events: { updated: 'معدّل', cancelled: 'ملغى', restored: 'مستعاد' }
  }
}

export function kitchenLabels(settings: Record<string, string>): KitchenLabels {
  return LABELS[receiptLang(settings)]
}

export function kitchenOrderTypeLabel(orderType: string, labels: KitchenLabels): string {
  if (orderType === 'delivery') return labels.delivery
  if (orderType === 'takeout') return labels.takeaway
  return labels.dineIn
}
