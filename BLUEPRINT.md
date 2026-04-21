# TaskFlow — Application Blueprint
> **Purpose:** Complete technical reference for AI assistants. Read this first. Do not guess from code alone — this document captures intent, architecture, and conventions.

---

## 1. What Is TaskFlow?

TaskFlow is a **two-organisation task management and communication platform** built on Node.js / Express / MySQL / Socket.IO / EJS.

There are exactly **two organisations** in every deployment:
- **LOCAL** — the service-provider team (admins, managers, users who do the work).
- **CLIENT** — the client organisation (admins, managers, users who assign/monitor the work).

They share one database, one server, and some views, but most pages are siloed by org-type. The LOCAL side lives at `/` routes; the CLIENT side lives at `/portal/` routes. A single JWT cookie authenticates both sides; the middleware enforces the split.

---

## 2. Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js (Express 4) |
| Database | MySQL 2 (promise pool, `dateStrings: true`, UTC driver) |
| Templates | EJS + express-ejs-layouts (extractScripts + extractStyles enabled) |
| Real-time | Socket.IO 4 — main namespace `/` + portal namespace `/portal` |
| Auth | JWT in httpOnly cookie (`tf-token`) |
| File storage | Google Drive (via googleapis) — all uploads go to Drive, served back via Drive view links |
| Scheduling | node-cron — attendance auto-logout, task reminders, scheduled DB backup |
| CSS framework | Bootstrap 5 (classic UI) / custom `--adm-*` CSS variables (new admin hub) |
| Icons | Bootstrap Icons CDN |

---

## 3. Role System

There are **7 roles**. Every user has exactly one.

| Role | Org | What they can do |
|------|-----|-----------------|
| `LOCAL_ADMIN` | LOCAL | Full access: users, tasks, reports, leaves, backups, client queue, admin hub |
| `LOCAL_MANAGER` | LOCAL | Tasks, reports, leaves, client queue; no backup |
| `LOCAL_USER` | LOCAL | Pick & complete assigned tasks; view own progress |
| `CLIENT_ADMIN` | CLIENT | Full portal access: create/assign tasks, manage team, reports, urgent chat |
| `CLIENT_MANAGER` | CLIENT | Create/assign tasks, set rewards, reports |
| `CLIENT_USER` | CLIENT | View/create own tasks; no team-wide access |
| `CLIENT_SALES` | CLIENT | Limited portal; excluded from group channel |

**Key rule enforced by middleware:** Any user whose `role_name` starts with `CLIENT_` is blocked from all `/` (LOCAL) routes and only sees `/portal/` routes.

---

## 4. Authentication & Middleware

### `middleware/authenticate.js`
- Reads `tf-token` cookie → verifies JWT → loads `req.user` (id, name, email, role_name, org_id, org_type, org_timezone, etc.)
- Blocks CLIENT roles from LOCAL routes (redirects to `/portal`)
- Attaches `req.announcements` (active pinned announcements banner) and `req.otherOrgTimezone`

### `middleware/authorize.js`
- `requireRoles(...roles)` — hard-blocks requests with 403 if role not in list
- `authorize(permission)` — checks against `config/constants.js` PERMISSIONS map
- `requireOrgType(type)` — restricts by `LOCAL` or `CLIENT`

### `portal/middleware/portalOnly.js`
- Enforces CLIENT_* role for all `/portal/` routes
- Caches LOCAL_ADMIN info and the delegated support person for bridge chat

### `middleware/spaJson.js`
- When a request carries `X-SPA-Request: 1` header, intercepts `res.render()` and returns the template data object as JSON instead of HTML (used by portal for partial refreshes)

---

## 5. Directory Structure (Key Paths)

```
taskflow/
├── server.js                    ← entry point; middleware, socket.io, cron
├── config/
│   ├── db.js                    ← MySQL pool
│   ├── socket.js                ← init(server) + getIO()
│   └── constants.js             ← ROLES, PERMISSIONS, TASK_STATUS enums
├── middleware/                  ← authenticate, authorize, spaJson, auditLog
├── models/                      ← LOCAL-side DB models
├── controllers/                 ← LOCAL-side controllers
├── routes/
│   ├── index.js                 ← all LOCAL-side + shared routes
│   └── auth.js                  ← login / logout / profile
├── views/
│   ├── layouts/main.ejs         ← classic LOCAL UI shell (Bootstrap, Group Channel panel)
│   ├── admin/layout.ejs         ← NEW admin hub shell (no Bootstrap CSS, --adm-* vars)
│   ├── admin/                   ← new hub pages: dashboard, work, queue, team, reports, comms, tools
│   ├── tasks/                   ← task board, list, create, edit, show
│   ├── users/                   ← user list, progress
│   ├── reports/                 ← all report pages
│   └── ...                      ← other LOCAL pages
├── portal/
│   ├── middleware/portalOnly.js
│   ├── controllers/             ← CLIENT-side controllers
│   ├── models/                  ← CLIENT-side DB models
│   ├── routes/portal.js         ← all /portal/* routes
│   ├── views/portal/            ← CLIENT UI pages + layout.ejs
│   ├── public/
│   │   ├── portal.js            ← CLIENT-side JS (SPA navigation, all portal features)
│   │   └── portal.css           ← CLIENT-side styles
│   └── socket/portalSocket.js   ← socket.io /portal namespace handler
└── utils/
    ├── cronJobs.js
    ├── response.js              ← ApiResponse.success/error/paginated helpers
    ├── timezone.js              ← getToday(), getEffectiveWorkDate(), etc.
    └── auto-migrate.js          ← runs pending DB migrations on server start
```

---

## 6. The Two UIs

### Classic LOCAL UI (`views/layouts/main.ejs`)
- Full-page Bootstrap 5 layout
- Left sidebar with all nav links
- Right sidebar: **Group Channel** panel (always visible for LOCAL users)
- Floating bridge-chat widget (for client messages)
- Nav badge on "Client Queue" link with sound alert for new requests
- `body` height: `100vh; overflow: hidden` — content scrolls inside `#main-content`

### New Admin Hub UI (`views/admin/layout.ejs`)
- Self-contained layout — **no Bootstrap CSS**, only Bootstrap Icons CDN
- CSS variables prefixed `--adm-*` (bg, surface, surface-2, border, accent, text, text-2, muted, mono, font)
- 240px fixed sidebar with section nav (Work, Team, Reports, Comms, Tools)
- Topbar: clock, **Client Queue badge button** (orange), **Group Channel off-canvas** (purple, `bi-people-fill`), **Client Messages off-canvas** (amber, `bi-chat-dots-fill`), theme toggle
- Both slide-over drawers are appended to `<body>` and share the same Socket.IO connection
- `<%- style %>` in `<head>`, `<%- script %>` after layout's own `</script>` just before `</body>`
- **CRITICAL**: Never put `</script>` literal text in comments inside view `<script>` blocks — `express-ejs-layouts` uses a non-greedy regex to extract scripts and will cut the block at that text
- Entry point: "✨ Try New Admin UI" button in classic sidebar footer, visible to LOCAL_ADMIN and LOCAL_MANAGER only

---

## 7. Local-Side Models

### `models/User.js` — table: `users`
Key fields: `id, organization_id, role_id, name, email, password, weekly_off_day, shift_start, shift_hours, leave_status, is_active, avatar`
Key methods: `findById(), findByEmail(), create(), update()`

### `models/Task.js` — tables: `tasks`, `task_instances` (if recurring)
Key fields: `id, title, type (once|recurring), recurrence_pattern, recurrence_days, deadline_time, assigned_to, secondary_assignee, tertiary_assignee, created_by, due_date, reward_amount, status, priority, is_deleted`
Key methods: `findById(), create(), update(), softDelete(), getAll(), startSession(), completeSession()`

### `models/TaskCompletion.js` — table: `task_completions`
Key methods: `logCompletion(), startSession(), completeSession(), getTodaySession(), isCompletedForDate(), undoCompletion()`

### `models/Chat.js` — tables: `chat_conversations, chat_messages, chat_participants, chat_read_status`
For LOCAL↔LOCAL private/group chat.
Key methods: `findDirectConversation(), createConversation(), getConversationsForUser(), getMessages(), sendMessage(), markAsRead(), sendCallMessage()`

### `models/GroupChannel.js` — tables: `group_channel_messages, group_channel_attachments, group_channel_reactions`
The shared cross-team group chat (visible to LOCAL and CLIENT users).
Key methods: `getMessages(limit, beforeId), sendMessage(), editMessage(), deleteMessage(), togglePin(), toggleReactionByUser(), searchMessages(), getPinnedMessages()`
Messages returned **DESC** (newest first) — reverse before rendering in UI.

### `models/BridgeChat.js` — tables: `bridge_conversations, bridge_messages`
One-to-one chat between a CLIENT user and a LOCAL admin/support person.
Key methods: `findOrCreateConversation(), getMessages(), sendMessage(), markAsRead(), getUnreadCount(), getConversationsForLocalUser(), getConversationsForClientUser(), deleteMessage()`

### `models/ClientRequest.js` — tables: `client_requests, client_request_instances, client_request_comments, client_request_attachments`
The work-request system: CLIENT submits tasks → LOCAL picks them up.
Key fields on `client_requests`: `id, org_id, created_by, title, task_type, recurrence (none|daily|weekly|monthly), recurrence_days (JSON), start_date, recurrence_end_date, due_time, priority, assigned_to, is_active`
Key fields on `client_request_instances`: `id, request_id, instance_date, status (open|picked|done|missed|cancelled), picked_by_id, picked_at, completed_by_id, completed_at`
Key methods: `getQueueForDate(dateStr), getDateStats(dateStr), autoMarkMissed(dateStr), pick(), release(), complete(), cancelInstance(), deleteFutureOpenInstances(), getOpenCountForOrg()`
**Carry-forward rule:** One-time requests with `status=open` and `instance_date < today` are NOT auto-marked missed; they surface in today's queue with an "Overdue" badge.

### `models/LeaveRequest.js` — table: `leave_requests`
Key methods: `findById(), create(), createApproved(), updateStatus(), getAll(), hasOverlapping(), getForRange()`

### `models/Reward.js` — table: `rewards_ledger`
Key methods: `create(), markPaid(), getUserSummary(), getAll()`

### `models/Note.js` — table: `notes` (shared by LOCAL and CLIENT via different controllers)

---

## 8. Portal Models

### `portal/models/Chat.js` — tables: `portal_chat_conversations, portal_chat_messages, portal_chat_participants`
CLIENT↔CLIENT conversations (peer chat within the client org).
Methods mirror the LOCAL Chat model.

### `portal/models/Task.js` — tables: `portal_tasks, portal_task_comments, portal_task_attachments`
Tasks created and managed entirely within the client portal.

### `portal/models/UrgentChat.js` — tables: `urgent_chats, urgent_messages, urgent_attachments`
Urgent requests from CLIENT → LOCAL team. CLIENT can "buzz" the team. LOCAL team accepts and responds.

### `portal/models/Reminder.js` — table: `portal_reminders`
Personal reminders for CLIENT users.

### `portal/models/Report.js` — table: `portal_reports`
Shareable reports created by CLIENT users.

### `portal/models/CalendarEvent.js` — table: `portal_calendar_events`
Calendar entries for CLIENT users; also surfaces portal tasks and reminders.

---

## 9. Controllers Reference

### LOCAL-side Controllers

| Controller | Key Methods |
|-----------|-------------|
| `AdminHubController` | `dashboard, work, queue, team, reports, comms, tools` — renders new hub pages with `layout: 'admin/layout'` |
| `TaskController` | `board, index, myTasks, create, assign, pick, start, complete, startSession, completeSession, logCompletion, undoCompletion, deactivate, update, show, addComment, uploadAttachments` |
| `UserController` | `index, create, update, resetPassword, toggleActive, showMyProgress, myMonthlyReport, showProgress, monthlyReport, changePassword` |
| `ReportController` | `reportsIndex, completionReport, rewardReport, attendanceReport, taskCompletionReport, taskDayDetail, overdueReport, punctualityReport, workloadReport, myAttendance, attendanceOverride, forceLogout, addHoliday, removeHoliday` |
| `ClientQueueController` | `index, getQueue, pick, release, complete, getBadgeCount, getDetail, uploadAttachment, addComment` |
| `ChatController` | `index, listConversations, createConversation, getMessages, sendMessage, attachLocal, attachDrive, markAsRead, clearChat, unreadCount, serveAttachment` |
| `GroupChannelController` | `getMessages, sendMessage, sendFile, editMessage, deleteMessage, togglePin, toggleReaction, getPinned, search, unfurl, serveAttachment, getUsers` — shared by LOCAL and CLIENT |
| `BridgeChatController` | `getMyConversations, getMyConversationsForPortal, getMessages, sendMessage, sendFile, markAsRead, deleteMessage, serveAttachment, unreadCount` — shared |
| `BackupController` | `index, create, restore, uploadRestore, uploadToDrive, listDriveBackups, restoreFromDrive, download, destroy, updateSettings` |
| `AuthController` | `showLogin, login, logout, getProfile, checkLateLogin, submitLateReason` |
| `LeaveController` | `index, apply, grant, approve, reject` |
| `RewardController` | `index, markPaid` |
| `LiveStatusController` | `show` — real-time LOCAL team status for CLIENT_ADMIN |
| `AnnouncementController` | `index, create, togglePin, destroy` |
| `NoteController` | `index, create, update, destroy` |
| `DriveController` | `index, listFiles, upload, createFolder, rename, delete, download` |

### CLIENT (Portal) Controllers

| Controller | Key Methods |
|-----------|-------------|
| `ClientRequestController` | `index, getInstances, create, update, deactivate, cancelInstance, getBadgeCount, getTaskTypes, getDetail, uploadAttachment, addComment` |
| `PortalTaskController` | `index, list, create, getTask, update, toggleArchive, addComment, editComment, serveAttachment` |
| `PortalChatController` | `listConversations, createConversation, getMessages, sendMessage, sendFile, markAsRead, unreadCount, searchMessages, editMessage, deleteMessage, getGroupMembers, addGroupMembers, removeGroupMember` |
| `UrgentController` | `create, getActive, getMessages, sendMessage, sendFile, accept, resolve, buzz, getHistory, typing, stopTyping, serveAttachment` |
| `PortalUserController` | `index, list, create, update, resetPassword, toggleActive` |
| `PortalTeamStatusController` | `index, getData, getEmployeeTasks` |

---

## 10. Routes Summary

### Auth Routes (`routes/auth.js`)
```
GET  /auth/login         → AuthController.showLogin
POST /auth/login         → AuthController.login
GET  /auth/logout        → AuthController.logout
GET  /auth/profile       → AuthController.getProfile
POST /auth/late-reason   → AuthController.submitLateReason
```

### LOCAL Routes (`routes/index.js`) — grouped
```
# Tasks
GET  /tasks/board         → board view
GET  /tasks               → full task list
GET  /tasks/my            → my assigned tasks
GET  /tasks/pending-today → tasks due today
POST /tasks/:id/pick      → pick a task
POST /tasks/:id/start     → start a session
POST /tasks/:id/complete  → complete
POST /tasks/:id/comments  → add comment

# Admin Hub (LOCAL_ADMIN / LOCAL_MANAGER only)
GET  /admin               → dashboard
GET  /admin/queue         → client queue (new UI)
GET  /admin/work          → work hub page
GET  /admin/team          → team hub page
GET  /admin/reports       → reports hub page
GET  /admin/comms         → comms hub page
GET  /admin/tools         → tools hub page

# Client Queue (LOCAL team works client tasks)
GET  /queue               → classic queue page
GET  /queue/data          → JSON: instances for date
GET  /queue/badge         → JSON: open count
POST /queue/:id/pick      → pick instance
POST /queue/:id/release   → release with reason
POST /queue/:id/complete  → mark done
GET  /queue/:id/detail    → JSON: full instance detail
POST /queue/:id/comments  → add comment
POST /queue/:id/attachments → upload file to Drive

# Bridge Chat (LOCAL users, floating widget)
GET  /bridge/conversations
GET  /bridge/conversations/:id/messages
POST /bridge/conversations/:id/messages
POST /bridge/conversations/:id/read
GET  /bridge/unread-count
DELETE /bridge/messages/:messageId

# Group Channel
GET  /channel             → full page
GET  /channel/messages    → paginated (before_id param)
POST /channel/messages    → send text
POST /channel/file        → send file (5MB)
PUT  /channel/messages/:id → edit
DELETE /channel/messages/:id → delete
POST /channel/messages/:id/reactions → toggle emoji
POST /channel/messages/:id/pin → toggle pin

# Users, Reports, Leaves, Backups, Rewards, Attendance — see section 4 above
```

### Portal Routes (`portal/routes/portal.js`) — all prefixed `/portal`
```
GET  /portal              → home/dashboard
GET  /portal/requests     → work requests page
GET  /portal/requests/instances → JSON list
POST /portal/requests     → create request
PUT  /portal/requests/:id → edit request (recurrence + schedule changes regenerate future instances)
GET  /portal/chat         → peer chat page
GET  /portal/tasks        → portal tasks page
GET  /portal/calendar     → calendar page
GET  /portal/reports      → reports page
GET  /portal/team-status  → live LOCAL team status (CLIENT_ADMIN only)
GET  /portal/channel      → group channel page
POST /portal/bridge/conversations → get/create bridge chat with LOCAL support
GET  /portal/bridge/conversations → list my bridge conversations
POST /portal/urgent       → create urgent request (buzz local team)
```

---

## 11. Socket.IO Events

### Main Namespace `/`
All LOCAL users and CLIENT users with access to local-side features connect here.

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `queue:new_request` | server→all | `{id, date}` | New client request submitted |
| `queue:updated` | server→all | `{cancelled: instanceId}` | Instance status changed |
| `channel:message` | server→all | full message object | New group channel message |
| `channel:message:edit` | server→all | `{message}` | Message edited |
| `channel:message:delete` | server→all | `{id}` | Message deleted |
| `channel:message:pin` | server→all | `{message, pinned}` | Pin toggled |
| `channel:reaction` | server→all | `{message_id, reactions}` | Reaction updated |
| `channel:presence` | server→all | `{user_id, online}` | Online status |
| `channel:typing` | server→broadcast | `{user_id, user_name}` | Typing in group channel |
| `channel:typing:stop` | server→broadcast | `{user_id}` | Stopped typing |
| `bridge:message` | server→all | full message object | New bridge chat message |
| `bridge:message:delete` | server→all | `{id, conversation_id}` | Bridge message deleted |
| `bridge:typing` | relay | `{conversation_id, user_id}` | Typing in bridge chat |
| `chat:typing` | relay | `{conversation_id, user_id, user_name}` | Typing in local chat |
| `call:offer/answer/ice-candidate/reject/end` | WebRTC relay | various | Peer-to-peer video calls |
| `urgent:new` | server→all | urgent object | New urgent request |
| `urgent:resolved` | server→all | urgent object | Urgent resolved |

### Portal Namespace `/portal`
CLIENT users use this for portal-specific real-time features.

| Event | Direction | Purpose |
|-------|-----------|---------|
| `portal:presence` | server→all | Online status for CLIENT users |
| `portal:typing` / `portal:stop-typing` | relay | Typing in portal chat |
| `portal:read` | relay | Read receipt in portal chat |
| `portal:conv:join` | client→server | Join a conversation room |

---

## 12. Key Feature Descriptions

### Task System (LOCAL)
- Tasks can be `type=once` (one-off) or `type=recurring` (daily/weekly/monthly with `recurrence_days` JSON array for weekly).
- Recurring tasks generate instances via `task_completions` — a task is never "done", completions are logged per date.
- Sessions: `startSession()` records `started_at`; `completeSession()` calculates `duration_minutes` and rewards.
- Rewards: set as `reward_amount` on task, logged to `rewards_ledger` on completion, marked paid by LOCAL_ADMIN.

### Client Request Queue
- CLIENT users create requests via portal (Requests Queue page).
- Backend generates `client_request_instances` rows for each applicable date.
- LOCAL team sees today's instances at `/queue` (classic) or `/admin/queue` (new UI).
- **Pick → Done → Release** lifecycle. Release requires a reason; released instances go back to `open`.
- **Carry-forward:** one-time requests never auto-miss; they persist with "Overdue" badge until picked.
- Live updates via `queue:new_request` and `queue:updated` socket events.
- Queue badge in both classic nav and new admin hub topbar.

### Bridge Chat
- One-to-one channel between a CLIENT user and the LOCAL support (LOCAL_ADMIN or a delegated LOCAL_USER set via `/users/delegate-support`).
- CLIENT starts conversation from portal chat page → `POST /portal/bridge/conversations`.
- LOCAL side has a floating widget in `main.ejs` and a slide-over drawer in `admin/layout.ejs`.
- Unread count badge updates on `bridge:message` socket events.

### Group Channel
- Shared across ALL users (LOCAL + CLIENT except CLIENT_SALES).
- Available as a full page (`/channel`, `/portal/channel`), and as a slide-over in `admin/layout.ejs`.
- Supports: text, files (via Drive), emoji reactions, message pinning, edit, delete, search, link unfurling, reply-to.
- Messages stored DESC in DB; reverse before rendering.

### Urgent Chat
- CLIENT can buzz the LOCAL admin team for urgent matters.
- Buzz sends a push/sound alert; LOCAL team accepts the chat.
- Resolved with a resolution note.
- Available as full page and socket-driven alerts.

### Attendance
- Tracked via `attendance_logs` table (login_time, logout_time, late_reason).
- Cron job auto-logs-out at 11:59 PM LOCAL timezone.
- Late reason submitted separately after login.

### Google Drive Integration
- All file uploads go to Google Drive, not local disk (except DB backups).
- `services/googleDriveService.js` wraps the googleapis client.
- Files are served back via `drive_view_link` stored in attachment tables.
- `BackupController` can also push/pull database backups to/from Drive.

---

## 13. express-ejs-layouts Behaviour (Critical)

`server.js` sets:
```js
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);
```

**What this means:**
- All `<style>` and `<script>` blocks are stripped from view files before the view is placed in the layout.
- They are injected at `<%- style %>` (in `<head>`) and `<%- script %>` (end of `<body>`).

**Rules that must be followed in every view:**
1. `<%- style %>` must appear in layout `<head>` before the layout's own `<style>`.
2. `<%- script %>` must appear AFTER the layout's own closing `</script>` tag, just before `</body>`.
3. **Never write `</script>` as literal text inside a `<script>` block** — even in a comment. The extractor uses a non-greedy regex and will cut the script block at that text, causing "Unexpected end of input".
4. To safely embed server-side JSON in a script: `JSON.stringify(data).replace(/<\//g, '<\\/')` — this turns `</` into `<\/` so the regex and HTML parser never see `</script>`.

---

## 14. Coding Conventions

- **Response format** — all API endpoints use `ApiResponse.success(res, data, message)` or `ApiResponse.error(res, message, statusCode)` from `utils/response.js`.
- **DB queries** — raw SQL via `db.query()` from `config/db.js`. No ORM. Params always passed as array to prevent injection.
- **Date handling** — all dates are stored as strings (`YYYY-MM-DD`) due to `dateStrings: true`. Server timezone is UTC; `utils/timezone.js` converts to LOCAL org timezone for display.
- **Socket emission** — controllers use `const { getIO } = require('../config/socket'); const io = getIO();` wrapped in try/catch to avoid crashing if socket not yet initialized.
- **File uploads** — views send `multipart/form-data`; controller receives via `multer` middleware, uploads to Drive via `GoogleDriveService`, stores `drive_file_id` + `drive_view_link` in DB.
- **Inline scripts in views** — wrap in an IIFE `(function(){ ... })();` to avoid polluting global scope.
- **New admin hub views** — use `--adm-*` CSS variables with hardcoded fallbacks on any element that gets `document.body.appendChild()`-ed (teleported) because it leaves the CSS variable scope.

---

## 15. Environment Variables (`.env`)

```
PORT=3000
DB_HOST / DB_USER / DB_PASS / DB_NAME
JWT_SECRET
COOKIE_SECRET
APP_URL                        ← used for CORS origin
GOOGLE_CREDENTIALS_PATH        ← path to Google service account JSON
GOOGLE_DRIVE_FOLDER_ID         ← root folder for uploads
```

---

## 16. Database Migrations

Auto-run on server start via `utils/auto-migrate.js`. Migration files are in `migrations/` directory, numbered sequentially. Never edit applied migrations — add a new one.

---

## 17. What's In Progress / Known State (as of April 21 2026)

- **New Admin Hub** (`/admin/*`) is built in parallel with the classic UI. Current migrated pages: Dashboard, Work, Queue, Team, Reports, Comms, Tools hub cards + Client Queue full page (`/admin/queue`).
- Classic UI (`/`, `main.ejs`) remains fully functional and untouched.
- The plan: migrate each classic page into the new hub one by one, then retire classic once complete.
- **Client Queue (`/admin/queue`)** is the first fully functional page in the new hub — full pick/done/release lifecycle, detail drawer, comments, attachments, live socket updates.
- Group Channel off-canvas drawer is live in `admin/layout.ejs` (purple icon, full message load + real-time append).
- Bridge Chat off-canvas drawer is live in `admin/layout.ejs` (amber icon, conversation list + per-chat view).
