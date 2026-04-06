import { getDb } from '../connection'

export const receiptTemplatesRepo = {
  getAllTemplates() {
    return getDb().prepare('SELECT * FROM receipt_templates ORDER BY id').all()
  },

  getActiveTemplate() {
    return (
      (getDb()
        .prepare('SELECT * FROM receipt_templates WHERE is_active = 1')
        .get() as any) || null
    )
  },

  saveTemplate(input: { name: string; blocks: string; is_active?: number }) {
    const result = getDb()
      .prepare(
        'INSERT INTO receipt_templates (name, blocks, is_active) VALUES (?, ?, ?)'
      )
      .run(input.name, input.blocks, input.is_active ?? 0)
    return { id: result.lastInsertRowid }
  },

  updateTemplate(
    id: number,
    input: { name?: string; blocks?: string; is_active?: number }
  ) {
    const fields: string[] = []
    const values: any[] = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      values.push(input.name)
    }
    if (input.blocks !== undefined) {
      fields.push('blocks = ?')
      values.push(input.blocks)
    }
    if (input.is_active !== undefined) {
      fields.push('is_active = ?')
      values.push(input.is_active)
    }

    fields.push("updated_at = datetime('now')")
    values.push(id)

    getDb()
      .prepare(`UPDATE receipt_templates SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values)
  },

  deleteTemplate(id: number) {
    getDb().prepare('DELETE FROM receipt_templates WHERE id = ?').run(id)
  },

  setActive(id: number) {
    const db = getDb()
    db.transaction(() => {
      db.prepare('UPDATE receipt_templates SET is_active = 0').run()
      db.prepare('UPDATE receipt_templates SET is_active = 1 WHERE id = ?').run(id)
    })()
  },

  getAllSocialMedia() {
    return getDb().prepare('SELECT * FROM social_media ORDER BY id').all()
  },

  saveSocialMedia(items: { platform: string; handle: string }[]) {
    const db = getDb()
    db.transaction(() => {
      db.prepare('DELETE FROM social_media').run()
      const stmt = db.prepare(
        'INSERT INTO social_media (platform, handle) VALUES (?, ?)'
      )
      for (const item of items) {
        stmt.run(item.platform, item.handle)
      }
    })()
  }
}
