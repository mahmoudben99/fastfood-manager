import type Database from 'better-sqlite3'

export const migration003 = {
  version: 3,
  name: 'add_menu_item_emoji',
  up: (db: Database.Database): void => {
    db.exec(`ALTER TABLE menu_items ADD COLUMN emoji TEXT`)
  }
}
