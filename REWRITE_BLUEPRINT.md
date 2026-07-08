# TaskFlow Rewrite — Blueprint

> **Status:** Draft v2, built from a full audit of the current app (2026-07-08) plus your decisions on scope. This is a REDESIGN, not a port. Sections marked **OPEN DECISION** still need your input; everything else below is settled.

---

## 1. Goal & Non-Goals

**Goal:** rebuild TaskFlow with the same purpose (LOCAL team ↔ CLIENT org task/work allocation platform) using a lighter, modern stack — React + TypeScript + Tailwind for two frontends, a single Node + TypeScript MVC backend, same MySQL database (schema can evolve — dev data is disposable).

**Non-goal:** faithfully cloning every current page, table, and code path. The current app has years of accretion: two parallel LOCAL UIs (only one of which is actually still used), five overlapping messaging systems, and copy-pasted SQL boilerplate. The rewrite carries forward genuine business logic and cuts the accidental complexity around it.

**Confirmed decisions (no longer open):**
- Classic Bootstrap UI is fully retired in practice — all real usage is on the admin hub already. It's reference material only, not a UI to preserve.
- Google Drive integration, Auth, and Backup/Restore are **non-negotiable core features** — full functionality, not simplified or swapped out.
- Rewards is **out of v1 scope entirely** — built in the old app but never approved or used by the client. Not being rebuilt unless the client actually asks for it later.
- No prior rewrite attempts (`tms_new/`, `frontend/`) are being referenced or salvaged. Building fresh.

---

## 2. Proposed Architecture

```
taskflow-v2/                        (sibling to taskflow/)
├── apps/
│   ├── api/          Node + Express + TypeScript — single MVC backend
│   ├── local/         React + TS + Tailwind — internal/admin frontend
│   └── client/        React + TS + Tailwind — client portal frontend
└── packages/
    └── ui/            (optional) shared components/design tokens
```

- **Backend:** Express + TypeScript, not a bigger framework (NestJS etc.) — the current business logic (roster resolution, comp-off, recurrence, timezone handling) has real nuance worth porting faithfully; staying close to the current paradigm minimizes behavioral drift risk. Keep `mysql2` with typed hand-written queries rather than introducing an ORM (the app's UTC/`dateStrings:true` timezone handling is already delicate — an ORM that reinterprets dates differently is a real risk, not a hypothetical one).
- **Database:** same MySQL instance. Schema is free to evolve (see §4) since this is a dev environment and data isn't precious.
- **Real-time:** keep Socket.IO. Namespace/room design follows from the messaging consolidation in §3, not the current dual-namespace-by-side split (that split exists because two builds duplicated concepts, not because it's the right cut).
- **Cutover:** since classic UI is already fully retired and this is a dev environment, no incremental traffic-routing layer is needed — build the new app fully, then switch over. No split-brain risk to manage.
- **Auth across origins — OPEN DECISION:** current app uses a JWT in an httpOnly cookie tied to server-rendered pages. With two SPAs potentially served from different origins, decide: cookie-based auth with CORS/SameSite tuned correctly, vs. a bearer token the SPA holds in memory. First real decision of the Auth phase — doesn't block anything else in this document.

---

## 3. Feature Scope for v1

### CORE — required, full functionality, not simplified or swapped out

| Feature | What must be preserved | What changes |
|---|---|---|
| Auth | JWT session, role gating (`LOCAL_*`/`CLIENT_*`), Google OAuth **login-only** (no auto-register) | Minimal — current implementation is already lean (~65 lines for OAuth) |
| Users & roles | 7 roles, org-type split, admin/manager permission tiers | Straightforward port |
| Task management (LOCAL) | once/recurring tasks, sessions (start/complete + duration) | **Redesign:** add a `task_assignees` join table (kills the current one-row-per-assignee + `group_id` hack and its ~80 lines of `GROUP_CONCAT`/`ANY_VALUE` gymnastics); one shared recurrence-expansion utility instead of raw-SQL `FIND_IN_SET` matching |
| Client Request Queue | template → daily instance expansion, full state machine (open→picked→done→approved/rejected/missed/cancelled/rescheduled) with audit trail | **Redesign:** same recurrence utility as Tasks (currently a second, independent recurrence engine — real bug-divergence risk); one parameterized query builder instead of the same JOIN block copy-pasted 3×; one status-stats reducer instead of the same object literal defined 3×. Real logic here is genuinely valuable (818 lines, not the "24K" previously assumed) and shrinks to maybe 300-400 lines with these two changes |
| Messaging | See consolidated design below | **Major redesign** — 5 systems → 2 primitives |
| Attendance & shift tracking | login/logout sessions, late-reason capture, anomaly detection | Port as-is |
| Comp-off | earn/balance/apply/revoke ledger | Already clean (confirmed by audit) — port as-is |
| Weekly Roster | manager plans weekoffs, employee requests, publish/resolve | Port as-is, but **fix**: every weekoff check (including the two raw-SQL task-scheduling filters that currently bypass it) must route through the roster resolver, no exceptions |
| Team Status (portal) | live view of LOCAL team for `CLIENT_ADMIN`/`CLIENT_TOP_MGMT` | Port as-is — genuinely portal-unique, no LOCAL-side mirror needed |
| Portal Tasks | client's own lightweight task tracker (separate table from LOCAL tasks) | Port as-is |
| Downloads | shared file library | **Consolidate**: currently 3 surfaces (public page, LOCAL admin, portal) all hitting one shared model already — keep that one-model design, just build 2 thin views (admin + portal) instead of scattered per-surface logic |
| Google Drive integration | attachment storage across messaging/tasks/queue/downloads, **plus** the Drive Explorer file-browser page | Necessary, full functionality — no swap to local/S3 |
| Backup & Restore | full DB dump/restore, local + Drive storage | Port as-is, **plus actually build** the pre-restore safety-backup + confirmation gate the old docs claimed but the old code never had |

### Messaging — the biggest consolidation opportunity

The current app has **5** distinct messaging systems (a documented "6th," a separate Local-team DM, turned out not to exist — it's just the LOCAL Chat system reused in a slide-over). Audit verdict: **2 primitives cover 100% of current functionality.**

**Primitive A — generic conversation/message system.** Replaces LOCAL Chat, Portal Chat, Group Channel, and Bridge Chat. One schema (participants, messages, reactions, attachments, read-state), parameterized per use:
- `participantMode`: `roster` (chat/portal-chat) | `fixed-pair` (bridge chat) | `implicit-broadcast` (group channel — membership resolved by role query, not a join table)
- `readReceiptStyle`: `per-participant-pointer` | `boolean` | `none`
- feature flags: `reactionsEnabled`, `pinningEnabled` (+ pinner role), `mentionsEnabled`, `editWindowMinutes`, `crossNamespaceEmit` (bridge chat's dual local+portal fan-out)

**Primitive B — urgent/incident alerts.** Replaces Urgent Chat only. Genuinely different shape: a singleton ticket (only one open system-wide at a time), a `waiting → accepted → resolved` state machine, an org-wide "buzz" broadcast, and the only real typing indicators in the app. Can reuse Primitive A's message log as its thread, but the state machine is its own logic layer.

No third primitive is justified — Group Channel's pinning/mentions and Bridge Chat's fixed-pair/boolean-read are config variants of Primitive A, not architectural forks.

### SIMPLIFY — real feature, much leaner implementation

- **Reports** — currently 6 report pages worth keeping (completion stats, overdue, punctuality, workload, task-completion grid, queue report) scattered across classic-only pages and a stripped-down admin-hub version. Consolidate into **one reports module** with shared query patterns, not one-off pages each. (The 7th classic report — reward-per-user — is dropped along with Rewards itself, see below.)
- **Small CRUD widgets** — Notes, Reminders, Calendar events, and portal "Reports" (which is actually just a personal bookmark board, not analytics — misleading name in the old app, don't repeat it) are all simple ownership-scoped CRUD with no real business rules. One generic component/hook can serve all four instead of bespoke code per feature.
- **Cron jobs** — of 11 current jobs, only attendance-cleanup and auto-logout are genuinely load-bearing (and even those are backstops, not primary paths). 8 of the remaining jobs are the same "every 15 min, check a time window, send a notification" pattern — collapse into one generic scheduler function. Keep backup and portal-reminders close to as-is.

### CUT — confirmed dead or out of scope, do not build

- **Rewards** (ledger + all reward UI/reports) — built in the old app, never approved by the client, never used. Not part of v1. If the client asks for it later, revisit as a fresh feature rather than resurrecting the old ledger design.
- "Local team DM" as a separate system — never existed; the docs describing it were wrong.
- `userController.updateLeave` — dead function, fully superseded by `LeaveController`.
- Old dashboard (`/dashboard/overview`) — route and view both work, but zero nav links reach it anywhere; login doesn't even redirect there anymore.
- Unused dependencies from the old `package.json`: `axios`, `express-validator`, `moment` — none are referenced anywhere in the server code; don't carry them into the new stack without a fresh reason.
- Classic Bootstrap UI itself — reference material only when porting logic, never a target to run or maintain.

### DEFER / OPTIONAL — peripheral, don't let these shape core models

- **Dev Workspace** — a real feature (project tracker + a client-facing "Thoughts" feedback channel with attachments/comments), but it's a bolted-on internal tool for the developer's own use, not part of the LOCAL↔CLIENT task-allocation core. 10 tables, 624-line controller that's almost entirely thin pass-through CRUD. **OPEN DECISION: keep (as a later, standalone module) or drop entirely.**
- **Email templates** — 9 exist today, only 3 are actually wired to anything (`requestRescheduled`, `monthlyRequestsReport`, `dailyRequestsReport`); the other 6 were built and never used. Carry forward only the 3 live ones.
- **Security audit page** (login-pattern anomaly detector) — nice bonus, not essential to core value. **OPEN DECISION: v1 or later.**

---

## 4. Data Model Changes vs. Current Schema

Since the DB doesn't need to be preserved byte-for-byte:

1. **`task_assignees` join table** — replaces the current one-row-per-assignee-plus-`group_id` design that forces ~80 lines of `GROUP_CONCAT` gymnastics just to render "one task, N assignees."
2. **One recurrence-expansion utility** (pure function, unit-testable) shared by Tasks and Client Requests, instead of two independent, subtly-inconsistent implementations (raw SQL `FIND_IN_SET` in one, JS `matchesDate()` in the other).
3. **Unified messaging schema** — `conversations` + `messages` + `participants` with a `kind`/config-flag discriminator (per §3), replacing four parallel table sets (`chat_*`, `portal_chat_*`, `group_channel_*`, `bridge_*`).
4. **Urgent/incident schema** — small, separate from messaging; enforces the singleton constraint at the schema level if possible (unique constraint on an `is_active` flag, or a dedicated single-row status table).
5. **Downloads** — keep the current hybrid design (local path + optional external storage id) as the starting point. The migration history shows this exact field design flip-flopped three times in one day (local path → Drive-only → hybrid) before landing here — don't repeat that churn by starting from either extreme again.
6. **No `rewards_ledger` table** — Rewards is out of scope (see §3); don't carry the table or any reward columns forward.

---

## 5. Known Bugs in the Current App Worth Fixing (not preserving)

- **Task scheduling bypasses the Roster resolver.** Two raw-SQL filters in the current `Task.js` read `users.weekly_off_day` directly instead of resolving through the published roster — an employee with a roster override can still be scheduled/excluded based on their stale default day. Fix by routing everything through one resolver with zero exceptions.
- **Backup/restore has no real safety net.** Documentation claims an automatic pre-restore backup and a two-confirmation gate; the actual code has neither. Build it for real this time — this is a required feature, not optional polish.
- **Portal Chat's edit window is unenforced.** A comment claims a 15-minute edit window (matching Group Channel's real one); the code never checks message age. Decide intentionally — enforce it or drop the claim — rather than carry forward an inconsistency nobody meant to ship.

---

## 6. Build Order — Backend First, Then Each Frontend, Domain by Domain

Three sequential tracks. Each domain is built, verified end-to-end, then the next one starts — same incremental philosophy as the rest of this project. **Do not start Track 2 until Track 1 is complete; do not start Track 3 until Track 2 is complete.** Every backend domain gets its API fully built and testable (via curl/Postman/tests) before any frontend touches it.

### Track 1 — Backend (`apps/api`), domain by domain

| # | Domain | Notes |
|---|--------|-------|
| 1 | **Auth** | JWT issuance/verification, role middleware, Google OAuth login-only. Resolve the cross-origin auth decision here. |
| 2 | **Users & Roles** | CRUD, org model, 7 roles, permission tiers. |
| 3 | **File Storage (Google Drive)** | Build as shared infrastructure early — Tasks, Queue, Messaging, and Downloads all need attachment upload/serve, so the Drive service abstraction should exist before those domains need it. |
| 4 | **Attendance & Shift Tracking** | Login/logout sessions, late-reason capture, anomaly detection. |
| 5 | **Weekly Roster** | Depends on Users + Attendance/shift concepts. |
| 6 | **Comp-off** | Depends on Roster (resolves effective weekoff first). |
| 7 | **Task Management (LOCAL)** | New `task_assignees` table, shared recurrence utility, sessions/completion. Must route weekoff checks through Roster — no raw-column shortcuts this time. |
| 8 | **Client Request Queue** | Shares the recurrence utility from step 7. Full state machine + audit trail. |
| 9 | **Messaging Primitive A** (conversations) | Covers LOCAL chat, Portal chat, Group Channel, Bridge Chat via config flags. |
| 10 | **Messaging Primitive B** (urgent/incident) | Singleton ticket + state machine, reuses Primitive A's message log. |
| 11 | **Team Status** | Portal-facing read view; depends on Users, Attendance, Roster. |
| 12 | **Downloads** | One shared model, used by both frontends later. |
| 13 | **Backup & Restore** | Standalone; build the real pre-restore safety net here. |
| 14 | **Notes / Reminders / Calendar** | One generic small-object-CRUD module covering all three. |
| 15 | **Reports module** | Consolidated queries across Tasks/Attendance/Queue — naturally last since it reads from everything above. |

*(Dev Workspace and Security audit slot in after step 15, only if kept per the open decisions in §3.)*

### Track 2 — LOCAL Frontend (`apps/local`), same order, building UI against the now-complete API

| # | Domain | LOCAL-side UI |
|---|--------|----------------|
| 1 | Auth | Login page, protected routing, role-aware nav shell |
| 2 | Users & Roles | Admin user management page |
| 3 | File Storage | Drive Explorer page (admin) |
| 4 | Attendance | My Attendance + admin Attendance management (daily/monthly, overrides, holidays) |
| 5 | Roster | Manager planning grid |
| 6 | Comp-off | Balance/history admin view |
| 7 | Task Management | Task board, all-tasks catalog, my-tasks |
| 8 | Client Request Queue | Queue page — pick/done/release, detail drawer |
| 9 | Messaging (Primitive A) | Chat, Group Channel drawer, Bridge Chat drawer |
| 10 | Messaging (Primitive B) | Receive/accept/resolve urgent alerts |
| 11 | Team Status | *N/A — portal-only feature* |
| 12 | Downloads | Admin downloads page + upload |
| 13 | Backup & Restore | Admin backup/restore page |
| 14 | Notes / Reminders / Calendar | Notes page (LOCAL doesn't use reminders/calendar today, but the module is shared and ready if needed) |
| 15 | Reports | Consolidated LOCAL reports module |

### Track 3 — CLIENT/Portal Frontend (`apps/client`), same order, portal-relevant subset

| # | Domain | Portal-side UI |
|---|--------|-----------------|
| 1 | Auth | Portal login |
| 2 | Users & Roles | Client-admin manages their own org's users |
| 3 | File Storage | *N/A as a standalone page — attachments handled inline within Queue/Messaging* |
| 4 | Attendance | *N/A — client doesn't track its own attendance in this app* |
| 5 | Roster | *N/A to plan — read-only via Team Status (step 11)* |
| 6 | Comp-off | *N/A — LOCAL-only concept* |
| 7 | Task Management | Portal Tasks (client's own lightweight tracker) |
| 8 | Client Request Queue | Submit/track requests, approve/reject completed work |
| 9 | Messaging (Primitive A) | Portal chat, Group Channel (shared), Bridge Chat (client side) |
| 10 | Messaging (Primitive B) | Buzz the LOCAL team, see incident status |
| 11 | Team Status | Live view of the LOCAL team working their account |
| 12 | Downloads | Portal downloads page + upload (client-admin only) |
| 13 | Backup & Restore | *N/A — LOCAL-only* |
| 14 | Notes / Reminders / Calendar | Portal Notes, Reminders, Calendar (all three are real portal features, unlike LOCAL) |
| 15 | Reports | Portal's bookmark-board version — lowest priority in this track |

---

## 7. Open Decisions Before Implementation Starts

1. **Auth across two SPA origins** — cookie (CORS/SameSite) vs. bearer token? Resolve at the start of Track 1, step 1.
2. **Dev Workspace** — keep as a later standalone module, or drop entirely?
3. **Security audit page** — include in v1, or defer?

---

*This document should be treated as living — update it as decisions get made and as implementation surfaces things the audit couldn't see from reading code alone.*
