/**
 * User-facing texts (en/fr/ar) for modifiers, combos and sold-out errors. Shared by the main
 * process (which localizes errors with the app language) and the renderer (which may map the
 * stable `code` to its own wording).
 */
export type CatalogLang = 'en' | 'fr' | 'ar'

const EN = {
  item_sold_out: '"{item}" is sold out',
  item_unavailable: '"{item}" is unavailable',
  modifier_invalid_input: 'Invalid options for "{item}"',
  modifier_unknown_option: 'An option chosen for "{item}" is not available for it',
  modifier_repeated: '"{option}" was chosen twice for "{item}"',
  modifier_quantity_not_allowed: '"{group}" allows each option only once',
  modifier_quantity_invalid: 'Option quantity must be a whole number between 1 and {max}',
  modifier_group_min: 'Choose at least {min} in "{group}" for "{item}"',
  modifier_group_max: 'Choose at most {max} in "{group}" for "{item}"',
  combo_not_a_combo: '"{item}" is not a combo',
  combo_invalid_input: 'Invalid combo choices for "{item}"',
  combo_unknown_slot: 'A choice does not match any part of "{item}"',
  combo_choice_not_allowed: '"{choice}" cannot be chosen for "{slot}"',
  combo_slot_min: 'Choose at least {min} for "{slot}" in "{item}"',
  combo_slot_max: 'Choose at most {max} for "{slot}" in "{item}"',
  name_required: 'A name is required',
  text_too_long: '"{field}" is too long (max {max} characters)',
  group_not_found: 'This option group no longer exists',
  option_not_found: 'This option no longer exists',
  menu_item_not_found: 'This item no longer exists',
  category_not_found: 'This category no longer exists',
  invalid_selection_rules: 'Invalid selection rules: minimum must be 0 or more, maximum 1 or more and not below the minimum',
  invalid_price_delta: 'Price change must be a number between -{max} and {max}',
  invalid_kind: 'Unknown option type',
  no_kind_ingredients: 'A "No …" option cannot deduct stock',
  invalid_ingredient: 'Each option ingredient needs an active stock item and a quantity above 0',
  ingredient_repeated: 'The same stock item appears twice',
  incompatible_unit: 'Unit {unit} is incompatible with {stock} ({stockUnit})',
  invalid_assignment: 'Invalid option group assignment',
  combo_needs_slot: 'A combo needs at least one part',
  slot_needs_choice: '"{slot}" needs at least one choice',
  invalid_choice: 'Invalid combo choice',
  combo_nested: 'A combo cannot contain a combo',
  invalid_upcharge: 'Upcharge must be a number between 0 and {max}',
  too_many_defaults: '"{slot}" has more default choices than it allows',
  default_choice_category: 'A default choice must be one item, not a whole category'
}

export type CatalogMessageCode = keyof typeof EN

const FR: Record<CatalogMessageCode, string> = {
  item_sold_out: '« {item} » est épuisé',
  item_unavailable: '« {item} » n\'est pas disponible',
  modifier_invalid_input: 'Options invalides pour « {item} »',
  modifier_unknown_option: 'Une option choisie n\'est pas disponible pour « {item} »',
  modifier_repeated: '« {option} » a été choisi deux fois pour « {item} »',
  modifier_quantity_not_allowed: '« {group} » n\'accepte chaque option qu\'une seule fois',
  modifier_quantity_invalid: 'La quantité d\'une option doit être un entier entre 1 et {max}',
  modifier_group_min: 'Choisissez au moins {min} dans « {group} » pour « {item} »',
  modifier_group_max: 'Choisissez au plus {max} dans « {group} » pour « {item} »',
  combo_not_a_combo: '« {item} » n\'est pas un combo',
  combo_invalid_input: 'Choix du combo invalides pour « {item} »',
  combo_unknown_slot: 'Un choix ne correspond à aucune partie de « {item} »',
  combo_choice_not_allowed: '« {choice} » ne peut pas être choisi pour « {slot} »',
  combo_slot_min: 'Choisissez au moins {min} pour « {slot} » dans « {item} »',
  combo_slot_max: 'Choisissez au plus {max} pour « {slot} » dans « {item} »',
  name_required: 'Le nom est obligatoire',
  text_too_long: '« {field} » est trop long ({max} caractères max.)',
  group_not_found: 'Ce groupe d\'options n\'existe plus',
  option_not_found: 'Cette option n\'existe plus',
  menu_item_not_found: 'Cet article n\'existe plus',
  category_not_found: 'Cette catégorie n\'existe plus',
  invalid_selection_rules: 'Règles de sélection invalides : minimum 0 ou plus, maximum 1 ou plus et pas en dessous du minimum',
  invalid_price_delta: 'La variation de prix doit être comprise entre -{max} et {max}',
  invalid_kind: 'Type d\'option inconnu',
  no_kind_ingredients: 'Une option « Sans … » ne peut pas déduire de stock',
  invalid_ingredient: 'Chaque ingrédient d\'option doit être un article de stock actif avec une quantité supérieure à 0',
  ingredient_repeated: 'Le même article de stock apparaît deux fois',
  incompatible_unit: 'L\'unité {unit} est incompatible avec {stock} ({stockUnit})',
  invalid_assignment: 'Affectation de groupe d\'options invalide',
  combo_needs_slot: 'Un combo doit avoir au moins une partie',
  slot_needs_choice: '« {slot} » doit proposer au moins un choix',
  invalid_choice: 'Choix de combo invalide',
  combo_nested: 'Un combo ne peut pas contenir un autre combo',
  invalid_upcharge: 'Le supplément doit être compris entre 0 et {max}',
  too_many_defaults: '« {slot} » a plus de choix par défaut qu\'il n\'en autorise',
  default_choice_category: 'Un choix par défaut doit être un article, pas une catégorie entière'
}

const AR: Record<CatalogMessageCode, string> = {
  item_sold_out: '«{item}» نفد',
  item_unavailable: '«{item}» غير متوفر',
  modifier_invalid_input: 'خيارات غير صالحة لـ «{item}»',
  modifier_unknown_option: 'أحد الخيارات المختارة غير متاح لـ «{item}»',
  modifier_repeated: 'تم اختيار «{option}» مرتين لـ «{item}»',
  modifier_quantity_not_allowed: '«{group}» يسمح بكل خيار مرة واحدة فقط',
  modifier_quantity_invalid: 'كمية الخيار يجب أن تكون عددًا صحيحًا بين 1 و {max}',
  modifier_group_min: 'اختر {min} على الأقل من «{group}» لـ «{item}»',
  modifier_group_max: 'اختر {max} على الأكثر من «{group}» لـ «{item}»',
  combo_not_a_combo: '«{item}» ليس وجبة مركّبة',
  combo_invalid_input: 'اختيارات الوجبة غير صالحة لـ «{item}»',
  combo_unknown_slot: 'أحد الاختيارات لا يطابق أي جزء من «{item}»',
  combo_choice_not_allowed: 'لا يمكن اختيار «{choice}» لـ «{slot}»',
  combo_slot_min: 'اختر {min} على الأقل لـ «{slot}» في «{item}»',
  combo_slot_max: 'اختر {max} على الأكثر لـ «{slot}» في «{item}»',
  name_required: 'الاسم مطلوب',
  text_too_long: '«{field}» طويل جدًا (الحد الأقصى {max} حرفًا)',
  group_not_found: 'مجموعة الخيارات هذه لم تعد موجودة',
  option_not_found: 'هذا الخيار لم يعد موجودًا',
  menu_item_not_found: 'هذا المنتج لم يعد موجودًا',
  category_not_found: 'هذه الفئة لم تعد موجودة',
  invalid_selection_rules: 'قواعد اختيار غير صالحة: الحد الأدنى 0 أو أكثر، والحد الأقصى 1 أو أكثر ولا يقل عن الحد الأدنى',
  invalid_price_delta: 'تغيير السعر يجب أن يكون بين -{max} و {max}',
  invalid_kind: 'نوع خيار غير معروف',
  no_kind_ingredients: 'خيار «بدون …» لا يمكنه خصم المخزون',
  invalid_ingredient: 'كل مكوّن للخيار يحتاج إلى عنصر مخزون نشط وكمية أكبر من 0',
  ingredient_repeated: 'نفس عنصر المخزون مذكور مرتين',
  incompatible_unit: 'الوحدة {unit} غير متوافقة مع {stock} ({stockUnit})',
  invalid_assignment: 'ربط مجموعة الخيارات غير صالح',
  combo_needs_slot: 'الوجبة المركّبة تحتاج إلى جزء واحد على الأقل',
  slot_needs_choice: '«{slot}» يحتاج إلى اختيار واحد على الأقل',
  invalid_choice: 'اختيار غير صالح في الوجبة',
  combo_nested: 'لا يمكن أن تحتوي وجبة مركّبة على وجبة مركّبة أخرى',
  invalid_upcharge: 'الزيادة يجب أن تكون بين 0 و {max}',
  too_many_defaults: '«{slot}» يحتوي على اختيارات افتراضية أكثر من المسموح',
  default_choice_category: 'الاختيار الافتراضي يجب أن يكون منتجًا واحدًا وليس فئة كاملة'
}

const MESSAGES: Record<CatalogLang, Record<CatalogMessageCode, string>> = { en: EN, fr: FR, ar: AR }

export function catalogLangOf(value: unknown): CatalogLang {
  return value === 'fr' || value === 'ar' ? value : 'en'
}

export function catalogMessage(
  code: CatalogMessageCode,
  lang: CatalogLang = 'en',
  params: Record<string, string | number> = {}
): string {
  const template = MESSAGES[lang]?.[code] ?? EN[code] ?? code
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    params[key] === undefined ? match : String(params[key]))
}

/** Thrown by the catalog services; `message` is already localized, `code` is stable. */
export class CatalogError extends Error {
  readonly code: CatalogMessageCode
  constructor(code: CatalogMessageCode, message: string) {
    super(message)
    this.name = 'CatalogError'
    this.code = code
  }
}
