# Session Summary — April 22, 2026

## Portal — Group Channel Socket Handler Fixes (Chevron Menu Migration Completion)

**Problem:** Three socket event handlers in `portal/views/portal/layout.ejs` still referenced old floating action button variables and DOM selectors from before the WhatsApp-style chevron menu migration.

**Fixes applied:**
- `channel:message` handler: replaced stale `deleteBtn`, `editBtn`, `replyBtn`, `reactBtn` variables with `_gcMsgMeta[msg.id]` cache population + `_gcMenuBtnHtml(msg)` to build the chevron button; bubble HTML updated to use single `gc-msg-menu-btn`
- `channel:message:pin` handler: removed stale block that tried to find `.gc-msg-pin` button (no longer exists); pin state is now reflected by re-rendering the chevron menu on next open
- `channel:message:delete` handler: selector changed from `.gc-msg-delete` to `.gc-msg-menu-btn` for the tombstone cleanup

**Files changed:**
- `portal/views/portal/layout.ejs`

---

## Admin Hub — Info Board Page (`/admin/infoboard`)

Built the Info Board page in the new admin hub UI under the Communications section.

**Backend (`controllers/adminHubController.js`):**
- Added `infoboard()` method — queries all announcements with full user/role/org JOIN; renders with `section: 'comms'`, passes `userOrgId`, `canPost: true`, `canManage: true`

**Route (`routes/index.js`):**
- Added `GET /admin/infoboard` → `AdminHubController.infoboard`

**Page (`views/admin/infoboard.ejs`):**
- Stats toolbar: total posts, pinned count, local count, client count
- Two-column layout: **Local Team** (left, purple `#a855f7` accent, fully editable) | **Client Updates** (right, amber `#f59e0b` accent, read-only for local team)
- Collapsible compose panel toggled by `ibToggleCompose()`; always posts `audience: 'local'`
- Post cards: 3px left accent bar (coloured by column + pinned state), pinned badge, author name + role + org, relative timestamp
- Pin/Delete buttons shown only for own-org posts; client posts show org name + `ALL TEAMS` badge when `audience='all'`
- Entry animation `ibFadeIn`; toast notifications via `ibToast()`
- `ibPublish()`, `ibTogglePin()`, `ibDelete()` — all async, mutate DOM without page reload

**Updated (`views/admin/comms.ejs`):**
- Info Board card link: `/announcements` → `/admin/infoboard`

---

## Admin Hub — Google Drive Page (`/admin/drive`)

Built the Google Drive file browser in the new admin hub UI under the Tools section.

**Backend (`controllers/adminHubController.js`):**
- Added `drive()` method — uses existing `GoogleDriveService` (`getUserFolder`, `isInsideFolder`, `listFiles`, `getBreadcrumb`); validates subfolder ownership; renders `admin/drive` with `section: 'tools'`, files, breadcrumb, `maxSizeMB` (100 for admin/manager, 10 others), `isRoot` flag

**Route (`routes/index.js`):**
- Added `GET /admin/drive` → `AdminHubController.drive`

**Page (`views/admin/drive.ejs`):**
- CSS: `drv-*` prefix, uses `--adm-*` variables; file type icon colour coding (folder=amber, image=pink, pdf=red, doc=blue, sheet=green, video=purple, audio=cyan, archive=gray)
- Topbar: section pill + title + subtitle (left), **← Tools** back button (right)
- Breadcrumb navigation: root + subfolders; all folder navigation uses `/admin/drive?folder=xxx`
- Context menu (`.drv-ctx-menu`): Open, Download, Rename, Delete per item
- Drag-and-drop upload zone + manual upload with progress bar
- New Folder modal + Rename modal
- All file API calls unchanged: `/drive/files`, `/drive/upload`, `/drive/folder`, `/drive/rename/:fileId`, `/drive/:fileId` (DELETE), `/drive/download/:fileId`

**Updated (`views/admin/tools.ejs`):**
- Google Drive card link: `/drive` → `/admin/drive`

---

## Admin Hub — Help Center Page (`/admin/helpcenter`)

Built a topic launcher Help Center page in the new admin hub UI under the Tools section.

**Backend (`controllers/adminHubController.js`):**
- Added `helpcenter()` method — passes `role`, `isAdmin`, `isManager` flags, `activeTopic` from query param; renders `admin/helpcenter` with `section: 'tools'`

**Route (`routes/index.js`):**
- Added `GET /admin/helpcenter` → `AdminHubController.helpcenter`

**Page (`views/admin/helpcenter.ejs`):**
- Design decision: launcher page rather than duplicating the 2200-line classic help page — each card opens `/help?topic=xxx` in a new tab; "Open Full Docs" banner at the bottom
- Live search: `hcFilter()` uses `data-hidden` attribute to show/hide cards in real time
- Four sections: Getting Started (3 cards), Tasks & Work (5 cards), Communication (4 cards), Team & System (6 cards — last section gated to `isAdmin`)
- Each card has `--hc-accent` and `--hc-rgb` CSS custom properties for per-card colour theming
- `← Tools` back button in topbar

**Updated (`views/admin/tools.ejs`):**
- Help Center card link: `/help` → `/admin/helpcenter`

---

## Admin Hub — Backup Page (`/admin/backup`)

Built the full Backup management page in the new admin hub UI under the Tools section (LOCAL_ADMIN only).

**Backend (`controllers/adminHubController.js`):**
- Added `backupService` import at file top
- Added `backup()` method — calls `backupService.getBackupLogs(page, 20)` + `backupService.getSettings()`; renders `admin/backup` with `section: 'tools'`, `pagination` object

**Route (`routes/index.js`):**
- Added `GET /admin/backup` → `AdminHubController.backup`

**Page (`views/admin/backup.ejs`):**
- CSS: `bkp-*` prefix, uses `--adm-*` variables
- Three-column top grid: Schedule config card (enable/disable, time, interval select, Save/Disable buttons) | Total Backups stat tile | Create/Restore action tiles
- Status badges: `bkp-status` (success=green, failed=red, restored=blue, restoring=amber); `bkp-type-badge` (scheduled=blue, manual=gray)
- Google Drive restore section: Load from Drive button → renders drive backup list → Restore from Drive
- Paginated backup history table; pagination links use `/admin/backup?page=xxx`
- All backup API endpoints unchanged: `/backups/create`, `/backups/restore/:id`, `/backups/settings`, `/backups/upload-drive/:id`, `/backups/drive-list`, `/backups/restore-drive`, `/backups/download/:id`, `/backups/:id` (DELETE)
- `bkpCreate`, `bkpRestore`, `bkpDelete`, `bkpSaveSchedule`, `bkpDisableSchedule`, `bkpUploadDrive`, `bkpLoadDrive`, `bkpRestoreFromDrive`, `bkpUploadRestore` — all async with double-confirm dialogs preserved
- `← Tools` back button in topbar

**Updated (`views/admin/tools.ejs`):**
- Backup card link: `/backup` → `/admin/backup`

---

## Summary of Files Changed

**Modified:**
- `controllers/adminHubController.js` — added `backupService` import; added `infoboard`, `drive`, `helpcenter`, `backup` methods
- `routes/index.js` — 4 new admin hub routes
- `views/admin/comms.ejs` — info board card link updated
- `views/admin/tools.ejs` — all three card links updated
- `portal/views/portal/layout.ejs` — socket handler fixes

**New:**
- `views/admin/infoboard.ejs`
- `views/admin/drive.ejs`
- `views/admin/helpcenter.ejs`
- `views/admin/backup.ejs`
