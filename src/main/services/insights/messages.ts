/**
 * User-facing insights text (Telegram messages, printed prep list) in en / fr / ar.
 * The language is the app setting `language`; anything else falls back to English.
 */
export type InsightsLang = 'en' | 'fr' | 'ar'

export function insightsLang(settings: Record<string, string | null | undefined>): InsightsLang {
  const lang = settings.language
  return lang === 'fr' || lang === 'ar' ? lang : 'en'
}

const WEEKDAYS: Record<InsightsLang, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
}

const UNITS: Record<InsightsLang, Record<string, string>> = {
  en: { kg: 'kg', liter: 'L', unit: 'pcs' },
  fr: { kg: 'kg', liter: 'L', unit: 'pcs' },
  ar: { kg: 'كغ', liter: 'ل', unit: 'قطعة' }
}

const TEXT = {
  en: {
    prepTitle: 'Prep plan — {day} {date}',
    expected: 'Expected today: ~{orders} orders · ~{revenue} {cur}',
    basisWeekday: 'Based on the last {n} {weekday}s (recent weeks count more).',
    basisDaily: 'Little history yet: based on the daily average of the last {n} open days.',
    basisNone: 'No sales history yet — the forecast starts after a few days of orders.',
    trend: 'Trend adjustment: ×{factor}',
    prepHeader: 'Prep',
    buyHeader: 'To buy (est. {total} {cur})',
    buyLine: '{name}: {qty} (have {have}, today needs {need}) — {cost} {cur}',
    nothingToBuy: 'Stock covers today\'s forecast — nothing to buy.',
    notEnough: 'Not enough for today: {items}',
    more: '…and {n} more',
    cancellationsTitle: 'Unusual cancellations',
    cancellationsBody: '{count} orders cancelled today (usually ~{avg} a day). Cancelled value: {amount} {cur}.',
    discountsTitle: 'Unusual discounts',
    discountsBody: '{amount} {cur} of discounts today on {orders} orders ({pct}% of sales; usually ~{avg} {cur} a day).',
    operatorLine: '{operator}: {voids} cancelled, {overrides} price changes',
    slowTitle: 'Slow day',
    slowBody: 'Revenue so far: {today} {cur} at {time} — usually ~{expected} {cur} by this time on a {weekday} ({pct}%).',
    lowStockTitle: 'Stock too low for today',
    lowStockLine: '{name}: have {have}, today needs ~{need}',
    marginTitle: 'Margin alarm',
    marginLine: '{item}: margin {margin}% (below {threshold}%) after {ingredient} went from {from} to {to} {cur}/{unit}',
    printPrep: 'PREP LIST',
    printShopping: 'SHOPPING LIST',
    printItem: 'Item',
    printQty: 'Qty',
    printToBuy: 'To buy',
    printHave: 'Have',
    printNeed: 'Need',
    printCost: 'Cost',
    printTotal: 'Estimated total',
    printCritical: '! = not enough for today',
    printPrinted: 'Printed'
  },
  fr: {
    prepTitle: 'Plan de préparation — {day} {date}',
    expected: 'Prévu aujourd\'hui : ~{orders} commandes · ~{revenue} {cur}',
    basisWeekday: 'Basé sur les {n} derniers {weekday}s (les semaines récentes comptent plus).',
    basisDaily: 'Peu d\'historique : basé sur la moyenne des {n} derniers jours d\'ouverture.',
    basisNone: 'Pas encore d\'historique — la prévision démarre après quelques jours de commandes.',
    trend: 'Ajustement tendance : ×{factor}',
    prepHeader: 'À préparer',
    buyHeader: 'À acheter (env. {total} {cur})',
    buyLine: '{name} : {qty} (stock {have}, besoin du jour {need}) — {cost} {cur}',
    nothingToBuy: 'Le stock couvre la prévision du jour — rien à acheter.',
    notEnough: 'Pas assez pour aujourd\'hui : {items}',
    more: '…et {n} de plus',
    cancellationsTitle: 'Annulations inhabituelles',
    cancellationsBody: '{count} commandes annulées aujourd\'hui (d\'habitude ~{avg} par jour). Valeur annulée : {amount} {cur}.',
    discountsTitle: 'Remises inhabituelles',
    discountsBody: '{amount} {cur} de remises aujourd\'hui sur {orders} commandes ({pct}% des ventes ; d\'habitude ~{avg} {cur} par jour).',
    operatorLine: '{operator} : {voids} annulées, {overrides} changements de prix',
    slowTitle: 'Journée calme',
    slowBody: 'Chiffre d\'affaires : {today} {cur} à {time} — d\'habitude ~{expected} {cur} à cette heure un {weekday} ({pct}%).',
    lowStockTitle: 'Stock insuffisant pour aujourd\'hui',
    lowStockLine: '{name} : stock {have}, besoin du jour ~{need}',
    marginTitle: 'Alerte marge',
    marginLine: '{item} : marge {margin}% (sous {threshold}%) après la hausse de {ingredient} de {from} à {to} {cur}/{unit}',
    printPrep: 'LISTE DE PRÉPARATION',
    printShopping: 'LISTE DE COURSES',
    printItem: 'Article',
    printQty: 'Qté',
    printToBuy: 'À acheter',
    printHave: 'Stock',
    printNeed: 'Besoin',
    printCost: 'Coût',
    printTotal: 'Total estimé',
    printCritical: '! = pas assez pour aujourd\'hui',
    printPrinted: 'Imprimé'
  },
  ar: {
    prepTitle: 'خطة التحضير — {day} {date}',
    expected: 'المتوقع اليوم: ~{orders} طلب · ~{revenue} {cur}',
    basisWeekday: 'حسب آخر {n} أيام {weekday} (الأسابيع الأخيرة لها وزن أكبر).',
    basisDaily: 'سجل قليل: حسب متوسط آخر {n} أيام عمل.',
    basisNone: 'لا يوجد سجل مبيعات بعد — تبدأ التوقعات بعد بضعة أيام من الطلبات.',
    trend: 'تعديل الاتجاه: ×{factor}',
    prepHeader: 'للتحضير',
    buyHeader: 'للشراء (حوالي {total} {cur})',
    buyLine: '{name}: {qty} (المخزون {have}، حاجة اليوم {need}) — {cost} {cur}',
    nothingToBuy: 'المخزون يكفي توقعات اليوم — لا شيء للشراء.',
    notEnough: 'غير كافٍ لليوم: {items}',
    more: '…و{n} أخرى',
    cancellationsTitle: 'إلغاءات غير عادية',
    cancellationsBody: 'الطلبات الملغاة اليوم: {count} (عادةً ~{avg} في اليوم). قيمة الإلغاء: {amount} {cur}.',
    discountsTitle: 'خصومات غير عادية',
    discountsBody: 'خصومات اليوم: {amount} {cur} على {orders} طلب ({pct}% من المبيعات؛ عادةً ~{avg} {cur} في اليوم).',
    operatorLine: '{operator}: {voids} إلغاء، {overrides} تغيير سعر',
    slowTitle: 'يوم هادئ',
    slowBody: 'المبيعات حتى الآن: {today} {cur} على الساعة {time} — عادةً ~{expected} {cur} في هذا الوقت يوم {weekday} ({pct}%).',
    lowStockTitle: 'المخزون غير كافٍ لليوم',
    lowStockLine: '{name}: المخزون {have}، حاجة اليوم ~{need}',
    marginTitle: 'تنبيه الهامش',
    marginLine: '{item}: الهامش {margin}% (أقل من {threshold}%) بعد ارتفاع {ingredient} من {from} إلى {to} {cur}/{unit}',
    printPrep: 'قائمة التحضير',
    printShopping: 'قائمة المشتريات',
    printItem: 'المنتج',
    printQty: 'الكمية',
    printToBuy: 'للشراء',
    printHave: 'المخزون',
    printNeed: 'الحاجة',
    printCost: 'التكلفة',
    printTotal: 'المجموع التقديري',
    printCritical: '! = غير كافٍ لليوم',
    printPrinted: 'طُبع'
  }
} as const

export type MessageKey = keyof typeof TEXT.en

export function t(lang: InsightsLang, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const template: string = TEXT[lang][key] ?? TEXT.en[key]
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`))
}

export function weekdayName(lang: InsightsLang, weekday: number): string {
  return WEEKDAYS[lang][weekday] ?? ''
}

export function unitLabel(lang: InsightsLang, unit: string): string {
  return UNITS[lang][unit] ?? unit
}

/** Name in the app language, falling back to the default name. */
export function localName(item: { name: string; name_ar?: string | null; name_fr?: string | null }, lang: InsightsLang): string {
  if (lang === 'ar' && item.name_ar?.trim()) return item.name_ar
  if (lang === 'fr' && item.name_fr?.trim()) return item.name_fr
  return item.name
}

/** Whole dinars with a space as thousands separator ("85 000") — independent of ICU data. */
export function formatMoney(value: number): string {
  const rounded = Math.round(Number(value) || 0)
  const sign = rounded < 0 ? '-' : ''
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Up to two decimals, trailing zeros trimmed ("1.5", "12", "0.25"). */
export function formatQty(value: number): string {
  const rounded = Math.round((Number(value) || 0) * 100) / 100
  return String(rounded)
}

export function qtyWithUnit(lang: InsightsLang, value: number, unit: string): string {
  return `${formatQty(value)} ${unitLabel(lang, unit)}`
}

/** Escape for Telegram HTML parse_mode (only &, <, > are special). */
export function escapeTelegram(text: unknown): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
