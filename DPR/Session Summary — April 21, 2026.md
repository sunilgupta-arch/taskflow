# Session Summary — April 21, 2026

## Portal Requests Page — Frequency Column
- Added **Frequency** column to the daily instances table (between Type and Priority)
- Values: One-time, Daily, Weekly, Monthly — mapped from `recurrence` field via `recLabels`
- Moved `recLabels` definition to IIFE scope so both `renderInstances` and `renderReqDetail` share it

## Portal Requests — Recurring Request Schedule Editing
**Feature:** Allow client admin to change recurrence type and weekdays of an existing recurring request (e.g., add Friday, swap Wed → Fri) without creating a new request.

**Backend:**
- `models/ClientRequest.js`: Added `recurrence` and `recurrence_days` to the update whitelist; added `deleteFutureOpenInstances(requestId)` — deletes `open` instances with `instance_date > today` so the new schedule takes effect cleanly. Past (done/missed/picked) instances are never touched.
- `portal/controllers/clientRequestController.js`: Accepts `recurrence` + `recurrence_days` from PUT body; validates weekly requests must have at least one day; calls `deleteFutureOpenInstances` after save when either field was sent.

**Frontend (`portal/views/portal/requests.ejs`):**
- Recurring Requests list edit button: added `data-recurrence` and `data-recurrencedays` attributes
- Edit modal: added Recurrence select + weekday checkboxes (shown only for template edits from recurring list); info banner: *"Schedule changes apply from tomorrow. Past history is preserved."*
- JS click handler: detects template vs instance edit via presence of `data-recurrencedays`; populates and toggles recurrence fields accordingly
- `submitEditRequest`: sends `recurrence` + `recurrence_days` in payload when in template-edit mode

## Portal Requests — Edit Modal UX Improvements

### Two-column layout
Restructured Edit Request modal from single-column scroll to two-column no-scroll layout:
- **Left:** Title, Task Type + Priority, Due Time + End Date, Assign To, Attachment
- **Right:** Description, schedule fields (recurrence, weekdays, series end date)

### Lock fields for in-progress instances
- Edit button removed entirely for `done`/`missed`/`cancelled` instances
- Delete/stop button restricted to `open` instances only
- For `picked` (in-progress) instances: edit modal shows amber lock notice, hides Task Type, Due Time, End Date — only Title, Priority, Description, Assign To editable
- `data-status` added to instance edit buttons to carry state into modal handler

### Recurring template edit — field cleanup
- **Due Time** hidden from template edit modal (set at creation, not meaningful to change mid-series)
- **End Date** replaced by **Series End Date** in the right column, positioned below Recurrence/Weekdays with helper text *(leave blank to run indefinitely)*
- `submitEditRequest` uses `erSeriesEndDate` for template edits, `erEndDate` for instance edits
- Description moved to left column below Assign To; right column is now schedule-only

## Portal Requests — One-Time Task Carry-Forward
**Feature:** One-time open instances that were not picked persist in the queue day after day until picked and completed (client request).

- `models/ClientRequest.js` — `autoMarkMissed`: now JOINs `client_requests`; only marks `picked` instances and `open` recurring instances as missed; one-time open instances are excluded
- `models/ClientRequest.js` — `getQueueForDate` and `getInstancesForOrg`: added OR condition to surface carry-forward items (`instance_date < today AND status = 'open' AND recurrence = 'none'`) when viewing today's date; ORDER BY uses `cri.instance_date < CURDATE()` so overdue items sort to the top with Overdue badge
- `portal/controllers/clientRequestController.js`: replaced `ClientRequest.getDateStats()` call with `statsFromInstances()` helper so carry-forward open items are counted in the Pending stat

## Portal Requests — Renamed to "Requests Queue"
- `portal/views/portal/layout.ejs`: nav label + tooltip updated to "Requests Queue"
- `portal/views/portal/requests.ejs`: page `<h5>` header updated
- `portal/controllers/clientRequestController.js`: render `title` updated

## Portal Chat — Bridge Conversations in Client Chat List
- `portal/public/portal.js`: `loadConversations()` now fetches both `/portal/chat/conversations` (peer) and `/portal/bridge/conversations` (support) in parallel, merges and sorts by last message time; bridge convs render with headset icon
- `portal/public/portal.css`: `.support-conv-avatar` and `.support-avatar` styles for the headset indicator
- `portal/views/portal/chat.ejs`: "Support Team" section shown in New Chat contacts list for eligible roles; `localAdmin` and `delegateSupport` contacts wired to `startBridgeChat()`
- `controllers/bridgeChatController.js`: added `getMyConversationsForPortal` — lists bridge conversations for a portal (client) user
- `models/BridgeChat.js`: added `getConversationsForClientUser(userId)` query
- `portal/routes/portal.js`: added `GET /portal/bridge/conversations` route

## Local Side — Double Scrollbar Fix
**Problem:** The page body scrollbar and the Group Channel panel's internal scrollbar both appeared at the right edge of the viewport, causing a confusing double-scrollbar UX.

**Fix (`views/layouts/main.ejs`):**
- `body`: changed `min-height: 100vh` → `height: 100vh; overflow: hidden` — body never scrolls
- `#main-content`: changed `min-height: 100vh` → `height: 100vh; overflow-y: auto` — content scrolls inside its own column; scrollbar appears at the gc-panel boundary, clearly separated from the chat scrollbar
- Sticky topbar continues to work correctly as `position: sticky` now references `#main-content`'s scroll context

## Global — Thin Custom Scrollbars
- `views/layouts/main.ejs`: added `*::-webkit-scrollbar` (5px wide, transparent track, muted slate thumb) and `scrollbar-width: thin` (Firefox) — applies to all scrollable areas app-wide

## Local Side — Client Queue Nav Badge + Sound Alert
**Feature:** When a new client request arrives, local users see a red badge count on the "Client Queue" nav item and hear a 3-tone chime.

**Backend:**
- `controllers/clientQueueController.js`: added `getBadgeCount` — returns today's open count via `getDateStats`
- `routes/index.js`: added `GET /queue/badge` route

**Frontend (`views/layouts/main.ejs`):**
- Nav item: added `id="queueNavBadge"` badge `<span>` with `margin-left: auto` inside the flex nav link; `id="queueNavLink"` on the anchor
- CSS: `.nav-queue-badge` (red pill, 18px), `@keyframes queueBadgePop` (scale pop on increment), `.nav-queue-alert` (red left border + tinted background on the nav link)
- JS (LOCAL_* roles only): on page load fetches `/queue/badge` and shows count if > 0; listens to `queue:new_request` — plays ascending triangle-wave chime + re-fetches count; listens to `queue:updated` — re-fetches count; no sound/badge when already on the queue page (`_onQueuePage` flag)

## Admin Hub — Client Queue Page (New UI)
**Feature:** First full feature page migrated into the new admin hub UI — `/admin/queue` renders the Client Queue with the admin layout, leaving the classic `/queue` untouched.

**Files changed/created:**
- `controllers/adminHubController.js`: added `queue()` method — fetches `getQueueForDate` + `getDateStats` in parallel, renders `admin/queue` with `layout: 'admin/layout'`, `section: 'work'`
- `routes/index.js`: added `GET /admin/queue` → `AdminHubController.queue`
- `views/admin/queue.ejs`: full queue page — date navigation (prev/next/picker/today), 5-stat pills (total/open/in-progress/done/missed), sortable table with color-coded status rows, overdue badge for carry-forward items, pick/done/release actions, detail slide-over drawer (info grid, description, attachments with upload, release history, comments), release modal with reason textarea; all CSS uses `--adm-*` variables; no Bootstrap dependency; socket live-reload via `window.admqSocketCallback` called by layout's socket block
- `views/admin/layout.ejs`: topbar queue link updated to `/admin/queue`; socket block updated to call `admqSocketCallback` on `queue:new_request` and `queue:updated` events
- `views/admin/work.ejs`: Client Queue card updated to `/admin/queue`

## Admin Hub — Bridge Chat (Client → Local) in New UI
**Problem:** When a client sends a private message to the local admin/support in the classic UI, the bridge chat floating widget handles it. But the new admin hub layout had no widget, no Socket.IO, and no notification — messages were invisible to admins using the new UI.

**Fix (`views/admin/layout.ejs`):**
- Added Socket.IO + jQuery CDN scripts
- Added a **Client Messages icon button** in the topbar (amber, with unread count badge); badge goes amber and shows count when there are unread messages
- Added a **380px slide-over drawer** from the right — opens on icon click or auto-opens when a client message arrives
- Drawer has conversation list view and per-conversation chat view (back button returns to list)
- Full message rendering: text, images, file attachments, date dividers, read ticks, delete button
- Send via Enter key or button; file attach button
- **Socket.IO `bridge:message` handler**: appends incoming messages live, auto-opens the drawer + the specific conversation when a client message arrives while the admin is in the new UI, plays the same notification chime
- **`bridge:message:delete` handler**: marks deleted messages in-place
- Badge fetched from `/bridge/unread-count` on page load and after each incoming message; clears when conversation is opened

## Admin Hub — Client Messages Card in Communications
- `views/admin/comms.ejs`: added **Client Messages** card (amber accent, links to `/bridge`)
- `views/bridge/index.ejs`: new full-page bridge chat view — split-pane layout (conversation list left, chat area right); fetches `/bridge/conversations`, loads messages via `/bridge/conversations/:id/messages`; supports send, file attach, and live updates via `bridge:new_message` socket event; renders with classic `main.ejs` layout (Bootstrap available)
- `routes/index.js`: added `GET /bridge` route — gated to `LOCAL_ADMIN` and `LOCAL_MANAGER`, renders `bridge/index`

## Admin Hub — Client Queue Page Bug Fixes & UI Polish (Continuation)

### Bug Fix: JS visible as page text / "Unexpected end of input"
Two bugs were introduced by the `express-ejs-layouts` `extractScripts` mechanism:

**Bug 1 (prior session):** `<%- script %>` was placed between CDN `<script src>` tags and the layout's own `<script>` block in `views/admin/layout.ejs`. This caused the extracted view script to render as visible HTML text instead of executing.
- **Fix:** Moved `<%- script %>` to after the layout's closing `</script>`, just before `</body>` — matching the pattern used in `main.ejs`.

**Bug 2 (this session):** A comment on line 354 of `views/admin/queue.ejs` read `// ── Bootstrap data (</script> sequences escaped ...)`. The `express-ejs-layouts` regex is non-greedy — it matched from `<script>` to the first `</script>` it found, which was inside this comment. The IIFE was truncated, causing "Uncaught SyntaxError: Unexpected end of input".
- **Fix:** Changed the comment to not contain `</script>` as literal text.

### UI Polish: Space saving on queue page
- Removed redundant "Client Queue" title and subtitle from page body (browser tab + sidebar already identify the page)
- Merged date nav and stats bar into a single justified row (date nav left, stats right)
- Reduced `.adm-content` padding: `32px` → `20px 28px`
- Tightened stats pill padding and margins
- Increased date nav button/input height to `38px` for comfortable click targets
- Reduced table row padding from `12px` to `9px` vertical

**Files changed:**
- `views/admin/queue.ejs`
- `views/admin/layout.ejs`

## Admin Hub — Queue Table: Frequency, Created By, and Font Polish
- Added **Frequency** column (One-time / Daily / Weekly / Monthly mapped from `recurrence` field)
- Added **Created By** column using `inst.created_by_name`
- Fixed org name display to use `inst.org_name || inst.client_org_name`
- Column order: Request | Type | Priority | Due | Frequency | Created By | Status | Picked By | Actions
- Increased thead font from `0.62rem` → `0.68rem`
- Increased tbody font from `0.82rem` → `0.88rem`, changed text color from `var(--adm-text-2)` → `var(--adm-text)` (crisper)

## Admin Hub — Group Channel Off-Canvas
Added a Group Channel slide-over drawer accessible from the admin hub topbar — a purple icon button (`bi-people-fill`) placed before the bridge chat button.

**CSS (`views/admin/layout.ejs`):** `adm-gc-*` prefix — button style (purple #a78bfa), overlay, 380px drawer, messages area, sent/received bubbles, date dividers, file rendering, input area.

**HTML:** overlay + drawer with header, messages div (`#admGcMessages`), textarea + file button + send button.

**JS:** `admGcIsOpen`, `admGcUserId`, `admGcLoaded` state variables; `toggleAdmGc/openAdmGc/closeAdmGc`; `admGcLoad()` fetches `/channel/messages` (reversed, oldest-first); `admGcRenderMessages()`, `admGcAppend()` for live inserts; `admGcSend()` posts to `/channel/messages`; `admGcSendFile()` posts to `/channel/file`. Enter key sends. Socket events: `channel:message` → append if loaded; `channel:message:delete` → mark deleted in-place.

## BLUEPRINT.md — Comprehensive App Reference
Created `/BLUEPRINT.md` at project root: 17-section reference covering app overview (two-org model), tech stack, role system (7 roles + permissions), middleware chain, directory structure, both UIs, every model (tables + key fields + methods), every controller, all routes grouped by feature, Socket.IO events, key feature descriptions, `express-ejs-layouts` behaviour rules (critical `</script>` escaping rules), coding conventions, env vars, migrations, and current state as of April 21, 2026.

Purpose: any new AI session can read `BLUEPRINT.md` first and understand the full app without reading source code.

## Admin Hub — Attendance Page (`/admin/attendance`)
Built a new full-featured Attendance page as the second migrated page in the admin hub.

**Backend (`controllers/adminHubController.js`):**
- `_fetchAttendanceData(tz, selectedDate, month)` — shared helper: 5 parallel DB queries (daily logs with shift_history JOIN, active users with shift_history JOIN, monthly attendance days for calendar grid, leave requests, holidays); builds `calendarData` map (user→day→status), `loginTimeMap`, `overrideMap`, `holidayMap`; handles future/weekoff/holiday/leave/present/absent status resolution
- `attendance(req, res)` — fetches LOCAL org timezone, resolves date/month from query params, renders `admin/attendance` with `section: 'team'`, `isAdmin` flag
- `attendanceDailyData(req, res)` — JSON endpoint (`GET /admin/attendance/data?date=`) for AJAX date nav
- `attendanceMonthlyData(req, res)` — JSON endpoint (`GET /admin/attendance/monthly?month=`) for AJAX month nav

**Routes (`routes/index.js`):** three new routes added under `requireLocalAdmin`.

**Sidebar (`views/admin/layout.ejs`):** Attendance sub-link added under Team section with `padding-left:36px` indent.

**Team hub (`views/admin/team.ejs`):** Attendance card href updated `/attendance` → `/admin/attendance`.

**Page (`views/admin/attendance.ejs`):**
- **Daily view:** user table — Team Member (avatar+name+shift label), Status badge, First In, Last Out, Hours, Late chip (+Xh YYm with reason tooltip), Override button; expandable sessions row (session number, login, logout/Active indicator, duration, Force Logout button for open sessions)
- **Monthly view:** sticky-name calendar grid, colored 22px dot cells per day, today column highlighted purple, click→override modal
- **Stats bar:** Total / Present / Absent / Late / On Leave / Day Off
- **Override modal:** teleported to body, status select (present/half_day/wfh/official_duty/leave/holiday), remark field, Save + Remove buttons; calls `POST/DELETE /attendance/override`
- **Holiday modal:** lists holidays for current month, add (date+name) and remove; calls `POST/DELETE /attendance/holiday`; admin-only
- **AJAX navigation:** date picker and month picker both replace data without page reload
- **Status colors:** present=green, absent=red, weekoff=slate, holiday=purple, approved_leave=blue, pending_leave=amber, half_day=orange, official_duty=teal, wfh=cyan

**Bug fixed in same session:** Monthly grid `td` class attribute had `'\'')` (literal single-quote) instead of `'')` + closing double-quote, producing invalid HTML. Fixed to `'')'"`.

## Admin Hub — Attendance Page Fixes & Polish

- **Monthly grid bug fixed:** `td` class attribute had a dangling single-quote (`'\''`) for non-today cells producing invalid HTML; corrected to produce a clean closing `"`.
- **Sidebar cleaned up:** Removed the Attendance sub-link from under the Team nav item — navigation is now done via hub cards only, keeping the sidebar minimal.
- **Legend redesigned:** `.ata-legend` given padding + background + border as a container; each `.ata-legend-item` is a pill with background + border; `.ata-legend-dot` has an inline glow `box-shadow`; label text is coloured to match its dot.

## Admin Hub — Users Page (`/admin/users`)

Built the full Users management page in the new admin hub UI.

**Backend:**
- `models/User.js`: added `u.visible_to_client` to the `getAll` SELECT; added `'visible_to_client'` to `update()` allowedFields
- `migrations/047_user_visible_to_client_2026-04-21.sql`: `ALTER TABLE users ADD COLUMN visible_to_client TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active` (applied)
- `controllers/adminHubController.js`: added `UserModel` import; added `users()` method — fetches all users + roles + orgs + delegatedSupportId, renders `admin/users` with `section: 'team'`
- `routes/index.js`: added `GET /admin/users`

**Page (`views/admin/users.ejs`):**
- Two tabs: **Local Team** | **Client Users**
- Local Team: card grid sorted admin → manager → user, active before inactive, alphabetical within group; colour-coded avatar (initials), name, email, role badge, active/inactive glow dot, shift chips for LOCAL_USER/LOCAL_MANAGER
- Client Users: grouped by org with `usr-org-pill` header; same card layout without shift chips
- Delegate Support strip (admin only, local tab only)
- **No Progress button** in this UI — removed intentionally
- **Visible-to-client toggle** (local cards, admin only): checkbox calls `PUT /users/:id` with `{visible_to_client: 1|0}`; updates local array + DOM in-place without reload; label shows "Visible / Hidden"
- Create/Edit modal: org select auto-filters role select to LOCAL_* or CLIENT_*; shift fields shown only for LOCAL_USER/LOCAL_MANAGER; teleported to `document.body` to escape `overflow:hidden`
- Reset Password modal: POST `/users/:id/reset-password`
- `views/admin/team.ejs`: Users card href updated `/users` → `/admin/users`

## Admin Hub — Leave Management Page (`/admin/leaves`)

Built the full Leave Management page in the new admin hub UI.

**Backend:**
- `controllers/adminHubController.js`: added `LeaveRequest` import; added `leaves()` method — fetches all leave requests + active LOCAL users/managers for Grant dropdown, renders `admin/leaves` with `section: 'team'`
- `routes/index.js`: added `GET /admin/leaves`

**Page (`views/admin/leaves.ejs`):**
- Stats bar: Total / Pending (amber) / Approved (green) / Rejected (muted red)
- Filter tabs with live counts: All | Pending | Approved | Rejected; Pending tab gets amber glow badge when count > 0
- Table with 3px coloured left border per row status; columns: Employee (avatar+name) | Date Range (formatted + day count chip) | Reason (truncated 55 chars) | Status badge | Reviewed By + date + remark | Actions
- Inline Approve/Reject buttons on pending rows only
- **Review modal:** colour/icon/button style switches for approve vs reject; calls `PATCH /leaves/:id/approve|reject`; mutates local array + re-renders without page reload
- **Grant Leave modal:** team member select, date range with live day count, reason; calls `POST /leaves/grant`; inserts new record into local array + re-renders
- `views/admin/team.ejs`: Leaves card href updated `/leaves` → `/admin/leaves`

## Admin Hub — Notes Page (`/admin/notes`)

Built the Notes page in the new admin hub UI under the Communications section.

**Backend:**
- `controllers/adminHubController.js`: added `NoteModel` import; added `notes()` method — fetches current user's notes (up to 500), renders `admin/notes` with `section: 'comms'`
- `routes/index.js`: added `GET /admin/notes`

**Page (`views/admin/notes.ejs`):**
- **Single toolbar row:** compact stat pill (`8 Notes`, gold `N Pinned` if any), search input (instant client-side filter on keyup), card/list view toggle (persisted to `localStorage`), "New Note" button — all on one row
- **Card grid view** (default): title, 4-line content preview, date footer (shows "Edited" if modified), Read / Edit / Delete action buttons; pinned notes get gold border glow + pin badge
- **List view:** compact rows — title + single-line preview, date, actions; pinned rows get gold left border
- **Create/Edit modal:** title + textarea, both with **voice dictation** (Web Speech API; continuous for content field); Escape key or overlay click closes
- **All CRUD in-place:** create inserts to array head + re-renders; edit mutates entry; delete removes — no page reload
- **Read aloud:** TTS via `speechSynthesis`; click speaker icon to start, click again to stop; only one note reads at a time
- **Inline toast notifications:** self-contained `showToast()` defined in page (admin hub layout has no global toast); styled with dark surface + coloured border matching status type
- **Bug fixed:** initial version used `axios` for CRUD calls — admin hub layout only loads jQuery + Socket.IO, not axios; replaced all three calls with native `fetch`
- `views/admin/comms.ejs`: Notes card href updated `/notes` → `/admin/notes`

## Summary of Files Changed
- `models/ClientRequest.js`
- `models/BridgeChat.js`
- `models/User.js`
- `portal/controllers/clientRequestController.js`
- `controllers/clientQueueController.js`
- `controllers/bridgeChatController.js`
- `controllers/adminHubController.js`
- `portal/views/portal/requests.ejs`
- `portal/views/portal/layout.ejs`
- `portal/views/portal/chat.ejs`
- `portal/public/portal.js`
- `portal/public/portal.css`
- `portal/routes/portal.js`
- `routes/index.js`
- `views/layouts/main.ejs`
- `views/admin/layout.ejs`
- `views/admin/team.ejs`
- `views/admin/comms.ejs`
- `views/admin/attendance.ejs` *(new)*
- `views/admin/users.ejs` *(new)*
- `views/admin/leaves.ejs` *(new)*
- `views/admin/notes.ejs` *(new)*
- `migrations/047_user_visible_to_client_2026-04-21.sql` *(new)*

## New Admin UI — Clean Hub Layout for LOCAL_ADMIN & LOCAL_MANAGER
**Context:** Local admin found the existing UI too cluttered. Client approved the new design after preview.

**Approach:** Parallel UI at `/admin/*` — existing routes untouched. Hub pages link to existing feature URLs for now. Once all pages are migrated, the new UI becomes default and the old one is retired.

**What was built:**
- `controllers/adminHubController.js` — 6 render methods (dashboard, work, team, reports, comms, tools)
- `views/admin/layout.ejs` — self-contained layout: clean 240px sidebar with brand mark, 6 section nav items (each with per-section active colour), user footer with "Classic UI" + "Sign out" buttons; minimal sticky topbar with clock + theme toggle; no Group Channel panel, no widgets
- `views/admin/dashboard.ejs` — personalised welcome strip (greeting + date) + 5 large section navigation cards
- `views/admin/work.ejs` — Task Board, All Tasks, Client Queue, My Tasks, Create Task
- `views/admin/team.ejs` — Live Status, Users, Attendance, Leave Management
- `views/admin/reports.ejs` — Overview, Task Report, Overdue, Workload, Punctuality, Rewards
- `views/admin/comms.ejs` — Group Channel, Info Board, Notes
- `views/admin/tools.ejs` — Drive, Help, Backup (Backup visible to LOCAL_ADMIN only)

**Routes:** `GET /admin[/work|/team|/reports|/comms|/tools]` — all gated via `requireRoles('LOCAL_ADMIN','LOCAL_MANAGER')`

**Entry point:** "✨ Try New Admin UI" button added above the sidebar footer in the existing `main.ejs` layout, visible only to LOCAL_ADMIN and LOCAL_MANAGER

**Summary of new files:**
- `controllers/adminHubController.js`
- `views/admin/layout.ejs`
- `views/admin/dashboard.ejs`
- `views/admin/work.ejs`
- `views/admin/team.ejs`
- `views/admin/reports.ejs`
- `views/admin/comms.ejs`
- `views/admin/tools.ejs`
