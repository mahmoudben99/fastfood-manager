import { getDb } from '../connection'

export interface Promotion {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  type: 'percentage' | 'fixed'
  discount_value: number
  applies_to: 'all' | 'specific'
  is_active: number
  created_at: string
  updated_at: string
  menu_item_ids?: number[]
}

export interface Pack {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  pack_price: number
  is_active: number
  emoji: string | null
  created_at: string
  updated_at: string
  items?: PackItem[]
}

export interface PackItem {
  id: number
  pack_id: number
  menu_item_id: number
  quantity: number
  menu_item_name?: string
  menu_item_price?: number
}

export interface CreatePromotionInput {
  name: string
  name_ar?: string
  name_fr?: string
  type: 'percentage' | 'fixed'
  discount_value: number
  applies_to: 'all' | 'specific'
  menu_item_ids?: number[]
}

export interface CreatePackInput {
  name: string
  name_ar?: string
  name_fr?: string
  pack_price: number
  emoji?: string
  items: { menu_item_id: number; quantity: number }[]
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite number of zero or more`)
}

function validatePromotion(input: CreatePromotionInput): void {
  if (!input.name?.trim()) throw new Error('Promotion name is required')
  if (input.type !== 'percentage' && input.type !== 'fixed') throw new Error('Invalid promotion type')
  if (input.applies_to !== 'all' && input.applies_to !== 'specific') throw new Error('Invalid promotion scope')
  assertFiniteNonNegative(input.discount_value, 'Discount value')
  if (input.type === 'percentage' && input.discount_value > 100) {
    throw new Error('Percentage discount must be between 0 and 100')
  }
  if (input.applies_to === 'specific') {
    const ids = input.menu_item_ids || []
    if (ids.length === 0) throw new Error('Select at least one item for a specific promotion')
    if (new Set(ids).size !== ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new Error('Promotion item IDs must be unique positive integers')
    }
  }
}

function validatePack(input: CreatePackInput): void {
  if (!input.name?.trim()) throw new Error('Pack name is required')
  assertFiniteNonNegative(input.pack_price, 'Pack price')
  if (!input.items?.length) throw new Error('A pack must contain at least one item')
  for (const item of input.items) {
    if (!Number.isInteger(item.menu_item_id) || item.menu_item_id <= 0) throw new Error('Invalid pack item')
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 999) {
      throw new Error('Pack item quantity must be an integer between 1 and 999')
    }
  }
}

export const promotionsRepo = {
  // ── Promotions ──────────────────────────────────────────────

  /**
   * Batch-attach menu_item_ids to a list of promotions. The list queries used to return
   * bare promotion rows with menu_item_ids undefined, so the POS cart's computeDiscount
   * ("promo.menu_item_ids?.includes(item.menu_item_id)") matched nothing and any
   * "specific items" promotion silently applied zero discount. This backfills them in one
   * query. Also fixes the edit modal, which relied on the list rows carrying menu_item_ids.
   */
  _attachMenuItemIds(promos: Promotion[]): Promotion[] {
    if (!promos.length) return promos
    const rows = getDb()
      .prepare('SELECT promotion_id, menu_item_id FROM promotion_items')
      .all() as { promotion_id: number; menu_item_id: number }[]
    const map = new Map<number, number[]>()
    for (const r of rows) {
      const arr = map.get(r.promotion_id) ?? []
      arr.push(r.menu_item_id)
      map.set(r.promotion_id, arr)
    }
    for (const p of promos) p.menu_item_ids = map.get(p.id) ?? []
    return promos
  },

  getAllPromotions(): Promotion[] {
    return this._attachMenuItemIds(
      getDb().prepare('SELECT * FROM promotions ORDER BY created_at DESC').all() as Promotion[]
    )
  },

  getActivePromotions(): Promotion[] {
    return this._attachMenuItemIds(
      getDb()
        .prepare('SELECT * FROM promotions WHERE is_active = 1 ORDER BY created_at DESC')
        .all() as Promotion[]
    )
  },

  getPromotionById(id: number): Promotion | undefined {
    const promo = getDb()
      .prepare('SELECT * FROM promotions WHERE id = ?')
      .get(id) as Promotion | undefined

    if (promo) {
      promo.menu_item_ids = getDb()
        .prepare('SELECT menu_item_id FROM promotion_items WHERE promotion_id = ?')
        .all(id)
        .map((row: any) => row.menu_item_id)
    }

    return promo
  },

  createPromotion(input: CreatePromotionInput): Promotion {
    validatePromotion(input)
    const transaction = getDb().transaction(() => {
      const result = getDb()
        .prepare(
          `INSERT INTO promotions (name, name_ar, name_fr, type, discount_value, applies_to)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.name,
          input.name_ar ?? null,
          input.name_fr ?? null,
          input.type,
          input.discount_value,
          input.applies_to
        )

      const promoId = result.lastInsertRowid as number

      if (input.applies_to === 'specific' && input.menu_item_ids?.length) {
        const stmt = getDb().prepare(
          'INSERT INTO promotion_items (promotion_id, menu_item_id) VALUES (?, ?)'
        )
        for (const menuItemId of input.menu_item_ids) {
          stmt.run(promoId, menuItemId)
        }
      }

      return promoId
    })

    const id = transaction()
    return this.getPromotionById(id)!
  },

  updatePromotion(id: number, input: Partial<CreatePromotionInput>): Promotion | undefined {
    const current = this.getPromotionById(id)
    if (!current) return undefined
    const merged: CreatePromotionInput = {
      name: input.name ?? current.name,
      name_ar: input.name_ar ?? current.name_ar ?? undefined,
      name_fr: input.name_fr ?? current.name_fr ?? undefined,
      type: input.type ?? current.type,
      discount_value: input.discount_value ?? current.discount_value,
      applies_to: input.applies_to ?? current.applies_to,
      menu_item_ids: input.menu_item_ids ?? current.menu_item_ids
    }
    validatePromotion(merged)

    const transaction = getDb().transaction(() => {
      getDb()
        .prepare(
          `UPDATE promotions SET name = ?, name_ar = ?, name_fr = ?, type = ?,
           discount_value = ?, applies_to = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(
          input.name ?? current.name,
          input.name_ar ?? current.name_ar,
          input.name_fr ?? current.name_fr,
          input.type ?? current.type,
          input.discount_value ?? current.discount_value,
          input.applies_to ?? current.applies_to,
          id
        )

      if (input.menu_item_ids !== undefined) {
        getDb().prepare('DELETE FROM promotion_items WHERE promotion_id = ?').run(id)
        if (input.menu_item_ids.length) {
          const stmt = getDb().prepare(
            'INSERT INTO promotion_items (promotion_id, menu_item_id) VALUES (?, ?)'
          )
          for (const menuItemId of input.menu_item_ids) {
            stmt.run(id, menuItemId)
          }
        }
      }
    })

    transaction()
    return this.getPromotionById(id)
  },

  deletePromotion(id: number): boolean {
    const result = getDb().prepare('DELETE FROM promotions WHERE id = ?').run(id)
    return result.changes > 0
  },

  togglePromotion(id: number): Promotion | undefined {
    getDb()
      .prepare(
        `UPDATE promotions SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
         updated_at = datetime('now') WHERE id = ?`
      )
      .run(id)
    return this.getPromotionById(id)
  },

  // ── Packs ───────────────────────────────────────────────────

  _getPackItems(packId: number): PackItem[] {
    return getDb()
      .prepare(
        `SELECT pi.*, mi.name as menu_item_name, mi.price as menu_item_price
         FROM pack_items pi
         LEFT JOIN menu_items mi ON pi.menu_item_id = mi.id
         WHERE pi.pack_id = ?`
      )
      .all(packId) as PackItem[]
  },

  getAllPacks(): Pack[] {
    const packs = getDb()
      .prepare('SELECT * FROM packs ORDER BY created_at DESC')
      .all() as Pack[]

    for (const pack of packs) {
      pack.items = this._getPackItems(pack.id)
    }

    return packs
  },

  getActivePacks(): Pack[] {
    const packs = getDb()
      .prepare('SELECT * FROM packs WHERE is_active = 1 ORDER BY created_at DESC')
      .all() as Pack[]

    for (const pack of packs) {
      pack.items = this._getPackItems(pack.id)
    }

    return packs
  },

  createPack(input: CreatePackInput): Pack {
    validatePack(input)
    const transaction = getDb().transaction(() => {
      const result = getDb()
        .prepare(
          `INSERT INTO packs (name, name_ar, name_fr, pack_price, emoji)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          input.name,
          input.name_ar ?? null,
          input.name_fr ?? null,
          input.pack_price,
          input.emoji ?? null
        )

      const packId = result.lastInsertRowid as number

      if (input.items?.length) {
        const stmt = getDb().prepare(
          'INSERT INTO pack_items (pack_id, menu_item_id, quantity) VALUES (?, ?, ?)'
        )
        for (const item of input.items) {
          stmt.run(packId, item.menu_item_id, item.quantity)
        }
      }

      return packId
    })

    const id = transaction()
    return this.getPackById(id)!
  },

  getPackById(id: number): Pack | undefined {
    const pack = getDb()
      .prepare('SELECT * FROM packs WHERE id = ?')
      .get(id) as Pack | undefined

    if (pack) {
      pack.items = this._getPackItems(pack.id)
    }

    return pack
  },

  updatePack(id: number, input: Partial<CreatePackInput>): Pack | undefined {
    const current = this.getPackById(id)
    if (!current) return undefined
    validatePack({
      name: input.name ?? current.name,
      name_ar: input.name_ar ?? current.name_ar ?? undefined,
      name_fr: input.name_fr ?? current.name_fr ?? undefined,
      pack_price: input.pack_price ?? current.pack_price,
      emoji: input.emoji ?? current.emoji ?? undefined,
      items: input.items ?? (current.items || []).map((item) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.quantity
      }))
    })

    const transaction = getDb().transaction(() => {
      getDb()
        .prepare(
          `UPDATE packs SET name = ?, name_ar = ?, name_fr = ?, pack_price = ?,
           emoji = ?, updated_at = datetime('now') WHERE id = ?`
        )
        .run(
          input.name ?? current.name,
          input.name_ar ?? current.name_ar,
          input.name_fr ?? current.name_fr,
          input.pack_price ?? current.pack_price,
          input.emoji !== undefined ? input.emoji : current.emoji,
          id
        )

      if (input.items !== undefined) {
        getDb().prepare('DELETE FROM pack_items WHERE pack_id = ?').run(id)
        if (input.items.length) {
          const stmt = getDb().prepare(
            'INSERT INTO pack_items (pack_id, menu_item_id, quantity) VALUES (?, ?, ?)'
          )
          for (const item of input.items) {
            stmt.run(id, item.menu_item_id, item.quantity)
          }
        }
      }
    })

    transaction()
    return this.getPackById(id)
  },

  deletePack(id: number): boolean {
    const result = getDb().prepare('DELETE FROM packs WHERE id = ?').run(id)
    return result.changes > 0
  },

  togglePack(id: number): Pack | undefined {
    getDb()
      .prepare(
        `UPDATE packs SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
         updated_at = datetime('now') WHERE id = ?`
      )
      .run(id)
    return this.getPackById(id)
  }
}
