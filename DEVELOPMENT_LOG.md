# Fast Food Manager - Development Log

**Current Version:** 1.4.5
**Last Updated:** 2026-02-25
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
│   ├── utils/      # removeRepeatedPrefix helper
│   └── i18n/       # Translation files
└── preload/        # Preload script (IPC bridge)
```

---

## Recent Changes

### v1.4.5 (2026-02-25) - Fix Auto-Update Infinite Loop
**Bug Fix:**
- **Fixed auto-update infinite loop** — After downloading an update and clicking "Restart Now", the app would close but the new version would not launch. Manually reopening the app showed the old version, which would detect the same update again, creating an endless loop.
- **Root cause**: `autoUpdater.autoInstallOnAppQuit = true` was set alongside explicit `quitAndInstall()` calls, causing TWO NSIS installer instances to conflict. One would try to install via the `before-quit` event, the other via `quitAndInstall()`. The conflict caused the installer to silently fail, leaving the old version intact.
- **Fix in `src/main/index.ts`**:
  1. Set `autoUpdater.autoInstallOnAppQuit = false` — eliminates the race condition
  2. In the `updater:install` IPC handler, destroy all BrowserWindows before calling `quitAndInstall()` — releases file locks on `app.asar` so NSIS can replace the files
  3. Added 800ms delay after window destruction before calling `quitAndInstall(true, true)` — gives GPU/renderer child processes time to fully terminate

### v1.4.4 (2026-02-25) - Stock Keyboard, Worker Categories, Alert Quick-Pick
**Fixes:**
- Wired virtual keyboard into Stock Management — form modal (name, name_ar, name_fr, price, threshold) and adjustment modal (quantity, price, reason)
- Enlarged Stock Management table row height and action buttons for touchscreen
- Enlarged Stock Management tab buttons for touchscreen
- Worker form: category assignment buttons now much larger with borders in touchscreen mode (easy to tap)
- Order Alert Time: replaced virtual keyboard with quick-pick preset buttons (5/10/15/20/25/30/45/60/90/120 min) — no more covered input issue

### v1.4.3 (2026-02-24) - Touchscreen Polish & Telegram Keyboard
**Fixes:**
- Enlarged cart item pen (edit price) and comment buttons for touchscreen
- Enlarged order detail buttons (Edit, Done, Cancel Order, Print Receipt/Kitchen) for touch
- Fixed virtual keyboard covering input fields — now auto-scrolls active input into view
- Wired virtual keyboard into Telegram Bot Settings (token + chat ID inputs)
- Enlarged checkboxes in Telegram settings for touch mode

### v1.4.2 (2026-02-24) - Deep Touchscreen Fixes
**Critical:**
- **Hard Reset Logout** — Settings logout now clears `activation_status` (requires re-entering activation code)
- Removed redundant preview bar from VirtualKeyboard (was exposing passwords in plain text)
- Added DONE button to numpad layout

**Virtual Keyboard Wired Into:**
- Settings page: all General tab inputs (name, phones, address, currency symbol, alert minutes)
- Settings page: all Security tab inputs (change password, logout password) — all PIN-only numeric
- Worker Management: form modal (name, pay full/half, phone)
- Menu Management: search bar + form modal (name, name_ar, name_fr, price)

**Touch Fixes:**
- Fixed hover-dependent edit/delete buttons in WorkerManagement, MenuManagement, CategorySetup (always visible in touch mode)
- Enlarged attendance shift buttons, settings tab buttons, checkboxes for touchscreen

### v1.4.1 (2026-02-24) - Virtual Keyboard Everywhere
**Fixes:**
- Wired virtual keyboard into PasswordGate (admin login)
- Wired virtual keyboard into Setup Wizard steps (AdminPassword, RestaurantInfo)
- Wired virtual keyboard into OrderScreen modals (notes, price edit, history search)
- Made admin password PIN-only (numeric digits only, `inputMode="numeric"`)
- Enlarged header buttons (Today's Orders, dark mode, Admin) in touchscreen mode
- Added decimal point key to numpad
- Added touch scrolling CSS (`-webkit-overflow-scrolling: touch`)

### v1.4.0 (2026-02-23) - Touchscreen Mode
**Major Feature:**
- **Touchscreen Mode** — Full touchscreen support for restaurant kiosks
- Setup wizard: new "Input Mode" step (Keyboard & Mouse vs Touchscreen)
- `inputMode` setting stored in DB, accessible via `useAppStore()`
- **VirtualKeyboard component** — On-screen keyboard with numpad + QWERTY modes
- **OrderScreen category grid** — Touch-first category navigation (big cards → items grid)
- **Enlarged cart sidebar** — Bigger buttons, quantity controls, order type buttons
- Settings page: toggle between Keyboard/Touchscreen mode

### v1.3.1 (2026-02-22) - Bug Fixes
**Fixes:**
- Fixed doubled kitchen printing issue
- Fixed auto-update detection (electron-updater requires latest.yml in release)
- Fixed logo display in renderer (file:/// protocol with app-image:// fallback)
- Added order search in Today's Orders

### v1.3.0 (2026-02-20) - Order History & Analytics Improvements
**Features:**
- Enhanced order history with search and filtering
- Improved analytics dashboard
- Better receipt formatting

### v1.2.7 (2026-02-16) - Animated Professional Splash Screen
**Improvements:**
- 🎨 **REDESIGNED Splash Screen** - Professional animated splash with no image files needed!
  - Scattering food emojis animation (🍔🍕🍟🌭 etc.)
  - Logo pop-up or bold restaurant name display
  - "Fast Food Manager" app name animation
  - "Welcome to [Restaurant Name]" text with smooth transitions
  - Beautiful gradient background (orange-600 → orange-500 → amber-500)
  - Animated blob elements in background
  - 3:2 rounded corner window (600x400px)
  - Total duration: ~4 seconds with smooth stage transitions

**Technical:**
- `SplashScreen.tsx`: Complete rewrite with pure CSS animations
- No external images required - all animations are programmatic
- Stages: emoji scatter (0.8s) → logo/name (1.2s) → welcome text (1.5s) → fade out
- Uses logo from settings if available, otherwise shows restaurant name in bold

### v1.2.6 (2026-02-16) - Kitchen Splitting, UX Improvements & Splash Screen
**New Features:**
- 🎨 **Splash Screen** - Beautiful welcome screen with 3 customizable images (3:2 ratio)
- 👨‍🍳 **Worker-Specific Kitchen Tickets** - Each worker now gets their own ticket with ONLY their items
- 👆 **Visual Click Feedback** - Menu items now have satisfying scale+highlight effect when clicked

**Bug Fixes:**
- 🐛 **CRITICAL**: Fixed kitchen tickets printing same items twice instead of splitting by worker
- 🐛 Fixed Start with Windows defaulting to OFF (now defaults to ON and persists correctly)

**Improvements:**
- ✨ Kitchen tickets now display worker name badge: "FOR: WORKER NAME"
- ✨ Menu item buttons have active:scale-95 + orange highlight effect
- ✨ Splash screen shows restaurant name and transitions smoothly
- ✨ Auto-launch setting now reads from database with proper default

**Technical:**
- `printer-assignments.repo.ts`: Updated getPrinterForWorker to check workers.printer_name first
- `printer.ipc.ts`: Split tickets now fetch worker info and pass to ticket template
- `OrderScreen.tsx`: Added active:scale-95 and active:bg-orange-50/200 classes to all menu buttons
- `settings.ipc.ts`: getAutoLaunch now reads from database (default true)
- `SplashScreen.tsx`: New component with 2.5s per image, smooth transitions
- `App.tsx`: Integrated splash screen before main app loads

**Splash Screen Setup:**
- Place 3 images (3:2 ratio) in `public/splash/` folder:
  - `splash-1.png`
  - `splash-2.png`
  - `splash-3.png`
- Images show for 2.5 seconds each with smooth animations
- Shows restaurant name from settings

### v1.2.5 (2026-02-15) - Critical UI/UX Fixes
**Bug Fixes:**
- 🐛 **CRITICAL**: Fixed orders counter showing "{{count}}" template text instead of actual number
- 🐛 **CRITICAL**: Fixed Save button not saving worker printer assignments

**Technical:**
- `OrdersHistory.tsx`: Added count parameter to `t('orders.ordersFound')` translation
- `workers.repo.ts`: Added `printer_name` field to UPDATE query (was missing from v1.2.4)

### v1.2.4 (2026-02-15) - UI Improvements & Worker Printer Assignment
**New Features:**
- 🖨️ **Worker Printer Assignment UI** - Complete UI for assigning printers to specific workers
- 📊 **Live Backup Status UI** - Replaced confusing scheduled backup UI with clear live backup status

**Improvements:**
- ✨ Top Selling Items chart now uses simplified names (removes repeated prefixes)
- ✨ Increased Y-axis width from 100px to 140px for better readability
- ✨ Truncates long item names to 20 characters with "..." suffix
- ✨ Live backup status shows: Active indicator, location, 7-day retention

**UI Changes:**
- Removed scheduled backup time settings (replaced with live backup info)
- Added worker printer assignment dropdowns in Settings → Printer tab
- Improved analytics chart text readability

**Technical:**
- `BackupRestore.tsx`: Replaced scheduled backup card with Live Backup Status
- `SettingsPage.tsx`: Added worker printer assignment UI with state management
- `AnalyticsDashboard.tsx`: Integrated removeRepeatedPrefix for chart names (40% threshold)

### v1.2.3 (2026-02-15) - Menu Display Fixes
**Bug Fixes:**
- 🐛 **CRITICAL**: Fixed repeated word removal not working for Pizza items
- 🐛 Fixed repeated word removal not working in "All" section
- 🐛 Fixed grouped items (size variants) not using simplified names

**Improvements:**
- ✨ Per-category prefix detection even in "All" view
- ✨ Lowered detection threshold from 60% to 50% for better accuracy
- ✨ Simplified names now apply to grouped items (Pizza XL/L/M, etc.)

**How It Works Now:**
- Groups items by category first, then processes each category separately
- Works correctly in "All" view (e.g., removes "Sandwich" from all sandwiches, "Pizza" from all pizzas)
- Grouped size variants also get simplified names
- Example: "Pizza Margherita XL/L/M" → "Margherita XL/L/M" (not "Pizza Margherita XL/L/M")

**Technical:**
- `OrderScreen.tsx`: Per-category simplified name processing with 50% threshold
- `getSimplifiedBaseName()`: New helper for grouped item name simplification

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

**🚨 MANDATORY WORKFLOW — EVERY SESSION, EVERY CHANGE:**

### On Session Start:
1. **READ this DEVELOPMENT_LOG.md** to understand current state
2. Check `package.json` for current version
3. Check git status for uncommitted changes

### After EVERY Code Change (no exceptions):
1. Bump version in `package.json` (patch: 1.4.x → 1.4.x+1)
2. `npm run build` to compile
3. `npx electron-builder --win nsis` to build installer
4. Move old `.exe` + `latest.yml` to `FFM Final/old/`
5. Copy new `.exe` + `latest.yml` to `C:\Users\MahmoudBen\Desktop\Fastfood Manager\FFM Final\`
6. **UPDATE THIS FILE** — add a new version entry under "Recent Changes"
7. `git add -A && git commit -m "v{version}: {summary}"`
8. `git tag v{version} && git push origin main --tags`
9. `gh release create v{version} dist/FastFoodManager-Setup-{version}.exe dist/latest.yml --title "v{version}" --notes "..."`

### This File Must Always Be:
- Current version in the header
- New version entry at the top of "Recent Changes" with what changed and why
- "Last context" updated at the bottom

**Last context:** v1.4.4 deployed. Stock Management now has full virtual keyboard support. Worker category assignment buttons enlarged for touch. Order Alert Time uses quick-pick preset buttons (5-120 min) instead of keyboard to avoid covering the input. All touchscreen flows are now complete across OrderScreen, Settings, Workers, Menu, Stock, Telegram, PasswordGate, Setup Wizard.
