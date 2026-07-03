# Session Summary — July 3, 2026

## Focus
Designed and built a new **Weekly Roster** system for the LOCAL side — lets managers plan each employee's weekoff a week ahead instead of relying on the old static per-user default, with employee requests as an input and the existing comp-off flow wired to respect the plan.

---

## 1. Problem & Design Discussion

Current system: each LOCAL employee has a single fixed `users.weekly_off_day`. The only way to change it is same-day: work the fixed off-day, earn a comp-off credit, redeem later. No forward planning exists — managers were reactively scrambling for coverage instead of planning ahead.

Investigated the full existing system before building anything: `users.weekly_off_day` (static field, no history), `comp_off_credits` (self-service swap, no manager approval gate), `leave_requests` (request → pending → approve/reject pattern — used as the template for roster requests), and `shift_history` (the existing "resolve a fact as of a date" precedent — used as the template for roster resolution).

**Key design decisions agreed with the user:**
- Roster is a **weekly planning tool for managers**, with employee requests as one input, not an automatic override.
- Editable **anytime, before or after publish** — no hard lock. Any change to a published week notifies the affected employee, so nothing changes silently.
- Edge case (employee requested a day off, manager granted it, but employee ends up working that day anyway): handled by reusing the **existing comp-off earn flow** — just repointed to resolve "is today my weekoff" from the roster instead of the static default. Proactive reschedule = just edit the roster; reactive (already worked) = existing comp-off modal fires automatically.

---

## 2. Data Model

**File:** `migrations/072_weekly_roster_2026-07-03.sql`

- `weekly_rosters` — one row per user per week: `user_id, week_start_date (Monday), weekoff_day, status (draft|published), created_by`. Unique on `(user_id, week_start_date)`.
- `roster_requests` — one row per user per week: `user_id, week_start_date, requested_day, note, status (pending|fulfilled|declined)`. Unique on `(user_id, week_start_date)`, resubmission while pending upserts.

---

## 3. Central Resolution — `models/Roster.js` (new)

Mirrors `models/ShiftHistory.js`'s "resolve a fact as of a date, fall back to the static column" pattern:

- `getWeekStart(dateStr)` — Monday-anchored week start, pure JS.
- `getWeekOffForDate(userId, dateStr, defaultWeekOffDay)` — single-user/date lookup; falls back to the static default if no published roster row exists for that week.
- `getRosterMapForRange(userIds, startDate, endDate)` — batch variant for calendar loops (avoids N+1 across every attendance/report grid); returns a `Map` keyed `${userId}-${weekStartDate}`.
- `getWeekPlan(weekStartDate)` — manager planning-grid data: all LOCAL_USER/LOCAL_MANAGER employees left-joined with any existing roster row and pending request for that week.
- `publishWeek(weekStartDate, assignments, publishedBy)` — transactional upsert of each assignment; auto-resolves matching pending requests to `fulfilled`/`declined`; returns the subset of users whose effective day actually changed.
- `submitRequest`, `getMyRequest`, `getMyRosterForWeek` — employee-facing helpers.

---

## 4. Backend — `controllers/rosterController.js` (new)

Mirrors `controllers/leaveController.js`'s notify/clear idiom exactly (`getManagerIds()` + `Notification.create` + `io.to('user:'+id).emit('notification:new', ...)`, and `Notification.clearByRef` on resolution):

- `submitRequest` — employee requests a day for an upcoming week; notifies all managers.
- `getMyRoster` — employee's own effective weekoff + request status for a week.
- `getWeekPlan` — manager-only planning grid data.
- `publish` — manager-only; publishes the week, clears the manager-side pending-request notifications, and sends a "Weekoff Scheduled" notification to every employee whose day actually changed.

**Routes** (`routes/index.js`): `POST /roster/request`, `GET /roster/mine` (LOCAL_ADMIN/MANAGER/USER); `GET /roster/week`, `POST /roster/week/publish` (LOCAL_ADMIN/MANAGER only — both roles have equal planning/publish rights, using the existing `requireLocalAdmin` composed middleware). Page route `GET /admin/roster` same gating.

---

## 5. Views

- **`views/admin/roster.ejs`** (new) — manager planning grid, matches the `leaves.ejs` structural pattern (`--adm-*` vars, no Bootstrap, IIFE JS, `fetch()` calls). Week picker (prev/next), one row per employee with a 7-day pill selector (default pre-filled, pending requests flagged with a dot marker), "Publish Week" button.
- **`views/admin/team.ejs`** — added a "Roster" hub card next to Comp-Off.
- **`views/admin/my-attendance.ejs`** — added a "Next week's weekoff" widget: shows the resolved day + Planned/Default badge, and a "Request a different day" control that posts to `/roster/request`.
- **`controllers/adminHubController.js`** — new `roster()` page controller (fetches next week's plan by default); `myAttendance()` wired to pass `nextWeekRoster`/`nextWeekRequest` to the widget.

---

## 6. Repointing Existing Weekoff Checks (the part that makes it take effect app-wide)

The same `user.weekly_off_day === dayName` snippet was duplicated across the codebase. Repointed every site to resolve through `Roster` first, falling back to the static default for unplanned weeks:

| File | Sites |
|------|-------|
| `controllers/compOffController.js` | `checkToday` — **highest priority**, this is the exact scenario discussed (roster-assigned day worked → comp-off modal fires, credit earned) |
| `controllers/userController.js` | `showProgress` weekoff check |
| `controllers/liveStatusController.js` | Live Status classification loop (batched) |
| `portal/controllers/teamStatusController.js` | Portal Team Status (read-only consumer, batched) |
| `utils/cronJobs.js` | Late-login reminder skip, overdue-alert skip |
| `controllers/adminHubController.js` | Taskboard `offUserIds`, admin Live Status data, Task Completion Report grid, `_fetchAttendanceData` (main attendance calendar), My Progress, My Attendance calendar (all batched via `getRosterMapForRange`) |
| `controllers/reportController.js` | Completion report calendar, classic My Attendance calendar, Task Completion report grid, Overdue report missed-task check (all batched) |
| `controllers/taskController.js` | Task board `offUserIds` |

**Explicitly out of scope for v1** (flagged, not silently dropped): `models/Task.js`'s two raw-SQL correlated subqueries that filter recurring-task-instance generation by weekoff — SQL-level, lower-visibility background scheduling; still uses the static default. Would need a `DATE_SUB(d, INTERVAL WEEKDAY(d) DAY)` join against `weekly_rosters` to fix properly.

---

## 7. End-to-End Verification (live, against dev DB)

Minted JWTs directly (bypassing the anti-bot login form) to drive the real HTTP endpoints as a manager and an employee:

1. `checkToday` before any roster plan → `showModal:false` (employee's default day is Tuesday, today is Friday) — correct.
2. Employee submitted a request for Friday off this week → three managers got `roster_pending` notifications.
3. Manager fetched the week plan, saw the request flagged, published the week assigning the employee to Friday.
4. Request auto-resolved to `fulfilled`; manager notifications auto-cleared (`is_read=1`); employee got a `roster_published` notification.
5. `checkToday` after publish → `showModal:true, offDay:'Friday'` — the roster override took effect immediately.
6. Called `working` action → new `comp_off_credits` row (`earned_date: 2026-07-03`) created, balance incremented — full comp-off loop fires off a roster-assigned day exactly as it would off the static default.
7. `/admin/roster`, `/admin/team`, `/admin/my-attendance` all render 200 with expected content. LOCAL_USER hitting `/admin/roster` correctly redirected (role gate confirmed).
8. All test data cleaned up (`comp_off_credits`, `attendance_logs`, `weekly_rosters`, `roster_requests`, `notifications` rows deleted) — no residue left in the dev DB.

---

## 8. Manager Communication

Drafted a full-detail email explaining the feature (what changed, why, how managers plan/publish, how the comp-off edge case is handled, editing rules) — saved to `roster-manager-email.md` at the project root and added to `.gitignore` (not tracked, personal draft).

---

## Migrations Applied Today

| File | What |
|------|------|
| `072_weekly_roster_2026-07-03.sql` | New `weekly_rosters` + `roster_requests` tables |

---

## Files Changed

| File | Summary |
|------|---------|
| `models/Roster.js` | New — central weekoff resolution (single + batched), week planning/publish, employee request helpers |
| `controllers/rosterController.js` | New — request/publish/plan API, notification wiring matching leaveController pattern |
| `routes/index.js` | `/roster/*` API routes + `/admin/roster` page route |
| `controllers/adminHubController.js` | New `roster()` page controller; `myAttendance()` next-week widget wiring; repointed weekoff checks in taskboardData, liveStatusData, taskCompletion, `_fetchAttendanceData`, showProgress, myAttendance calendar |
| `views/admin/roster.ejs` | New — manager weekly planning grid |
| `views/admin/team.ejs` | Added Roster hub card |
| `views/admin/my-attendance.ejs` | Added "Next week's weekoff" widget + request form |
| `controllers/compOffController.js` | `checkToday` resolves weekoff via `Roster.getWeekOffForDate` instead of static field |
| `controllers/userController.js` | `showProgress` weekoff check repointed |
| `controllers/liveStatusController.js` | Weekoff classification repointed (batched) |
| `portal/controllers/teamStatusController.js` | Weekoff classification repointed (batched, read-only) |
| `controllers/taskController.js` | Task board `offUserIds` repointed |
| `controllers/reportController.js` | 4 sites repointed (completion report, my attendance, task completion report, overdue report) |
| `utils/cronJobs.js` | Late-login reminder + overdue alert skip repointed |
| `migrations/072_weekly_roster_2026-07-03.sql` | `weekly_rosters` + `roster_requests` tables |
| `roster-manager-email.md` | New (gitignored) — manager-facing explainer email |
| `.gitignore` | Added `roster-manager-email.md` |
