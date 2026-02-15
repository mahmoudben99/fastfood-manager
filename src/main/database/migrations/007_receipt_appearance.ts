import type Database from 'better-sqlite3'

export const migration007 = {
  version: 7,
  name: 'receipt_appearance',
  up: (db: Database.Database): void => {
    // Add receipt font size setting (small, medium, large)
    const fontSizeExists = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('receipt_font_size') as { value: string } | undefined

    if (!fontSizeExists) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('receipt_font_size', 'medium')
    }

    // Add kitchen ticket font size setting
    const kitchenFontExists = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('kitchen_font_size') as { value: string } | undefined

    if (!kitchenFontExists) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('kitchen_font_size', 'large')
    }
  }
}
