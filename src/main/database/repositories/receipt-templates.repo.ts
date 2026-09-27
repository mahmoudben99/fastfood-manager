import { getDb } from '../connection'
import { settingsRepo } from './settings.repo'
import {
  migrateLegacySocialRows,
  parseSocialMedia,
  serializeSocialMedia,
  type SocialMediaEntry
} from '../../../shared/settings-rules'

const SOCIAL_MIGRATION_MARKER = 'social_media_table_migrated'

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
    return { id: Number(result.lastInsertRowid) }
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

  /** Deactivate every template so the printer falls back to the built-in default receipt. */
  clearActive() {
    getDb().prepare('UPDATE receipt_templates SET is_active = 0 WHERE is_active != 0').run()
  },

  /**
   * One-time, in-code migration of the legacy `social_media` table into `settings.social_media`.
   * The old Receipt Editor wrote the table, but the printer, the tablet/TV server and cloud sync
   * only ever read the setting, so accounts added in the editor never printed. Runs once per
   * database (guarded by a marker setting); the legacy rows are left untouched.
   */
  migrateLegacySocialMedia() {
    const db = getDb()
    const marker = db.prepare('SELECT value FROM settings WHERE key = ?').get(SOCIAL_MIGRATION_MARKER) as
      | { value: string }
      | undefined
    if (marker?.value === '1') return
    db.transaction(() => {
      const hasTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'social_media'")
        .get()
      if (hasTable) {
        const current = settingsRepo.get('social_media')
        const rows = db.prepare('SELECT platform, handle FROM social_media ORDER BY id').all()
        const migrated = migrateLegacySocialRows(current, rows)
        if (migrated !== null) settingsRepo.set('social_media', migrated)
      }
      settingsRepo.set(SOCIAL_MIGRATION_MARKER, '1')
    })()
  },

  /** Social accounts — read from `settings.social_media`, the single source of truth. */
  getAllSocialMedia(): SocialMediaEntry[] {
    try {
      receiptTemplatesRepo.migrateLegacySocialMedia()
    } catch (err) {
      console.error('[Receipt] social media migration failed:', err)
    }
    return parseSocialMedia(settingsRepo.get('social_media'))
  },

  /** Writes `settings.social_media` in the exact JSON format Settings > General writes. */
  saveSocialMedia(items: unknown) {
    settingsRepo.set('social_media', serializeSocialMedia(items))
  }
}
