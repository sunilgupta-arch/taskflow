# TaskFlow — Codebase Reference

> Verified against the working tree on 2026-08-10. If something here contradicts the code, the code wins — fix this file.

## What This App Is

TaskFlow is a Node.js/Express/EJS task management and work-allocation platform serving **two organizations** out of one database and one server process:

- **LOCAL side** — the internal delivery team (routes at `/`, `/admin`, `/tasks`, …)
- **CLIENT side / Portal** — the external client (routes under `/portal` only)

Both sides share one `users` table and one login page. Role prefix decides which side you land on.

---

## Running It

```bash
npm install
cp .env.example .env      # then fill in DB creds, JWT_SECRET, Google keys
npm run dev               # nodemon
npm start                 # production
npm test                  # jest, 33 test files, --runInBand
```

- Dev server: **http://localhost:5600** (`PORT` in `.env`; `server.js` falls back to 3000 if unset)
- MySQL on port **3308** in this dev environment (`DB_PORT`)
- Migrations run automatically on boot — see below. `npm run migrate` / `npm run migrate:latest` are manual escape hatches.
- `/` redirects to `/tasks/board`. Portal users hitting any non-`/portal` URL are bounced to `/portal`.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js, Express 4.18 |
| Templates | EJS 3.1 + `express-ejs-layouts` (`extractScripts`/`extractStyles` on) |
| Database | MySQL2 3.6 — pool in `config/db.js`, `dateStrings: true`, UTC storage |
| Real-time | Socket.IO 4.8 — `/` (local) and `/portal` namespaces |
| Auth | JWT in a cookie named **`token`**, bcryptjs, Google OAuth2 |
| Email | Nodemailer + Gmail SMTP — `services/emailService.js` |
| Files | Multer (memory storage, per-route size caps) + Google Drive API |
| Scheduling | node-cron — `utils/cronJobs.js` |
| Reports | `xlsx` for Excel export |
| Tests | Jest 30 — `tests/**/*.test.js` |

No frontend build step for the app itself. All client JS is plain `<script>` — globals, no modules, no bundler.

---

## Role System

Two families. The prefix (`LOCAL_` / `CLIENT_`) is the access gate.

| Family | Roles (as they exist in the `roles` table) |
|---|---|
| LOCAL | `LOCAL_ADMIN`, `LOCAL_MANAGER`, `LOCAL_USER` |
| CLIENT | `CLIENT_ADMIN`, `CLIENT_TOP_MGMT`, `CLIENT_MGMT`, `CLIENT_MANAGER`, `CLIENT_USER`, `CLIENT_SALES` |

**⚠️ `config/constants.js` is stale** — its `ROLES` enum lists only `CLIENT_ADMIN`, `CLIENT_MANAGER`, `CLIENT_USER`. The other three were added by migrations 028 and 036 and are gated against throughout the portal routes. **Read role names from the DB or from the route guards, not from the enum.**

Enforcement:
- `middleware/authenticate.js` — verifies JWT, loads user + org, and redirects any `CLIENT_*` role away from non-`/portal` URLs.
- `middleware/authorize.js` — `requireRoles(...names)` for per-route gating.
- `portal/middleware/portalOnly.js` — rejects non-`CLIENT_*` on portal routes; also caches `localAdmin` and `delegateSupport` into `res.locals`.
- Dev workspace uses a custom guard: `LOCAL_ADMIN` / `LOCAL_MANAGER` **or** `users.is_developer = 1`.

---

## Directory Structure

```
taskflow/
├── server.js               # Entry: Express, static, routes, migrations, cron, Socket.IO + WebRTC signaling
├── config/
│   ├── db.js               # MySQL2 pool (UTC, dateStrings: true)
│   ├── constants.js        # ROLES/PERMISSIONS enums — INCOMPLETE, see Role System
│   ├── socket.js           # Socket.IO init
│   └── multer.js           # Shared upload config
├── middleware/
│   ├── authenticate.js     # JWT + CLIENT gating + announcement banner + other-org timezone
│   ├── authorize.js        # requireRoles()
│   ├── spaJson.js          # X-SPA-Request: 1 → JSON instead of rendered HTML
│   ├── auditLog.js         # auditLog(action, resourceType) wrapper
│   └── botDetect.js
├── routes/                 # LOCAL side
│   ├── index.js  (373)     # Everything: admin hub, queue, workspace, roster, reports, backups, channel
│   ├── tasks.js  (42)      # → controllers/taskController
│   ├── auth.js   (44)      # Login, logout, Google OAuth, profile
│   ├── chat.js   (44)      # Direct messaging
│   ├── drive.js  (26)      # Google Drive
│   └── help.js   (9)
├── controllers/            # 24 files — LOCAL side
│   ├── adminHubController.js   (1584)  # Admin Hub pages
│   ├── taskController.js       (1209)  # Board, sessions, completion
│   ├── reportController.js     (1190)  # Analytics, attendance, exports
│   ├── chatController.js        (660)
│   ├── devWorkspaceController.js(624)  # Also serves the portal's read-only workspace
│   ├── clientQueueController.js (531)  # Local team works client requests
│   ├── userController.js        (428)
│   ├── groupChannelController.js(319)
│   ├── bridgeChatController.js  (283)  # Also serves portal bridge routes
│   ├── downloadController.js    (244)
│   ├── liveStatusController.js  (236)
│   └── … authController, backupController, breakController, compOffController,
│         rosterController, leaveController, noteController, driveController,
│         announcementController, notificationController, dashboardController,
│         rewardController, helpController
├── models/                 # 18 files — raw SQL over the pool
│   ├── ClientRequest.js (818)  Chat.js (633)  DevProject.js (332)
│   ├── Task.js (302)  GroupChannel.js (301)  BridgeChat.js (238)
│   ├── Roster.js (134)  CompOff.js (150)  TaskCompletion.js (141)
│   └── User.js, Note.js, Notification.js, Reward.js, Download.js,
│       DevThought.js, LeaveRequest.js, ShiftHistory.js, Break.js
├── services/
│   ├── taskService.js       (651)
│   ├── emailService.js      (516)  Gmail SMTP, 5 templates
│   ├── googleDriveService.js(438)
│   ├── backupService.js     (327)  mysqldump + Drive upload
│   ├── authService.js, dashboardService.js, linkUnfurl.js
├── utils/
│   ├── cronJobs.js     (826)  All scheduled work
│   ├── timezone.js     (111)  Eastern helpers — DB is UTC
│   ├── auto-migrate.js  (81)  Runs pending migrations at boot
│   ├── schema.sql             Base schema (pre-migration tables)
│   ├── response.js            ApiResponse.success/error/paginated
│   ├── logger.js              Winston
│   └── seeder.js, migrate.js, migrate-latest.js
├── views/                  # LOCAL side EJS
│   ├── layouts/main.ejs (5233)   Classic UI shell (Bootstrap 5)
│   ├── admin/                    Admin Hub (dark theme) — see below
│   └── auth/ tasks/ users/ reports/ chat/ channel/ attendance/ leaves/
│       notes/ drive/ backup/ queue/ rewards/ dashboard/ announcements/
│       live-status/ help/ public/ error.ejs
├── portal/                 # CLIENT side — separate stack, see next section
├── migrations/             # 73 .sql files, auto-run at boot
├── public/                 # LOCAL static assets
├── uploads/                # tasks/ portal/ bridge/ urgent/
├── tests/                  # 33 Jest test files
├── backups/                # mysqldump output (gitignored content)
├── DPR/                    # Daily progress reports (session summaries)
├── prompts/                # Working notes / specs
├── scripts/                # getGmailToken.js
├── frontend/               # Vite React SPA — EXPERIMENTAL, not wired into the app
└── tms_new/                # Separate React+Express portal rebuild — NOT part of this server
```

`frontend/` and `tms_new/` are independent experiments with their own `package.json` and `node_modules`. Nothing in `server.js` references them. Ignore both unless explicitly asked.

---

## Portal (CLIENT side)

```
portal/
├── routes/portal.js        (887)   Every /portal/* route — pages + JSON APIs inline
├── controllers/
│   ├── clientRequestController.js (444)  Submit/track work requests
│   ├── chatController.js          (415)  Client-to-client DM + groups
│   ├── urgentController.js        (359)  Urgent escalation to local team
│   ├── taskController.js          (343)  portal_tasks CRUD
│   ├── teamStatusController.js    (266)  Live view of the local team
│   ├── userController.js          (162)  CLIENT_ADMIN user management
│   └── downloadController.js      (167)
├── models/                 Chat (364), Task (266), UrgentChat (156),
│                           CalendarEvent (145), Reminder (65), Report (49)
├── middleware/portalOnly.js
├── views/portal/
│   ├── layout.ejs          (3000)  Shell — activity bar, group-channel panel, drawers,
│   │                               ~2000 lines of inline <script>
│   ├── help.ejs (1610)  requests.ejs (1388)  channel.ejs (1367)
│   ├── calendar.ejs (813)  workspace.ejs (739)  home.ejs (445)
│   ├── downloads.ejs (314)  downloads-upload.ejs (244)  reports.ejs (213)
│   ├── chat.ejs (191)  tasks.ejs (129)  notes.ejs (96)
│   ├── team-status.ejs (83)  users.ejs (78)
│   └── partials/_portal-chat.ejs (1219)
├── public/
│   ├── portal.css   (5250)
│   ├── portal.js    (2848)  Plain globals grouped by section
│   └── help-content.js (146)
└── socket/portalSocket.js  (122)   /portal namespace
```

**Shell layout**: VSCode-style. 48px activity bar on the left (`--portal-sidebar-width`), expands to 180px — state in `localStorage['portal-sidebar-expanded']`. Page body renders at `<%- body %>`. A 300px Group Channel panel is docked right (`--gc-panel-width`), collapsed on the `channel` page and hidden entirely for `CLIENT_SALES`.

**Theme**: Bootstrap 5 + custom `portal.css`. Light/dark via `data-bs-theme` on `<html>`, persisted in `localStorage['tf-theme']`, default `dark`. Set by an inline script in `<head>` before paint.

**Navigation is server-rendered full page loads** — the activity bar uses real `<a href>` links. Each route passes `{ title, layout: 'portal/layout', section: '<name>' }`; `section` drives the active nav highlight. The `X-SPA-Request` mechanism exists but portal nav does not use it.

**Pages**: home, chat, tasks, requests, notes, calendar, reports, team-status, users, downloads, channel, workspace, help.
Note: `/portal/reports` is a **personal links manager** (name/url/color rows), not analytics.

**Routes proxied to LOCAL controllers**: bridge chat, group channel, notes, notifications, dev workspace. These `require('../../controllers/…')` — a change there affects both sides.

**Visibility rule, applied consistently**: `CLIENT_ADMIN` and `CLIENT_TOP_MGMT` see all rows; everyone else is filtered to `assigned_to = me OR assigned_by = me`.

---

## LOCAL Side — Two Parallel UIs

### Classic UI — `views/layouts/main.ejs` (5233 lines)
Bootstrap 5, left sidebar + right group-channel panel + floating bridge-chat widget. Still the default: `/` redirects to `/tasks/board`, which is classic.

### Admin Hub — `views/admin/layout.ejs` (3526 lines)
Dark, VSCode-style. Opt-in via a "Try New Admin UI" button. Mounted under `/admin/*`.
- CSS vars: `--adm-bg` (#1a1a1a), `--adm-surface` (#242424), `--adm-border` (#383838), `--adm-text`, `--adm-accent` (#00d4ff)
- No Bootstrap — all custom CSS on `--adm-*` vars
- New LOCAL features go here first

Largest hub pages: `layout.ejs` (3526), `queue.ejs` (2252), `chat.ejs` (1785), `partials/_local-chat.ejs` (1567), `my-tasks.ejs` (1310), `channel.ejs` (1180), `all-tasks.ejs` (1107), `workspace.ejs` (1021).

---

## Key Architectural Patterns

**Migrations.** `utils/auto-migrate.js` runs at boot, before the server listens. It compares filenames in `migrations/` against the **`_migrations`** table (leading underscore) and applies what's missing, in filename order. To add one: `migrations/076_description_YYYY-MM-DD.sql`.
*Current state: 73 files numbered 001–074. There is no 015 or 016, and **059 is used twice** (`059_comp_off_revoked_status_2026-06-01.sql` and `059_workspace_thoughts_2026-05-19.sql`). Both applied fine because ordering is by full filename, but don't reuse a number again.*

**Timezone.** DB stores UTC; the app presents Eastern. Use `utils/timezone.js` — never raw `new Date()` for display. When rendering a DATETIME read back from MySQL, use `getUTCHours()`/`getUTCMinutes()`; `toLocaleTimeString` with an ET zone double-converts.

**SPA partial refresh.** `middleware/spaJson.js` intercepts `res.render()` when the request carries `X-SPA-Request: 1` and returns the view's data object as JSON. Used by some admin hub pages; portal nav does not use it.

**Audit logging.** Wrap a mutation route with `auditLog(action, resourceType)` from `middleware/auditLog.js`.

**API responses.** `utils/response.js` — `ApiResponse.success(res, data, message, status)` / `.error(res, message, status)` / `.paginated(...)`. Used almost everywhere; a few older routes hand-roll `res.json`.

**Uploads.** Multer **memory** storage per route, with the size cap declared inline and a custom error handler that turns `LIMIT_FILE_SIZE` into a 413 JSON body. Caps in use: 5 MB (channel), 10 MB (chat, bridge, urgent), 25 MB (task comments, requests, thoughts), 100 MB (portal generic, backup restore). Files then go to disk under `uploads/` and/or Google Drive.

**Socket.IO.** Auth via the `token` cookie in a namespace-level `io.use()`. Every socket joins `user:<id>`; admins/managers also join `admins`. Presence is tracked in an in-memory `Map` exposed as `app.get('onlineUsers')` — this resets on restart and does not survive multiple processes.

**Voice calls.** `server.js` carries full WebRTC signaling (`call:offer` / `call:answer` / `call:ice-candidate` / `call:reject` / `call:end`), with in-memory `activeCalls` for busy detection and call logging into chat via `Chat.sendCallMessage`. Undocumented elsewhere — check here before touching call code.

**Email.** `services/emailService.js`, Gmail SMTP as `servicea@123cfc.com`, gated by `MAIL_ENABLED`. Five templates. Driven mainly from `utils/cronJobs.js`; not wired into most controllers.

---

## Cron Jobs (`utils/cronJobs.js`)

Fixed-time jobs are registered with the org's timezone.

| Job | Schedule |
|---|---|
| Scheduled backup check | every minute |
| Portal reminder dispatch | every minute |
| Task reminders | every 15 min |
| Auto-logout (shift end) | every 15 min |
| Deadline alerts | every 15 min |
| Overdue alerts | every 15 min |
| Daily summary | every 15 min |
| Attendance cleanup | 23:59 daily |
| Daily requests report | 00:00 daily |
| Downloads cleanup + Drive retry | 03:00 daily |
| Weekly digest | Mon 09:30 |

---

## Database Notes

**Base tables** (`utils/schema.sql`): `users`, `roles`, `organizations`, `tasks`, `task_completions`, `task_comments`, `task_attachments`, `attendance_logs`, `leave_requests`, `rewards_ledger`, `audit_logs`, `notes`.

**Added by migrations** (~55 more), grouped:
- Chat: `chat_conversations`, `chat_messages`, `chat_participants`, `chat_reactions`, `chat_read_status`, `chat_saved_attachments`
- Portal: `portal_tasks`, `portal_task_comments`, `portal_task_attachments`, `portal_conversations`, `portal_messages`, `portal_participants`, `portal_attachments`, `portal_reminders`, `portal_calendar_events`, `portal_reports`, `portal_urgent_chats`, `portal_urgent_messages`, `portal_urgent_attachments`
- Client requests: `client_requests`, `client_request_instances`, `client_request_comments`, `client_request_comment_files`, `client_request_attachments`, `client_request_releases`
- Bridge: `bridge_conversations`, `bridge_messages`, `bridge_attachments`
- Group channel: `group_channel_messages`, `group_channel_attachments`, `group_channel_reactions`, `group_channel_mentions`
- Dev workspace: `dev_projects`, `dev_tasks`, `dev_milestones`, `dev_releases`, `dev_project_updates`, `dev_project_comments`, `dev_project_links`, `dev_notes`, `dev_note_shares`, `dev_thoughts`, `dev_thought_comments`, `dev_thought_files`, `dev_thought_comment_files`
- Ops: `weekly_rosters`, `roster_requests`, `comp_off_credits`, `user_breaks`, `shift_history`, `holidays`, `downloads`, `notifications`, `announcements`, `backup_settings`, `backup_logs`

**Things worth knowing before writing queries:**
- Attendance is **`attendance_logs`**, not `attendance`.
- **There is no `task_instances` table.** Recurring LOCAL tasks live in `tasks` with `type = 'recurring'` + `recurrence_pattern` (`daily`/`weekly`) + `recurrence_days` + `recurrence_end_date`; each day's completion is a row in `task_completions`. Only *client requests* use a real instance table (`client_request_instances`).
- Portal tasks are in `portal_tasks` — **completely separate** from LOCAL `tasks`.
- `comp_off_credits.status` includes `revoked` (migration 059).
- Weekly roster: `models/Roster.js` resolves the effective weekoff for a date — a published `weekly_rosters` row overrides `users.weekly_off_day`, which remains the fallback. Every weekoff check app-wide goes through this resolver **except** the two raw-SQL recurring-task scheduling filters in `models/Task.js`, which still read the static column.
- `organizations.delegated_support_id` names a secondary support contact shown in the portal; `portalOnly.js` caches it in module scope and `clearDelegateCache()` must be called after changing it.

---

## Environment Variables

Names only — values live in `.env` (never commit it).

```
PORT  NODE_ENV
DB_HOST  DB_PORT  DB_USER  DB_PASSWORD  DB_NAME  DB_TIMEZONE
JWT_SECRET  JWT_EXPIRES_IN  COOKIE_SECRET
UPLOAD_PATH  MAX_FILE_SIZE  APP_NAME  APP_URL
MAIL_ENABLED  MAIL_USER  MAIL_PASS
GOOGLE_CLIENT_ID  GOOGLE_CLIENT_SECRET  GOOGLE_CALLBACK_URL     # Sign in with Google
GDRIVE_CLIENT_ID  GDRIVE_CLIENT_SECRET  GDRIVE_REFRESH_TOKEN    # Drive API
TMS_FOLDER_ID  GC_DRIVE_FOLDER_ID  PORTAL_CHAT_DRIVE_FOLDER_ID
BRIDGE_CHAT_DRIVE_FOLDER_ID  URGENT_DRIVE_FOLDER_ID
TASK_ATTACH_DRIVE_FOLDER_ID  PORTAL_TASK_DRIVE_FOLDER_ID
```

Google OAuth is **login-only** — no auto-registration. The callback URL must match Google Cloud Console exactly; dev uses `localhost:5600`, prod uses the LAN address.

---

## Feature Map

| Feature | LOCAL | CLIENT / Portal |
|---|---|---|
| Task board | `views/admin/taskboard.ejs`, `work.ejs`, classic `views/tasks/board.ejs` | `portal/views/portal/tasks.ejs` |
| Direct messaging | `routes/chat.js` → `chatController.js` | `portal/controllers/chatController.js` |
| Group channel | `views/admin/channel.ejs`, `views/channel/index.ejs` | `portal/views/portal/channel.ejs` |
| Bridge chat (1:1 across orgs) | floating widget in both layouts | same, via shared `bridgeChatController` |
| Urgent escalation | `routes/index.js` `/urgent/*` (accept/respond) | `portal/controllers/urgentController.js` (raise) |
| Work request queue | `views/admin/queue.ejs` (pick/complete/reschedule) | `portal/views/portal/requests.ejs` (submit) |
| Dev workspace | `views/admin/workspace.ejs` (full CRUD) | `portal/views/portal/workspace.ejs` (read-only) |
| Reports / analytics | `views/admin/reports.ejs`, `reportController.js` | — (portal "reports" = links manager) |
| Calendar | — | `portal/views/portal/calendar.ejs` |
| Team status | `views/admin/live-status.ejs` | `portal/views/portal/team-status.ejs` |
| Leave management | `views/admin/leaves.ejs` | — |
| Attendance / shifts | `views/admin/attendance.ejs`, `my-attendance.ejs` | — |
| Break tracking | `views/admin/breaks.ejs`, `team-breaks.ejs` | — |
| Comp-off credits | `views/admin/comp-off.ejs` | — |
| Weekly roster | `views/admin/roster.ejs` + `models/Roster.js` | read-only via Team Status |
| Downloads | `views/admin/downloads.ejs` + public `/downloads` | `portal/views/portal/downloads.ejs` |
| Info board / announcements | `views/admin/infoboard.ejs` | banner via `authenticate.js` |
| Notes | `views/admin/notes.ejs` | `portal/views/portal/notes.ejs` (shared model) |
| Google Drive | `routes/drive.js` | — |
| Backups | `views/admin/backup.ejs` | — |
| Voice calls | Socket.IO WebRTC signaling in `server.js` | — |

---

## Conventions

- Models hold raw parameterized SQL; controllers orchestrate; services carry cross-cutting logic. No ORM.
- Route files stay thin, **except `routes/index.js` and `portal/routes/portal.js`**, which both define a fair number of handlers inline. Follow the local style of the file you're editing.
- Client-side JS is global functions called from `onclick=` attributes. No modules, no framework, no build.
- Mixed quote characters inside a JS ternary's string branches cause silent `SyntaxError`s that kill the whole inline `<script>` block. Keep quoting uniform in generated EJS.
- Never commit or push without explicit confirmation.

---

## Contacts

- App/notification email: `servicea@123cfc.com`
- Dev/owner: `sunilgupta@123cfc.com`
