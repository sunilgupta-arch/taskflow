# Session Summary — May 30, 2026

## Focus
Notification system overhaul (local + portal), local chat floating widget, portal chat floating widget, portal notification bell, and a series of bug fixes across both sides.

---

## 1. Local Chat — SQL Bug Fix

**File:** `models/Chat.js`

Missing comma in `getConversationsForUser()` SQL: `AS unread_count,` before `cp.is_muted` was absent, causing a syntax error that made the local chat page show "Loading" indefinitely.

---

## 2. Admin Hub — Leaves Sidebar Fix

**File:** `controllers/adminHubController.js`, `views/admin/layout.ejs`

- `leaves()` render call had `section: 'team'` instead of `section: 'leaves'` — the Team nav item was highlighted when visiting Leaves.
- Removed the duplicate Leaves link from the admin/manager sidebar (Leaves is correctly accessible under Team; LOCAL_USER sidebar keeps it since they have no Team menu).

---

## 3. Local Chat Floating Widget

**File:** `views/admin/partials/_local-chat.ejs` *(new)*, `views/admin/layout.ejs`, `routes/chat.js`, `controllers/chatController.js`

Full floating chat widget for the admin hub, accessible from every page via the topbar chat button (`admChatBtn`).

**Features:**
- Draggable header; position saved to `localStorage`
- Minimize / close
- Conversation sidebar: online presence dots, search/filter, unread badges
- Thread panel: messages, load-more, scroll-to-bottom button
- @mention dropdown (group conversations only)
- Reply/quote bar
- Emoji reactions (10 emojis, toggle)
- Edit message (PATCH, 15-min window, "edited" tag)
- Delete message
- File attach + drag & drop + paste image
- Typing indicator
- Notification sound (Web Audio API tone — no audio file)
- Sound toggle (persisted in `localStorage`)

**New routes/controller:**
- `GET /chat/users` → `ChatController.listUsers` (for @mention + new chat modal)

**Bug fixes during build:**
- `$('admChatBtn')` was calling `getElementById('#admChatBtn')` (extra `#`) → returned null → TypeError before `loadConvs()` ran. Fixed by removing the `#`.
- New messages were appearing at the top of the thread: `appendMsg` used `insertBefore(el, lcwDrop)` — the drop zone sits between load-more and existing messages, so inserting before it placed new messages above existing ones. Fixed by using `el.appendChild()`.

---

## 4. Portal Chat Floating Widget

**File:** `portal/views/portal/partials/_portal-chat.ejs` *(new)*, `portal/views/portal/layout.ejs`, `portal/routes/portal.js`, `portal/controllers/chatController.js`

Portal-side equivalent of the local chat widget. Accessed via FAB button (bottom-right). CSS prefix `pcw-`, JS namespace `pcw`.

**Differences from local widget:**
- Uses `portalSocket` (`/portal` namespace) not the main namespace socket
- File serve at `/portal/chat/attachment/:id`
- Edit uses `PUT` not `PATCH`
- No emoji reactions
- Presence events: `{user_id, status:'online'|'offline'}` format

**New route:** `GET /portal/chat/users` → `PortalChatController.listUsers`

---

## 5. Time Display Bug Fix — `picked_at` / `handled_at`

**Files:** `views/admin/queue.ejs`, `portal/views/portal/requests.ejs`

`fmtTime()` was using `.split(' ')[1]` on ISO datetime strings — returned `undefined` for ISO format, making `parseInt(undefined) = 0`, displaying "12:00 AM".

A subsequent fix using `toLocaleTimeString('America/New_York')` double-applied the Eastern offset (MySQL session is Eastern, MySQL2 stores Eastern in UTC slot — converting to Eastern again subtracted another 4 hours, showing "4:51 AM").

**Correct fix:** Use `getUTCHours()` / `getUTCMinutes()` directly. The DB's Eastern time lives in the UTC slot, so `getUTCHours()` reads the Eastern value without any conversion.

---

## 6. Notification System Overhaul

**Files:** `models/Notification.js`, `middleware/auditLog.js` (indirectly), `controllers/leaveController.js`, `controllers/compOffController.js`, `controllers/clientQueueController.js`, `portal/controllers/clientRequestController.js`, `controllers/chatController.js`, `views/admin/layout.ejs`, `migrations/070_notifications_ref_2026-05-30.sql`

### Philosophy Change
Previous notification panel was filled with comp-off entries that no manager could act on — it was permanently ignored. New rule: **each notification = one actionable item; it disappears when handled.**

### Migration 070
```sql
ALTER TABLE notifications
  ADD COLUMN ref_type VARCHAR(50) DEFAULT NULL AFTER link,
  ADD COLUMN ref_id   INT UNSIGNED DEFAULT NULL AFTER ref_type,
  ADD INDEX idx_notif_ref (ref_type, ref_id);
```
`ref_type` + `ref_id` link each notification to its source entity for precise server-side clearing.

### Notification Model — Rewritten
| Method | Purpose |
|--------|---------|
| `create(userId, type, title, body, link, refType, refId)` | Insert notification |
| `createIfNotExists(...)` | Insert only if no unread notification for this ref exists — prevents spam (e.g. 10 messages = 1 notification) |
| `clearByRef(userIds, refType, refId)` | Bulk mark-read for a ref; returns cleared IDs |
| `clearByRefForUser(userId, refType, refId)` | Single-user wrapper |
| `getForUser()` | Now includes `ref_type`, `ref_id` in SELECT |

### What Creates Notifications Now

| Event | Type | Who gets it | Auto-clears when |
|-------|------|------------|-----------------|
| Leave submitted | `leave_pending` | All managers | Leave approved or rejected |
| Leave approved | `leave_approved` | The employee | — (informational) |
| Leave rejected | `leave_rejected` | The employee | — (informational) |
| New client request | `client_request_new` | All managers | Any manager picks it |
| Unread DM | `chat_message` | Recipient | Conversation is opened |

### What No Longer Creates Notifications
- Comp-off claims and half-day entries — informational only; visible in attendance view.

### Admin Hub Layout — Live Clearing
Added `notification:cleared` socket handler: receives `{ref_type, ref_id}`, filters `_notifs` array client-side, updates badge instantly — no page reload needed.

### Chat Notifications
`chatController.sendMessage` creates `chat_message` notification for each recipient via `createIfNotExists` (ref = conversation ID). `markAsRead` calls `clearByRefForUser` + emits `notification:cleared`.

---

## 7. Portal Notification Bell

**Files:** `portal/views/portal/layout.ejs`, `portal/routes/portal.js`, `controllers/clientQueueController.js`, `controllers/bridgeChatController.js`

### UI
Bell icon added to portal sidebar (above Theme toggle) with red unread badge. Clicking opens a 300px slide-out panel showing all alerts with color-coded icons.

| Icon color | Notification type |
|-----------|-----------------|
| Blue | Request picked up |
| Green | Request completed |
| Amber | Request rescheduled |
| Purple | Comment / bridge message from team |

"Mark all as read" button + per-notification mark-read (separate routes).

### New Routes
- `GET /portal/notifications` — fetch notifications for logged-in portal user
- `POST /portal/notifications/mark-read` — mark all as read
- `POST /portal/notifications/:id/mark-read` — mark single notification as read

### What Triggers Portal Notifications

| Event | Notification |
|-------|-------------|
| Request picked up | "Request Picked Up — being handled by [name]" (`portal_req_picked`) |
| Request completed | Clears picked notification + creates "Request Completed" (`portal_req_done`) |
| Request rescheduled | "Request Rescheduled — moved to [date]" (`portal_req_rescheduled`) |
| Local team adds comment | "New Comment on Request" (`portal_req_comment`) |
| Local team sends bridge message | "Message from [name]" (`bridge_message`) |

All use `createIfNotExists` to prevent duplicates. Notifications clear automatically when relevant action is taken (e.g. completing a request clears the "picked" notification).

### Bridge Chat — Portal Namespace Fix
`bridgeChatController.sendMessage` and `sendFile` now also emit `bridge:message` on `/portal` namespace to `portal:user:${clientUserId}`. Previously, bridge messages were only emitted to `user:X` rooms in the main namespace — portal users never joined those rooms so they never received real-time bridge messages.

---

## 8. Bug Fixes

### Local Chat Widget — Zero Real-Time (Critical)
**File:** `views/admin/partials/_local-chat.ejs`

The widget checked `if (typeof socket !== 'undefined')` to attach all socket listeners, but `socket` was never defined in the admin hub layout — the actual socket is `admBdrSock`, defined at line ~2005 of `layout.ejs`. The widget is included at line ~1265, so even with an alias, the variable would be `undefined` at inclusion time.

**Fix:** Wrapped all `socket.on(...)` listeners in `document.addEventListener('DOMContentLoaded', ...)`. By `DOMContentLoaded`, all inline scripts including the one at line 2005 have run. Inside the callback, `var socket = admBdrSock` creates a local alias. Two `socket.emit()` calls (typing, join) changed to reference `admBdrSock` directly.

**Impact:** Without this fix, incoming messages, typing indicators, edits, deletes, and presence dots were silently never registered — the widget had no real-time functionality at all.

### Portal Bell — Click-One Marked All Read
**File:** `portal/views/portal/layout.ejs`

`pnpClick()` was calling `POST /portal/notifications/mark-read` which runs `markAllRead()` regardless of which notification was clicked. Added `POST /portal/notifications/:id/mark-read` (calls `Notification.markRead(id, userId)`) and updated `pnpClick` to use the per-notification endpoint.

### Bridge Message Notifications Never Cleared
**File:** `controllers/bridgeChatController.js`

`markAsRead()` was not wired to the notification system. When a CLIENT user reads bridge chat, `Notification.clearByRefForUser` is now called for that conversation and `notification:cleared` is emitted on the portal namespace so the bell badge removes the entry live.

---

## Migrations Applied Today

| File | What |
|------|------|
| `070_notifications_ref_2026-05-30.sql` | `ref_type`, `ref_id` columns + index on `notifications` table |

---

## Files Changed

| File | Summary |
|------|---------|
| `models/Chat.js` | Missing comma fix in getConversationsForUser SQL |
| `models/Notification.js` | Full rewrite: createIfNotExists, clearByRef, clearByRefForUser, ref columns in getForUser |
| `controllers/adminHubController.js` | `section: 'leaves'` fix |
| `controllers/leaveController.js` | apply/approve/reject emit leave notifications; getManagerIds + emitCleared helpers |
| `controllers/compOffController.js` | `_notifyManagers()` emptied — comp-off is informational, not actionable |
| `controllers/clientQueueController.js` | pick() clears client_request_new notification; pick/complete/reschedule/addComment emit portal notifications |
| `controllers/chatController.js` | listUsers method; sendMessage creates chat_message notification; markAsRead clears it |
| `controllers/bridgeChatController.js` | sendMessage/sendFile emit on /portal namespace; sendMessage creates bridge_message notification; markAsRead clears bridge_message notification |
| `portal/controllers/clientRequestController.js` | create() notifies all LOCAL_ADMIN/MANAGER of new request |
| `portal/controllers/chatController.js` | listUsers method |
| `routes/chat.js` | GET /chat/users |
| `portal/routes/portal.js` | GET + POST /portal/notifications routes; POST /portal/notifications/:id/mark-read |
| `views/admin/layout.ejs` | Removed duplicate Leaves link (admin/manager); notification:cleared socket handler; iconClass() for new types; lcwTopBadge button |
| `views/admin/partials/_local-chat.ejs` | New file: full floating chat widget; DOMContentLoaded socket fix; admBdrSock references |
| `portal/views/portal/layout.ejs` | Portal chat widget include; portal notification bell (HTML + CSS + JS); bridge_message icon; pnpClick per-notification fix |
| `portal/views/portal/partials/_portal-chat.ejs` | New file: portal floating chat widget |
| `portal/views/portal/requests.ejs` | fmtTime() fix for picked_at display |
| `views/admin/queue.ejs` | fmtTime() fix for picked_at display |
| `migrations/070_notifications_ref_2026-05-30.sql` | ref_type, ref_id on notifications |
