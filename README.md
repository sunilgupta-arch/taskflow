# TaskFlow

Task management and work-allocation platform for two organizations working together — an internal delivery team (**LOCAL**) and the client they deliver for (**CLIENT**).

One Node.js/Express server, one MySQL database, one login page. The user's role decides which of the two completely separate interfaces they land on.

---

## The Two Sides

| | LOCAL side | CLIENT side (Portal) |
|---|---|---|
| **Who** | Internal delivery team | The client's staff |
| **URLs** | `/`, `/admin/*`, `/tasks/*`, `/queue/*`, … | `/portal/*` only |
| **Roles** | `LOCAL_ADMIN`, `LOCAL_MANAGER`, `LOCAL_USER` | `CLIENT_ADMIN`, `CLIENT_TOP_MGMT`, `CLIENT_MGMT`, `CLIENT_MANAGER`, `CLIENT_USER`, `CLIENT_SALES` |
| **Does** | Work the queue, track attendance, run reports, manage the team | Submit work requests, track tasks, chat, view team status |

A `CLIENT_*` user who tries to open a LOCAL URL is redirected to `/portal`, and vice versa. The two sides share the database but almost no UI code.

They meet in four places: the **work request queue** (client submits → local team picks up), **bridge chat** (1:1 across orgs), the **group channel**, and **urgent escalations**.

---

## Quick Start

**Requires** Node.js 18+ and MySQL 8.

```bash
npm install
cp .env.example .env     # fill in DB credentials and JWT_SECRET at minimum
npm run dev              # nodemon, restarts on change
```

Open **http://localhost:5600** (or whatever `PORT` you set — `.env` currently uses 5600).

Database migrations run **automatically on every server start**, so there's no separate migrate step for normal use. To seed sample data:

```bash
npm run seed
```

### Scripts

| Command | What it does |
|---|---|
| `npm start` | Production server |
| `npm run dev` | Development server with auto-reload |
| `npm run seed` | Seed sample users and data |
| `npm run migrate` | Run migrations manually |
| `npm run migrate:latest` | Run only the newest migration |
| `npm test` | Jest suite (33 test files, serial) |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:coverage` | Coverage report |

---

## Configuration

All configuration is environment variables in `.env`. **Never commit this file.** `.env.example` lists the required keys.

**Essential**

```
PORT                 NODE_ENV
DB_HOST  DB_PORT  DB_USER  DB_PASSWORD  DB_NAME  DB_TIMEZONE
JWT_SECRET  JWT_EXPIRES_IN  COOKIE_SECRET
APP_NAME  APP_URL
UPLOAD_PATH  MAX_FILE_SIZE
```

**Optional integrations** — the app runs without these, with the corresponding feature disabled:

```
MAIL_ENABLED  MAIL_USER  MAIL_PASS                          # Gmail SMTP notifications
GOOGLE_CLIENT_ID  GOOGLE_CLIENT_SECRET  GOOGLE_CALLBACK_URL # Sign in with Google
GDRIVE_CLIENT_ID  GDRIVE_CLIENT_SECRET  GDRIVE_REFRESH_TOKEN
TMS_FOLDER_ID  GC_DRIVE_FOLDER_ID  PORTAL_CHAT_DRIVE_FOLDER_ID
BRIDGE_CHAT_DRIVE_FOLDER_ID  URGENT_DRIVE_FOLDER_ID
TASK_ATTACH_DRIVE_FOLDER_ID  PORTAL_TASK_DRIVE_FOLDER_ID
```

Google sign-in is **login-only** — it authenticates existing users but will not create new ones. The callback URL in `.env` must exactly match what's registered in Google Cloud Console.

---

## Architecture

```
taskflow/
├── server.js         Entry point — Express, static, routes, migrations, cron, Socket.IO
├── config/           DB pool, Socket.IO init, Multer, role constants
├── middleware/       JWT auth, role guards, audit logging, SPA-JSON, bot detection
├── routes/           LOCAL side route definitions
├── controllers/      LOCAL side request handlers (24 files)
├── models/           Database access — raw parameterized SQL, no ORM (18 files)
├── services/         Email, Google Drive, backups, task logic, link unfurling
├── utils/            Cron jobs, timezone helpers, migrations runner, logger, seeder
├── views/            LOCAL side EJS templates
│   ├── layouts/      Classic Bootstrap 5 shell
│   └── admin/        Admin Hub — newer dark-theme UI
├── portal/           CLIENT side — its own routes, controllers, models, views, CSS, JS
├── migrations/       Sequential .sql files, applied automatically at boot
├── tests/            Jest specs for models, services, middleware, utils
├── public/           LOCAL static assets
└── uploads/          Attachments (tasks, portal, bridge, urgent)
```

**Stack**: Express 4 · EJS 3 + express-ejs-layouts · MySQL2 · Socket.IO 4 · JWT + bcryptjs · Multer · Nodemailer · node-cron · Winston · Jest.

There is **no frontend build step**. All client-side JavaScript is plain `<script>` tags with global functions — no bundler, no framework. (`frontend/` and `tms_new/` are separate experimental rebuilds that are not part of this server.)

---

## Three User Interfaces

**Classic UI** (`views/layouts/main.ejs`) — Bootstrap 5, sidebar navigation. Currently the default landing experience for LOCAL users; `/` redirects to `/tasks/board`.

**Admin Hub** (`views/admin/layout.ejs`) — a newer dark, VSCode-style UI at `/admin/*`, opt-in from the classic UI. No Bootstrap; custom CSS built on `--adm-*` variables. New LOCAL features are built here first and the classic pages are being retired gradually.

**Client Portal** (`portal/views/portal/layout.ejs`) — the client-facing interface at `/portal/*`. A 48px activity bar on the left that expands on demand, with the group channel docked on the right. Supports light and dark themes; dark is the default.

---

## Feature Overview

**Work management**
- Task board with sessions, completion tracking, and recurring tasks (daily/weekly)
- Client request queue — the client submits work, the local team picks it up, completes it, or reschedules
- Dev workspace — projects, milestones, releases, and update logs, with a read-only client view

**Team operations** (LOCAL only)
- Attendance and shift tracking, with auto-logout at shift end
- Break tracking with live team status
- Leave requests and approvals
- Comp-off credits
- Weekly roster planning for week-offs
- Reports: completion, punctuality, workload, overdue, attendance, daily progress

**Communication**
- Direct messaging with file sharing and voice calls (WebRTC)
- Group channel shared across both organizations, with reactions, pins, mentions, and link previews
- Bridge chat — 1:1 between a client user and a local team member
- Urgent escalation channel with buzz notifications
- Announcements and info board

**Platform**
- Real-time updates over Socket.IO (`/` for LOCAL, `/portal` for CLIENT)
- Google Drive integration for attachments and backups
- Scheduled email notifications (reminders, deadline and overdue alerts, daily summaries, weekly digest)
- Automated database backups with restore, including from Drive
- Audit logging on mutations

---

## Security

- JWT stored in an HTTP-only cookie named `token`
- bcrypt password hashing
- Role guards on every protected route, plus organization-level isolation between the two sides
- All SQL is parameterized
- Login lockout after repeated failures
- File uploads validated by type and size, with per-route limits (5–100 MB depending on context)
- Audit trail on create/update/delete actions

---

## Conventions

- **Models** hold raw SQL. **Controllers** orchestrate. **Services** carry cross-cutting logic.
- **All datetimes are stored in UTC** and displayed in Eastern time. Use the helpers in `utils/timezone.js` — never format a raw `new Date()` for display.
- **New migrations** go in `migrations/` as `NNN_description_YYYY-MM-DD.sql` using the next free number. They apply automatically on the next server start.
- **API responses** use `ApiResponse.success()` / `.error()` from `utils/response.js`.

For a detailed working reference — file-by-file breakdown, database schema notes, and known gotchas — see [CLAUDE.md](CLAUDE.md).
