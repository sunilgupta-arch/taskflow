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

## Summary of Files Changed
- `models/ClientRequest.js`
- `models/BridgeChat.js`
- `portal/controllers/clientRequestController.js`
- `controllers/clientQueueController.js`
- `controllers/bridgeChatController.js`
- `portal/views/portal/requests.ejs`
- `portal/views/portal/layout.ejs`
- `portal/views/portal/chat.ejs`
- `portal/public/portal.js`
- `portal/public/portal.css`
- `portal/routes/portal.js`
- `routes/index.js`
- `views/layouts/main.ejs`

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
