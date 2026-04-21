# Session Summary — April 20, 2026

## Features Built

### 1. Group Channel — Phase 5 Nice-to-Haves (All 7 Deferred Items)

Completed every feature left on the deferred list from April 18.

#### Scroll-to-Bottom, Unread Divider, Pagination, Browser Notifications
- Floating scroll-to-bottom button appears when user scrolls up; auto-hides at bottom
- Unread divider line injected above first unseen message on load
- Load-more on scroll up (pagination) — fetches older messages without losing scroll position
- Browser notifications via Notifications API when tab is in the background

**Files:** `portal/public/portal.css`, `portal/views/portal/channel.ejs`, `portal/views/portal/layout.ejs`, `views/channel/index.ejs`, `views/layouts/main.ejs`

#### Reply-to-Message and @Mentions with Autocomplete
- Reply bar appears above compose box when quoting a message; quoted snippet rendered in the bubble
- `@` triggers an autocomplete dropdown populated from online/channel users
- Mentions highlighted in rendered messages

**Database:** `migrations/040_group_channel_reply_2026-04-20.sql` — added `reply_to_id` FK to `group_channel_messages`

**Backend:** `models/GroupChannel.js` — joins reply parent on fetch; `controllers/groupChannelController.js` — saves `reply_to_id`

**Files:** `portal/public/portal.css`, `portal/views/portal/channel.ejs`, `portal/views/portal/layout.ejs`, `views/channel/index.ejs`, `views/layouts/main.ejs`

#### Emoji Reactions with Real-Time Sync
- Emoji picker (click ☺ on any message) adds/toggles reaction; same user clicking again removes it
- Reactions displayed as pill badges (emoji + count) below the message bubble
- Socket.IO `channel:reaction` event syncs reactions to all connected clients in real time

**Database:** `migrations/041_group_channel_reactions_2026-04-20.sql` — `group_channel_reactions` table (message_id, user_id, emoji)

**Backend:** `models/GroupChannel.js` — addReaction, removeReaction, getReactions; `controllers/groupChannelController.js` — POST/DELETE reaction endpoints; routes registered on both `/channel` and `/portal/channel`

**Files:** `portal/public/portal.css`, `portal/views/portal/channel.ejs`, `portal/views/portal/layout.ejs`, `routes/index.js`, `views/channel/index.ejs`, `views/layouts/main.ejs`

#### Inline Edit (Own Text Messages, 15-Minute Window)
- Pencil icon appears on hover for own text messages sent within the last 15 minutes
- Inline edit mode replaces the bubble text with an editable input; Save / Cancel buttons
- Edited messages show an `(edited)` label; Socket.IO `channel:edit` event syncs the update live

**Database:** `migrations/042_group_channel_edited_2026-04-20.sql` — added `edited_at` column to `group_channel_messages`

**Backend:** `models/GroupChannel.js` — editMessage(id, userId, newText); `controllers/groupChannelController.js` — PATCH endpoint with 15-min guard; route on both sides

**Files:** `portal/public/portal.css`, `portal/routes/portal.js`, `portal/views/portal/channel.ejs`, `portal/views/portal/layout.ejs`, `routes/index.js`, `views/channel/index.ejs`, `views/layouts/main.ejs`

#### Pinned Messages (Admin-Only, Collapsible Pinned Bar)
- Admin users see a pin icon on every message; click pins/unpins it
- Collapsible pinned-messages bar appears at the top of the chat when ≥1 message is pinned
- Bar shows the latest pinned message with a click-to-scroll behaviour; collapse state persists in `localStorage`

**Database:** `migrations/043_group_channel_pin_2026-04-20.sql` — added `is_pinned` boolean to `group_channel_messages`

**Backend:** `models/GroupChannel.js` — pinMessage, unpinMessage, getPinned; `controllers/groupChannelController.js` — POST/DELETE pin endpoints; Socket.IO `channel:pin` / `channel:unpin` events

**Files:** `portal/public/portal.css`, `portal/routes/portal.js`, `portal/views/portal/channel.ejs`, `portal/views/portal/layout.ejs`, `routes/index.js`, `views/channel/index.ejs`, `views/layouts/main.ejs`

#### Message Search with Debounced Input and Highlight
- Search icon in channel header toggles a search bar; input debounced 300 ms
- Matching messages fetched via GET `/channel/search?q=` and rendered in a results overlay
- Search term highlighted (yellow) inside each result snippet

**Backend:** `models/GroupChannel.js` — searchMessages(orgId, q); `controllers/groupChannelController.js` — GET search endpoint on both sides

**Files:** `portal/public/portal.css`, `portal/routes/portal.js`, `portal/views/portal/channel.ejs`, `portal/views/portal/layout.ejs`, `routes/index.js`, `views/channel/index.ejs`, `views/layouts/main.ejs`

#### Link Previews with OG Unfurling and URL Linkification
- URLs in messages automatically converted to clickable `<a>` links (linkification)
- First URL in a message triggers a server-side OG scrape; preview card (image, title, description, domain) rendered below the bubble
- Unfurl results cached in-process to avoid repeated HTTP calls for the same URL

**Backend:** `services/linkUnfurl.js` — fetches OG tags via HTTP, extracts `og:title`, `og:description`, `og:image`, `og:url`; `controllers/groupChannelController.js` — GET `/channel/unfurl?url=` endpoint on both sides

**Files:** `portal/public/portal.css`, `portal/routes/portal.js`, `portal/views/portal/channel.ejs`, `portal/views/portal/layout.ejs`, `routes/index.js`, `services/linkUnfurl.js`, `views/channel/index.ejs`, `views/layouts/main.ejs`

---

### 2. Client Request Queue — Full System

A new task-dispatching system where client-side users submit requests (one-time or recurring) and the local team picks, works, and completes them through a dedicated queue.

#### Foundation (Migration 044 + Core Model + Both UIs)

**Database:** `migrations/044_client_requests_2026-04-20.sql` — 4 tables:
- `client_requests` — request templates (title, task_type, description, recurrence pattern, org)
- `client_request_instances` — daily-generated work items (status: open / picked / done / missed)
- `client_request_releases` — release history per instance (reason, released_by, timestamp)
- `client_request_comments` — per-instance comments from local team

**Backend (`models/ClientRequest.js`):**
- Lazy instance generation — instances created on first access for a given date, not by a cron job
- `getInstancesForDate(orgId, date)` — generates missing instances on the fly
- `pickInstance`, `releaseInstance`, `completeInstance` — status transitions
- `getReleaseHistory`, `getComments`, `addComment` — detail modal data
- `getPortalRequests(orgId)` — org-scoped query for portal side

**Local Queue (`/queue` — LOCAL roles only):**
- Date navigation (prev/next day) with URL param
- Table: instance rows with Pick / Release / Done action buttons
- Release-reason modal — required before releasing a picked instance
- Detail modal — release history + threaded comments
- Socket.IO `queue:updated` event refreshes table in place

**Portal Requests (`/portal/requests` — all portal roles):**
- Create one-time or recurring (daily / weekly / monthly) requests
- Date navigation to browse past days' instances
- Detail modal per instance
- Deactivate toggle on recurring requests
- Task-type `<datalist>` autocomplete from existing types
- Nav: "Client Queue" link in main layout (LOCAL only); "Requests" icon in portal activity bar

**Files:** `controllers/clientQueueController.js`, `migrations/044_client_requests_2026-04-20.sql`, `models/ClientRequest.js`, `portal/controllers/clientRequestController.js`, `portal/routes/portal.js`, `portal/views/portal/layout.ejs`, `portal/views/portal/requests.ejs`, `routes/index.js`, `views/layouts/main.ejs`, `views/queue/index.ejs`

#### Edit, Cancel, Auto-Missed, Live Updates, Nav Badge (Migration 045)

**Database:** `migrations/045_client_request_cancelled_2026-04-20.sql` — added `cancelled` to `client_request_instances` status enum

**Backend additions (`models/ClientRequest.js`):**
- `autoMarkMissed(orgId, date)` — flips all past open/picked instances to `missed` on queue load
- `update(id, fields)` — edits template-level fields (title, task_type, description)
- `cancelInstance(id)` — cancels an open instance; blocked on picked/done/missed
- `getOpenCountForOrg(orgId)` — counts open instances for today (powers the nav badge)

**Portal additions:**
- `PUT /portal/requests/:id` — edit request template
- `PATCH /portal/instances/:id/cancel` — cancel open instance
- `GET /portal/requests/badge` — returns open count for badge polling
- Portal view fully JS-rendered instance table — Socket.IO `queue:updated` and `new_request` events re-fetch and re-render in place without page reload
- Stats bar (open / picked / done counts) also live-updated on socket events
- Edit pencil pre-fills edit modal for recurring request rows
- Cancel ✕ button on open instance rows
- `req-nav-badge` span on Requests icon in portal layout, updated by socket events from any portal page

**Files:** `migrations/045_client_request_cancelled_2026-04-20.sql`, `models/ClientRequest.js`, `portal/controllers/clientRequestController.js`, `portal/routes/portal.js`, `portal/views/portal/layout.ejs`, `portal/views/portal/requests.ejs`

#### CLIENT_SALES Access, Drive Attachments, Quick Request Modal (Migration 046)

**Database:** `migrations/046_client_request_attachments_2026-04-20.sql` — `client_request_attachments` table (instance_id, filename, drive_file_id, uploaded_by)

**Access control:**
- `CLIENT_SALES` can now access the Requests page, seeing only their own requests
- Badge count and instance/request queries filtered by `created_by` for `CLIENT_SALES`
- `CLIENT_SALES` gets a full-width layout (no GC panel space reserved)

**Attachments:**
- Attachments added to one-time request create/edit forms on both portal and local queue sides
- Google Drive upload via `uploadRequestAttachment` helper in `services/googleDriveService.js`; destination folder set via `CR_DRIVE_FOLDER_ID` env var
- `getAttachments(instanceId)` returns `[]` gracefully if table not yet migrated (defensive fix)

**Quick Request Modal:**
- Floating quick-create button available to all client roles
- Fields: title, task type, description, optional attachment
- `CLIENT_SALES` sees Quick Request only; other client roles (`CLIENT`, `CLIENT_MANAGER`) get both Quick Request and full New Request

**Queue UX:** `Client` column in the local queue renamed to `Created By`

**Files:** `controllers/clientQueueController.js`, `migrations/046_client_request_attachments_2026-04-20.sql`, `models/ClientRequest.js`, `portal/controllers/clientRequestController.js`, `portal/routes/portal.js`, `portal/public/portal.css`, `portal/views/portal/channel.ejs`, `portal/views/portal/layout.ejs`, `portal/views/portal/requests.ejs`, `routes/index.js`, `services/googleDriveService.js`, `views/channel/index.ejs`, `views/queue/index.ejs`

---

## Bug Fixes

- **Live updates never fired** — Both `clientQueueController.js` and `clientRequestController.js` called `req.app.get('io')` which always returns `undefined` (app.set('io') is never called). Replaced with `getIO()` from `config/socket`, consistent with all other controllers. `pick()` and `release()` now also emit to `io.of('/portal')` so the portal updates live.
- **Portal requests view — title click blocked** — `stopPropagation()` was preventing the document-level handler from firing; removed.
- **Pencil + trash icons missing** — Were only rendered inside the collapsed recurring section; moved to every instance row.
- **Deactivate reload** — Deactivate action now calls `loadInstances()` in-place instead of doing a full page reload.
- **getAttachments crash** — `models/ClientRequest.js` returned a DB error if `client_request_attachments` table didn't exist yet (migration not yet run). Wrapped in a try/catch to return `[]` gracefully.
- **CLIENT users accessing local routes** — `middleware/authenticate.js` now redirects any `CLIENT_*` role to `/portal` if they try to hit a local route directly.

---

## Files Changed

### New Files
- `migrations/040_group_channel_reply_2026-04-20.sql`
- `migrations/041_group_channel_reactions_2026-04-20.sql`
- `migrations/042_group_channel_edited_2026-04-20.sql`
- `migrations/043_group_channel_pin_2026-04-20.sql`
- `migrations/044_client_requests_2026-04-20.sql`
- `migrations/045_client_request_cancelled_2026-04-20.sql`
- `migrations/046_client_request_attachments_2026-04-20.sql`
- `services/linkUnfurl.js`
- `models/ClientRequest.js`
- `controllers/clientQueueController.js`
- `portal/controllers/clientRequestController.js`
- `views/queue/index.ejs`
- `portal/views/portal/requests.ejs`

### Modified Files
- `middleware/authenticate.js` — CLIENT_* role redirect to /portal
- `models/GroupChannel.js` — reply, reactions, edit, pin, search methods
- `controllers/groupChannelController.js` — reply, reactions, edit, pin, search, unfurl endpoints
- `services/googleDriveService.js` — `uploadRequestAttachment` helper
- `routes/index.js` — all new GC and queue routes
- `portal/routes/portal.js` — all new GC and request routes
- `portal/views/portal/layout.ejs` — GC phase 5 JS, req-nav-badge
- `portal/views/portal/channel.ejs` — GC phase 5 UI (reactions, edit, pin, search, reply, link preview, scroll-to-bottom, pagination, unread divider, notifications)
- `portal/public/portal.css` — GC phase 5 styles + request UI styles
- `views/layouts/main.ejs` — GC phase 5 JS + Client Queue nav link
- `views/channel/index.ejs` — GC phase 5 UI (local side mirror)
