# Fast Food Manager - Development Log

**Current Version:** 1.2.2
**Last Updated:** 2026-02-15
**Repository:** https://github.com/mahmoudben99/fastfood-manager

---

## Tech Stack
- **Framework:** Electron 33.4.11 + electron-vite
- **Frontend:** React 19 + Tailwind CSS v4
- **Database:** SQLite (better-sqlite3)
- **State Management:** Zustand
- **i18n:** react-i18next (Arabic, English, French)
- **Printing:** node-thermal-printer
- **Auto-updates:** electron-updater (GitHub releases)
- **Backup:** Live backup system with daily files

---

## Project Structure
```
src/
├── main/           # Electron main process
│   ├── database/   # SQLite setup, migrations, repositories
│   │   └── backup.ts  # Live backup system
│   ├── ipc/        # IPC handlers
│   └── telegram/   # Telegram bot integration
├── renderer/       # React frontend
│   ├── pages/      # Main app pages
│   ├── components/ # Reusable UI components
│   ├── store/      # Zustand stores
│   └── i18n/       # Translation files
└── preload/        # Preload script (IPC bridge)
```

---

## Recent Changes

### v1.2.2 (2026-02-15) - Live Backup System & Stability Fix
**New Features:**
- 💾 **Live backup system** - Automatic continuous backups every 1 minute
- 📁 **Daily backup files** - Separate backup file for each day (format: fastfood-manager-backup-YYYY-MM-DD.db)
- 🔄 **Auto-retention** - Keeps last 7 days of backups, auto-deletes older ones
- 🛡️ **Data protection** - Prevents data loss if app crashes or PC turns off suddenly
- 📝 **Enhanced logging** - Comprehensive error logging for easier troubleshooting

**Bug Fixes:**
- 🐛 **CRITICAL**: Fixed app not opening in production builds (enhanced error handling)
- 🐛 Added comprehensive logging to main process for crash detection

**How Live Backup Works:**
- Creates initial backup on app start
- Updates today's backup file every 1 minute
- Creates new backup file each day
- On app shutdown, creates final backup
- Backups stored in: `%AppData%/fastfood-manager/backups/`
- Maximum data loss: 1 minute (though main DB is always current due to WAL mode)

**Technical:**
- `backup.ts`: New live backup system with WAL checkpoint
- `index.ts`: Enhanced error logging and backup integration
- Backup files include both .db and -wal files for extra safety

### v1.2.1 (2026-02-15) - Auto-Split Kitchen Tickets & Printer Management
**New Features:**
- 🎯 **Auto-split kitchen tickets by worker** - Automatically prints separate tickets for each worker
- 🖨️ **Advanced printer assignments** - Database foundation for worker-specific printer routing
- 🔄 **Smart fallback chain** - worker printer → kitchen_all → default (ensures printing always works)
- 📋 **Printer assignment repository** - Ready for UI configuration (coming soon)

**Bug Fixes:**
- 🐛 Fixed duplicate Windows startup entry preventing app launch
- 🐛 Removed incorrect dev path from auto-launch registry

**How Auto-Split Works:**
- When split_kitchen_tickets is enabled, orders automatically split by worker
- Each worker gets their own ticket printed to their assigned printer
- Falls back gracefully if no worker assigned or printer not configured
- Receipt printing always works - uses receipt printer or defaults

**Database:**
- Migration 009: printer_assignments table with assignment types (worker, receipt, kitchen_all, default)

**Technical:**
- `printer-assignments.repo.ts`: Repository with smart fallback logic
- `printer.ipc.ts`: Auto-split implementation with failsafes

### v1.2.0 (2026-02-15) - CRITICAL BUG FIXES
**Bug Fixes:**
- 🐛 **CRITICAL**: Fixed order timestamp using UTC instead of local time (orders showed 1 hour behind)
- 🐛 Fixed cancel confirmation dialog appearing behind Today's Orders modal

**Improvements:**
- 📝 Added DEVELOPMENT_LOG.md with mandatory update rules for AI assistants
- 📋 Context file now includes instructions for seamless chat transitions

**Technical Changes:**
- `orders.repo.ts`: Now explicitly sets `created_at` with local ISO time
- `OrderScreen.tsx`: Increased cancel modal z-index from 60 to 100

### v1.1.9 (2026-02-15)
**New Features:**
- ✅ Configurable order alert time (highlights old orders in red)
- ✅ Separate kitchen printer setting (independent from receipt printer)
- ✅ Worker-specific printer assignments
- ✅ Split kitchen tickets option per worker
- ✅ Receipt and kitchen ticket font size controls (small/medium/large)
- ✅ Start with Windows setting in Security tab (default ON)

**UI Improvements:**
- ✅ Expanded Today's Orders dialog (size: xl, max-height: 80vh)
- ✅ Order comments more prominent (orange text + 💬 icon)
- ✅ Enhanced table/phone field validation with animations
- ✅ Restaurant address on printed receipts

**Database Migrations:**
- Migration 006: `order_alert_minutes` setting (default 20)
- Migration 007: `receipt_font_size`, `kitchen_font_size` settings
- Migration 008: `workers.printer_name`, `kitchen_printer_name`, `split_kitchen_tickets`

**Files Modified:**
- `package.json` - Version bump to 1.1.9
- `src/main/index.ts` - Auto-launch logic
- `src/main/ipc/settings.ipc.ts` - Auto-launch IPC handlers
- `src/main/ipc/printer.ipc.ts` - Font size support
- `src/preload/index.ts` - Exposed auto-launch methods
- `src/renderer/src/pages/orders/OrderScreen.tsx` - Modal size, comments styling
- `src/renderer/src/pages/settings/SettingsPage.tsx` - Auto-launch UI
- Translation files (ar.json, en.json, fr.json) - New keys

---

## Known Issues

### 🐛 Active Bugs
(None currently - all known bugs fixed in v1.2.0)

### ✅ Recently Fixed
1. ✅ Order timer showing incorrect time (v1.2.0) - UTC vs local time issue
2. ✅ Cancel confirmation dialog z-index (v1.2.0)

---

## Pending Features (Backlog)

### High Priority
1. Remove repeated names in order item lists
2. Show items in Today's Orders for quick identification
3. Multiple printer support (assign different printers for different purposes)
4. Make client receipt bigger with larger text
5. Change cancel button UI (red X → green checkmark for done, allow undo)
6. Make table number required (like phone for delivery)

### Medium Priority
7. Fix spacing issues on small screens
8. Auto-complete for comments (remember previous comments)
9. Live timer in order list (counting up)
10. Visual alert badge for orders exceeding time threshold (vibrating effect)
11. Receipt appearance customization in settings

### Printer/Kitchen Features
12. Auto-split kitchen tickets per worker based on their menu categories
13. Worker-printer assignment system
14. Multiple simultaneous printer support

---

## Development Notes

### Building & Deployment
```bash
# Build for production
npm run package

# Output location
dist/FastFoodManager-Setup-{version}.exe

# GitHub Release required for auto-updates
gh release create v{version} --title "..." --notes "..." dist/*.exe dist/latest.yml
```

### Database Migrations
- Migrations are in `src/main/database/migrations/`
- Register new migrations in `src/main/database/migrations/index.ts`
- Migrations run automatically on app start

### IPC Communication
- Main → Renderer: `mainWindow.webContents.send('channel', data)`
- Renderer → Main: `window.api.{namespace}.{method}()`
- Add new IPC in: `src/main/ipc/{namespace}.ipc.ts`
- Expose in: `src/preload/index.ts`

### Translations
- Add keys to all 3 files: `ar.json`, `en.json`, `fr.json`
- Use: `t('key.path')` in React components

---

## Critical Settings

### Auto-Launch
- **Setting Key:** `auto_launch` (true/false)
- **Default:** Enabled
- **Location:** Settings → Security → Startup Settings

### Printer Settings
- **Receipt Printer:** `printer_name`
- **Kitchen Printer:** `kitchen_printer_name`
- **Receipt Font:** `receipt_font_size` (small/medium/large)
- **Kitchen Font:** `kitchen_font_size` (small/medium/large)
- **Split Tickets:** `split_kitchen_tickets` (true/false)
- **Auto-Print Receipt:** `auto_print_receipt`
- **Auto-Print Kitchen:** `auto_print_kitchen`

### Order Settings
- **Alert Time:** `order_alert_minutes` (default 20)
- Orders older than this are highlighted in red

---

## Troubleshooting

### Native Module Issues
If `better-sqlite3` fails:
```bash
npm run postinstall
# OR
electron-builder install-app-deps
```

### ELECTRON_RUN_AS_NODE Error
If running from VS Code terminal causes `electron.app` undefined:
```bash
unset ELECTRON_RUN_AS_NODE
```

---

## For AI Assistants / Future Development

**🚨 CRITICAL RULE:** When starting a new chat/session:
1. **ALWAYS create/update this DEVELOPMENT_LOG.md file** - Don't wait for user to ask
2. Read this file to understand current state
3. Check `package.json` for current version
4. Review pending features list above
5. Check git status for uncommitted changes

**After making changes:**
1. Always test builds before pushing releases
2. **UPDATE THIS FILE** with all changes made
3. Push code to GitHub
4. Create GitHub release for updates
5. Copy new build to `C:\Users\MahmoudBen\Desktop\FFM Final\`

**Last context:** v1.2.1 shipped with printer assignments foundation. Fixed startup registry bug. Full printer UI + auto-split features planned for v1.3.0.
