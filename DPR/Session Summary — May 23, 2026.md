# Session Summary — May 23, 2026

## Focus
Admin hub help center navigation fix, full Downloads Portal feature (both LOCAL and CLIENT sides, hybrid disk+Drive storage, background upload, daily cleanup cron), and Downloads documentation added to all three help center files.

---

## Admin Hub Help Center Fix

**Files:** `controllers/adminHubController.js`, `routes/index.js`, `views/help/index.ejs`, `views/admin/helpcenter.ejs`

Clicking any help card from the Admin Hub opened the old classic UI, and topics didn't render.

**Root cause:** All 20 card `href` values pointed to `/help?topic=...` — the classic route — instead of `/admin/help`. The `/admin/help` route also didn't exist.

**Fix:**
- Added `helpFull` method to `AdminHubController` that renders `views/help/index.ejs` with `layout: 'admin/layout'` and an `adminHub: true` flag.
- Added route `GET /admin/help → AdminHubController.helpFull` in `routes/index.js`.
- Added a CSS variable bridge at the top of `views/help/index.ejs`: maps `--tf-*` (classic) → `--adm-*` (admin hub) inside an `<% if (adminHub) { %>` block. Also overrides `.help-container` height for the admin hub chrome.
- Updated all 20 card `href` values in `helpcenter.ejs` from `/help?topic=` to `/admin/help?topic=`.

---

## Downloads Portal — Full Feature Build

### Database Schema

**`migrations/061_downloads_2026-05-23.sql`**
Initial `downloads` table. Key columns: `name`, `description`, `version`, `original_name`, `stored_name`, `drive_file_id`, `file_size`, `mime_type`, `uploaded_by` (`INT UNSIGNED` — matches `users.id`), `uploader_name`, `uploader_side` (`'LOCAL'`/`'CLIENT'`), `download_count`, `is_disabled`, `created_at`.

FK type mismatch (`INT` vs `INT UNSIGNED`) caused migration failure. Fixed by changing `uploaded_by` to `INT UNSIGNED NOT NULL`. Had to manually DELETE the failed record from `_migrations` table (not `migrations`).

**`migrations/062_downloads_drive_2026-05-23.sql`**
Changed `stored_name` column → `drive_file_id VARCHAR(255) NOT NULL` (intermediate step).

**`migrations/063_downloads_hybrid_2026-05-23.sql`**
Final hybrid schema: renamed `drive_file_id` back to `stored_name NULL`, added separate `drive_file_id VARCHAR(255) NULL` column. Both columns can exist simultaneously — `stored_name` holds the local disk filename, `drive_file_id` holds the Google Drive file ID.

---

### Model

**`models/Download.js`**

| Method | Purpose |
|--------|---------|
| `getAll(search)` | List all files, optional search on name/description/uploader_name |
| `getById(id)` | Single record by id |
| `create(data)` | Insert new record with `drive_file_id = NULL` |
| `update(id, data)` | Update name/description/version |
| `updateDriveId(id, driveFileId)` | Set `drive_file_id` once Drive upload completes |
| `clearLocalFile(id)` | Set `stored_name = NULL` after local copy deleted by cron |
| `delete(id)` | Delete record, returns `{ stored_name, drive_file_id }` for cleanup |
| `toggleDisabled(id)` | Flip `is_disabled`, return new state |
| `incrementDownload(id)` | Bump `download_count` |
| `getPendingLocalCleanup()` | `drive_file_id NOT NULL AND stored_name NOT NULL AND created_at <= NOW() - INTERVAL 1 DAY` |
| `getPendingDriveUpload()` | `drive_file_id IS NULL AND stored_name NOT NULL` (retry candidates) |

---

### Google Drive Service Extension

**`services/googleDriveService.js`**

- `getDownloadsFolder()` — gets or creates a `downloads` sub-folder under `ROOT_FOLDER_ID` (`TMS_FOLDER_ID` env var). Caches folder ID in module-level variable.
- `uploadDownloadFile(filePath, originalName, mimeType)` — streams file from disk to the downloads folder using `fs.createReadStream`. Returns `{ id, name }`.

---

### LOCAL Side Controller

**`controllers/downloadController.js`**

`CAN_UPLOAD = ['LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN']`

Multer: diskStorage to `uploads/downloads/`, 500 MB limit.

| Method | Route | Notes |
|--------|-------|-------|
| `index` | `GET /admin/downloads` | Renders table; passes `canUpload`, `isAdmin` (LOCAL_ADMIN only), `userId` |
| `uploadPage` | `GET /admin/downloads/upload` | CAN_UPLOAD gate |
| `handleUpload` | `POST /admin/downloads/upload` | Saves to disk → creates DB record → `res.json({success:true})` → `setImmediate(() => uploadToDriveInBackground(...))` |
| `serveFile` | `GET /admin/downloads/:id/download` | Local disk first (`fs.existsSync`), falls back to `GoogleDriveService.downloadFile()`. `incrementDownload` always called. Disabled files blocked unless LOCAL_ADMIN. |
| `update` | `PUT /admin/downloads/:id` | Own file or LOCAL_ADMIN |
| `remove` | `DELETE /admin/downloads/:id` | Own file or LOCAL_ADMIN; deletes local file + Drive file |
| `toggle` | `PATCH /admin/downloads/:id/toggle` | LOCAL_ADMIN only; flips `is_disabled` |

Background upload pattern: `uploadToDriveInBackground(downloadId, filePath, originalName, mimeType)` — tries Drive upload, on success calls `Download.updateDriveId`. On failure logs error; local file stays on disk for cron retry.

---

### CLIENT/Portal Controller

**`portal/controllers/downloadController.js`**

Same hybrid pattern. `CAN_UPLOAD = ['CLIENT_ADMIN']`. No `toggle` method (CLIENT_ADMIN cannot disable files). `serveFile` blocks disabled files for all portal users (no admin bypass).

Routes in `portal/routes/portal.js`: same pattern, guarded by `requireRoles('CLIENT_ADMIN')` for upload/edit/delete.

---

### Views

**`views/admin/downloads.ejs`** — Admin hub dark-theme table:
- Columns: file type icon + name (+ version badge + Disabled chip), description, uploader + date, size, download count
- `text-align: left` on `thead th` (fix for default center alignment)
- Live search (JS, filters rows client-side)
- Edit button → inline modal for name/description/version
- Delete button → fade-out row on confirm
- Toggle disable button (admin only) — toggles Disabled chip and row opacity
- Upload button visible only when `canUpload`

**`views/admin/downloads-upload.ejs`** — Drag-and-drop zone:
- File icon preview on selection
- Name (required), Description, Version fields
- XHR upload with progress bar; at 100% switches label to "Saving to Drive…" and button text to "Processing…" — decouples browser-to-server progress from the background Drive upload

**`portal/views/portal/downloads.ejs`** — Card grid layout (not table):
- Each file is a card with icon, name, version badge, description, uploader, size, download count
- Edit/Delete only shown when `canUpload && f.uploaded_by === userId`
- Disabled files show Disabled chip and Download button is removed

**`portal/views/portal/downloads-upload.ejs`** — Same drag-drop UX as admin side; same "Saving to Drive…" label switch at 100%.

---

### Navigation

**`views/admin/layout.ejs`** — Downloads link added to `LOCAL_USER` sidebar block (between Notes and Help).

**`views/admin/tools.ejs`** — Downloads card added for admin/manager (between Google Drive and Help Center). `--card-accent:#6366f1` (indigo).

**`portal/views/portal/layout.ejs`** — Downloads nav item added in sidebar.

---

### Cron Job

**`utils/cronJobs.js`** — Added daily `0 3 * * *` job (3 AM Eastern):

1. **Local cleanup** — `Download.getPendingLocalCleanup()` → for each: `fs.unlink` local file → `Download.clearLocalFile(id)`. Files that have been on Drive for ≥1 day are safe to remove.
2. **Drive retry** — `Download.getPendingDriveUpload()` → for each: calls `GoogleDriveService.uploadDownloadFile` → `Download.updateDriveId`. Retries any uploads that failed during the initial background attempt.

Added `path` and `fs` requires at the top of `cronJobs.js`.

---

## Help Center — Downloads Documentation

### `views/help/index.ejs`
- Added "Downloads" nav item under Storage section (after Google Drive)
- Added full `id="topic-downloads"` block covering: who can do what, 5-step upload flow (including "Saving to Drive…" label explanation), 3-step download flow, edit/delete own files, admin disable/enable, callout explaining hybrid storage (server → Drive → cleanup after 1 day)

### `views/admin/helpcenter.ejs`
- Added new "Downloads" section with a card visible to `isAdmin || isManager`, linking to `/admin/help?topic=downloads`

### `portal/views/portal/help.ejs`
- Added "Downloads" nav item in Features section (all portal users)
- Added `id="section-downloads"` block covering: who can do what, download steps, upload steps (CLIENT_ADMIN only — conditionally rendered), edit/delete own uploads, note about disabled files

---

## Files Changed

| File | Change |
|------|--------|
| `controllers/adminHubController.js` | Added `helpFull` method |
| `controllers/downloadController.js` | New — full LOCAL download controller (hybrid storage) |
| `portal/controllers/downloadController.js` | New — full CLIENT download controller |
| `models/Download.js` | New — full Download model |
| `services/googleDriveService.js` | Added `getDownloadsFolder`, `uploadDownloadFile` |
| `utils/cronJobs.js` | Added daily 3 AM download cleanup + Drive retry cron |
| `routes/index.js` | Added `/admin/help` route; all admin download routes |
| `portal/routes/portal.js` | All portal download routes |
| `migrations/061_downloads_2026-05-23.sql` | New — downloads table |
| `migrations/062_downloads_drive_2026-05-23.sql` | New — drive_file_id column |
| `migrations/063_downloads_hybrid_2026-05-23.sql` | New — hybrid schema (stored_name + drive_file_id) |
| `views/help/index.ejs` | CSS variable bridge for admin hub; Downloads nav + topic block |
| `views/admin/helpcenter.ejs` | All 20 card hrefs fixed to `/admin/help?topic=`; Downloads card added |
| `views/admin/downloads.ejs` | New — downloads list page (dark theme table) |
| `views/admin/downloads-upload.ejs` | New — upload page with drag-drop and progress |
| `views/admin/layout.ejs` | Downloads link in LOCAL_USER sidebar block |
| `views/admin/tools.ejs` | Downloads card added |
| `portal/views/portal/downloads.ejs` | New — portal downloads list (card grid) |
| `portal/views/portal/downloads-upload.ejs` | New — portal upload page |
| `portal/views/portal/layout.ejs` | Downloads nav item added |
| `portal/views/portal/help.ejs` | Downloads nav item + section block |
