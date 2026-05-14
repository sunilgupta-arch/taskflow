# Session Summary — May 14, 2026

## Focus
Client request queue — full workflow: approve/reject, reschedule, status visibility, filters, email notifications, daily report.

---

## Email Service — Credential Fix and Confirmed Working

### Problem
`MAIL_USER` in `.env` was set to `srvicea@123cfc.com` (typo — missing 'i'). All SMTP attempts failed with "535-5.7.8 Username and Password not accepted" because the email didn't match the actual Google account.

### Root Cause
The App Password is bound to the exact account. A one-character difference in the username causes authentication to fail with no hint that it's a typo.

### Fix
Corrected `.env` → `MAIL_USER=servicea@123cfc.com`, updated `MAIL_PASS` with fresh App Password `eebh apbq eyjq hith`.

### Result
Test email confirmed delivered to rshekhar21@123cfc.com with sender name "TaskFlow". ✓

**Note:** `services/emailService.js` supports OAuth2 (via `GMAIL_REFRESH_TOKEN`) as primary and App Password as fallback. The `GDRIVE_CLIENT_ID/SECRET` vars are reused for OAuth2 since those are the only valid Desktop Client credentials in `.env`.

---

## Queue Filter — Clickable Stat Cards (New Admin Hub UI Only)

**`views/admin/queue.ejs`**

- Each stat box (Total, Open, In Progress, Done, Missed, Cancelled) gets `data-filter` + `onclick="admqSetFilter(...)"`.
- `_activeFilter` global tracks current filter. `null` = show all.
- `admqSetFilter(key)` — toggles filter (clicking same card clears it; clicking Total always clears).
- `admqSyncStatActiveState()` — adds `active` class to selected card, dims others to 40% via `has-filter` + CSS on siblings.
- `admqApplyFilter()` — shows/hides `<tr>` by matching `row-{status}` class.
- Filter resets automatically on date navigation.

---

## Client Request — Approve / Reject Workflow

### Database (Migration 053)
```sql
ALTER TABLE client_request_instances
  ADD COLUMN approved_by INT UNSIGNED NULL,
  ADD COLUMN approved_at DATETIME NULL,
  ADD COLUMN rejected_by INT UNSIGNED NULL,
  ADD COLUMN rejected_at DATETIME NULL;
-- Also added 'approved', 'rejected' to status ENUM
```

### Model (`models/ClientRequest.js`)
- `approveInstance(instanceId, userId)` — sets `status='approved'`, `approved_by`, `approved_at`. Validates existing status must be `done`.
- `rejectInstance(instanceId, userId)` — sets `status='rejected'`, clears `picked_by/at`, `completed_by/at`. Resets instance for local staff to redo. Validates existing status must be `done`.
- `getDateStats()` — added `approved: 0, rejected: 0` to stats object.
- `pick()` — now allows picking from `['open', 'missed', 'rejected']` (so rejected tasks can be re-picked).

### Portal Controller (`portal/controllers/clientRequestController.js`)
- `approveInstance` — validates org + creator ownership, calls model, emits `queue:updated` socket event.
- `rejectInstance` — same validation, calls model, adds comment `"Rejected: [reason]"` (or default message), emits socket event.

### Portal Routes (`portal/routes/portal.js`)
```js
router.patch('/requests/instances/:id/approve', ClientRequestController.approveInstance);
router.patch('/requests/instances/:id/reject', ClientRequestController.rejectInstance);
```

### Portal View (`portal/views/portal/requests.ejs`)
- `statusBadge(s, rescheduledTo)` updated with `approved`, `rejected`, `rescheduled` cases.
- Approve / Reject buttons shown inline under Done badge when `inst.status === 'done' && inst.created_by === CURRENT_USER_ID`.
- `#rejectReasonModal` — Bootstrap modal with textarea for reason. `preqReject(id)` opens it; `preqConfirmReject()` sends reason.
- Stats bar shows approved count.

### Local Queue View (`views/admin/queue.ejs`)
- CSS: `s-approved` (green), `s-rejected` (rose `#f43f5e`), row border colours.
- `statusHtml` labels updated: `approved:'Approved ✓'`, `rejected:'Rejected ✗'`.
- `buildRow`: Re-pick button shown for `rejected` status.

---

## Done Button Fix — Skip Modal if Comment Exists

**Problem:** Clicking Done always opened the comment modal, even if a comment had already been added.

### Controller fix (`controllers/clientQueueController.js`)
```js
const trimmedRemark = (remark || '').trim();
if (!trimmedRemark) {
  const existingComments = await ClientRequest.getComments(instanceId);
  if (!existingComments.length) return ApiResponse.error(res, 'A completion remark is required', 400);
}
await ClientRequest.complete(instanceId, req.user.id);
if (trimmedRemark) await ClientRequest.addComment(instanceId, req.user.id, trimmedRemark);
```

### View fix (`views/admin/queue.ejs`)
- `_loadedInstances` stored globally in `renderTable()`.
- `admqDone(id)` looks up instance in `_loadedInstances`. If `latest_comment` already exists, auto-submits without opening modal.

---

## Reschedule Request Feature

### Database (Migration 054)
```sql
ALTER TABLE client_request_instances
  ADD COLUMN rescheduled_to DATE NULL,
  ADD COLUMN rescheduled_by INT UNSIGNED NULL,
  ADD COLUMN rescheduled_instance_id INT UNSIGNED NULL;
-- Also added 'rescheduled' to status ENUM
```

### Database (Migration 055)
```sql
ALTER TABLE client_request_instances
  ADD COLUMN assigned_to INT UNSIGNED NULL DEFAULT NULL;
-- FK to users(id) ON DELETE SET NULL
```
Allows instance-level assignee override (used for rescheduled instances).

### Model (`models/ClientRequest.js`)
- `rescheduleInstance(instanceId, userId, newDate, reason, assignedTo)`:
  - Validates status is `open`.
  - Inserts new instance for `newDate` with `assigned_to`.
  - Sets original to `status='rescheduled'`, `rescheduled_to`, `rescheduled_by`, `rescheduled_instance_id`.
  - Adds comment `"Rescheduled to {date}: {reason}"` so both sides can see it.
- `getLocalUsers()` — filtered to `IN ('LOCAL_USER', 'LOCAL_MANAGER')` only (excludes admins).
- `getQueueForDate()` — added `COALESCE(cri.assigned_to, cr.assigned_to) as effective_assigned_to` and `COALESCE(instanceAssignee.name, defaultAssignee.name) as effective_assigned_to_name`.
- `autoMarkMissed` only marks `open` instances — rescheduled instances are not affected.

### Controller (`controllers/clientQueueController.js`)
- `reschedule()` — validates `new_date` (must be future), `reason` (required), extracts optional `assigned_to`. Sends reschedule email if creator has `@123cfc.com` email.

### Route (`routes/index.js`)
```js
router.post('/queue/:id/reschedule', authenticate, ClientQueueController.reschedule);
```

### Local Queue View (`views/admin/queue.ejs`)
- CSS: `s-rescheduled` (purple `#8b5cf6`), `row-rescheduled` (opacity 0.6, purple left border).
- `statusHtml` label: `rescheduled: 'Rescheduled'`.
- Calendar+ button (`bi-calendar-plus`) shown on open rows for all users.
- `#admqRescheduleModal` — date input (min=tomorrow), Assign To dropdown (populated from `_localUsers`), reason textarea.
- `admqOpenReschedule(id)` — populates dropdown from `_localUsers`, pre-selects `effective_assigned_to` of the instance.
- `admqConfirmReschedule()` — POSTs `{ new_date, reason, assigned_to }`.
- Reschedule modal added to teleport list to avoid overflow clipping.

### Portal View (`portal/views/portal/requests.ejs`)
- `statusBadge` shows `"Rescheduled → [date]"` using `rescheduled_to`.
- All `statusBadge` calls updated to pass `inst.rescheduled_to`.

---

## Reschedule Email Notification

**`services/emailService.js`** — new `requestRescheduled` template:
- Subject: `Your request has been rescheduled: {title}`
- Body: creator name, request title, new date, rescheduled by, reason.

**`controllers/clientQueueController.js`** — after successful reschedule:
```js
if (instance.creator_email && instance.creator_email.endsWith('@123cfc.com')) {
  EmailService.send({ to: instance.creator_email, templateName: 'requestRescheduled', ... });
}
```

**`models/ClientRequest.js` — `getInstanceById`:** Added `creator.email as creator_email`.

---

## Rescheduled Stat Card

**`models/ClientRequest.js` — `getDateStats()`:**
- Added `rescheduled: 0` to defaults.
- Rescheduled excluded from `total` (same treatment as cancelled).

**`views/admin/queue.ejs` — `renderStats()`:**
- Purple Rescheduled card added (only shown when count > 0), uses existing `admqSetFilter` / `row-rescheduled` filter pipeline.

---

## Queue Table — Horizontal Scroll

**`views/admin/queue.ejs`**
```css
.admq-table-wrap { overflow-x: auto; overflow-y: hidden; }
.admq-table-wrap::-webkit-scrollbar { height: 6px; }
.admq-table-wrap::-webkit-scrollbar-thumb { background: var(--adm-border); border-radius: 3px; }
.admq-table { min-width: 860px; }
```
Replaced `overflow: hidden` — table now scrolls horizontally on narrow screens with a dark-themed thin scrollbar.

---

## Daily Requests Report — Midnight Email

### Template (`services/emailService.js` — `dailyRequestsReport`)
Full-width email using `wrapHtmlFull()` (100% width, `min-width: 648px`, table-based layout):
- Stat cards row: Total, Done, In Progress, Open, Missed, Rescheduled — each `width:16.6%`, `table-layout:fixed`.
- Request table: #, Request (title + description snippet), Created By, Status (colour badge), Priority, Handled By, Latest Comment.
- Ordered: open → picked → missed → rescheduled → done → approved → rejected → cancelled.

### Cron Job (`utils/cronJobs.js` — `dailyRequestsReportHandler`)
- Runs at `0 0 * * *` (midnight in org timezone).
- **Skips entirely if `NODE_ENV === 'development'`.**
- Reports on **yesterday** (the day that just ended).
- Queries all `LOCAL_ADMIN` users with emails as recipients.
- Sends one email per admin via `EmailService.send`.
- Registered as `dailyRequestsReportJob` in `startCronJobs()`.

### Startup log updated
```
⏰ Cron jobs started — ... daily-requests-report
```

---

## Queue Top Bar — Layout Reorganised

**`views/admin/queue.ejs`**

Previously, the date nav, stat cards, action buttons, and back button were all in a single flex row, which caused crowding as more buttons were added.

Split into two rows:
- **Row 1**: Date navigation (left) + Test Sound · Monthly Report · Work/Dashboard button (right)
- **Row 2**: Stat cards on their own line with `margin-bottom:12px`

Row 1 gap tightened from `10px` to `8px` between action buttons.

---

## Monthly Requests Report — On-Demand Email

### Overview
Admin or manager clicks **Monthly Report** button on the queue page → selects a month from a dropdown → report is emailed to their own account. Only months with actual data in the database appear in the list.

### `models/ClientRequest.js`
- `getAvailableMonths()` — queries `DISTINCT DATE_FORMAT(instance_date, '%Y-%m')` where `instance_date <= CURDATE()`, returns `[{ value: 'YYYY-MM', label: 'Month YYYY' }]` descending
- `getMonthlyReport(yearMonth)` — returns `{ stats, requests }`:
  - Stats: same shape as `getDateStats` (open/picked/done/missed/cancelled/approved/rejected/rescheduled/total)
  - Requests: full join with creator, picker, latest comment; includes `instance_date`; ordered by date ASC then status priority

### `services/emailService.js` — `monthlyRequestsReport` template
- Uses `wrapHtmlFull()` (same as daily report)
- **Two rows of 4 stat cards**: Row 1 = Total, Done, In Progress, Open; Row 2 = Missed, Approved, Rejected, Rescheduled
- Request table adds **Date** column (showing "Month Day" format) before the title column
- 8 columns total: #, Date, Request, Created By, Status, Priority, Handled By, Latest Comment

### `controllers/clientQueueController.js`
- `getAvailableMonths()` — returns months JSON
- `sendMonthlyReport()` — validates `year_month` format, checks user has email, checks data exists, sends via `EmailService.send`, returns success message with recipient email

### `routes/index.js`
```js
GET  /queue/available-months  → getAvailableMonths (authenticated)
POST /queue/monthly-report    → sendMonthlyReport  (LOCAL_ADMIN or LOCAL_MANAGER only)
```

### `views/admin/queue.ejs`
- **Monthly Report button** added to top bar (purple, `bi-file-earmark-bar-graph`)
- `#admqMonthlyReportModal` — month `<select>` (lazy-loaded on first open via `/queue/available-months`), status message area, Send Report button (purple)
- `_monthlyMonthsLoaded` flag — months fetched only once per page load
- On submit: POST → shows "Sending…" → on success shows green confirmation for 2.2s then auto-closes; on error shows red message and re-enables button
- Modal added to teleport list

---

## Client Online Presence Dot — Local Queue

Shows a live green dot next to the request creator's name in the local queue table when that client user is currently online on the portal.

### Architecture

The portal namespace (`/portal`) already tracked online users in an in-memory `Map` (`onlineUsers`: userId → Set of socketIds). The admin hub connects only to the main namespace (`/`), so presence events had to be bridged.

### `portal/socket/portalSocket.js`
- On connect: `io.emit('portal:presence', { user_id, status: 'online' })` — cross-emits to main namespace alongside existing `portalNs.emit`
- On disconnect (last socket gone): `io.emit('portal:presence', { user_id, status: 'offline' })`
- New export: `getOnlineClientIds()` — returns `Array.from(onlineUsers.keys())`

### `controllers/clientQueueController.js`
- Added `require('../portal/socket/portalSocket').getOnlineClientIds`
- New `getOnlineClients()` method: returns `{ online: [...ids] }` as JSON

### `routes/index.js`
- Added `GET /queue/client-online` → `ClientQueueController.getOnlineClients` (before `/:id` routes)

### `views/admin/layout.ejs`
- Added `portal:presence` listener on `admBdrSock` (main namespace socket):
  ```js
  admBdrSock.on('portal:presence', function(data) {
    if (typeof window.admqOnPresence === 'function') window.admqOnPresence(data);
  });
  ```

### `views/admin/queue.ejs`
- CSS: `.admq-online-dot` — 7px green circle (`#22c55e`) with soft glow shadow
- `_onlineClients = new Set()` — tracks online user IDs client-side
- On page load: fetches `/queue/client-online` to populate `_onlineClients` and apply dots to already-rendered rows
- `window.admqOnPresence(data)`: updates `_onlineClients` Set and flips `className` on all `[data-online-uid="id"]` elements — no table reload
- `buildRow()`: Creator cell now includes `<span data-online-uid="{created_by}" class="admq-online-dot (or empty)">` inline before the name; the dot is rendered correctly on initial render and after every `loadDate()` re-render since `buildRow` reads `_onlineClients` directly

---

## Bugs Fixed This Session

| Bug | Root cause | Fix |
|-----|-----------|-----|
| `localUsers is not defined` on queue render | `adminHubController.queue()` wasn't fetching `localUsers` | Added `ClientRequest.getLocalUsers()` to the `Promise.all` in that handler |
| Calendar icon blank button | `bi-calendar-arrow-up` doesn't exist in Bootstrap Icons 1.11.3 | Replaced with `bi-calendar-plus` |
| Email auth failing (535-5.7.8) | `MAIL_USER=srvicea@123cfc.com` — one character typo | Corrected to `servicea@123cfc.com` |
| Migration 053 FK type mismatch | `approved_by INT` vs `users.id INT UNSIGNED` — types incompatible | Used `INT UNSIGNED` on all new FK columns |
| Report email clipped on right | `max-width:600px` wrapper too narrow for 6 stat cards + wide table | Created `wrapHtmlFull()` using `width:100%` table layout |
