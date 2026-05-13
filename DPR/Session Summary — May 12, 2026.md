# Session Summary — May 12, 2026

## Focus
Two main areas: (1) client queue robustness — cancel/restore, late-pick workflow, completion remarks, SN/comment fixes; (2) new comp-off credit system (started, uncommitted).

---

## Client Queue — Cancel, Restore & Polish

### Problem
Cancelled requests were inflating the queue total count. Admins had no way to restore a cancelled request. CLIENT_SALES role couldn't assign or create tasks. Deactivated users were still appearing in attendance logs.

### Changes (commit `4443300`)

**`models/ClientRequest.js`**
- Added `uncancel()` method to restore a cancelled request back to open
- `getTotalStats()` now excludes cancelled instances from the total count
- `getQueueForDate()` sorts cancelled rows to the bottom

**`controllers/clientQueueController.js`**
- Added `restoreRequest` handler (admin only)

**`portal/controllers/clientRequestController.js`**
- Request creator can now restore their own cancelled requests via portal

**`routes/index.js` / `portal/routes/portal.js`**
- Wired uncancel routes for admin and portal

**`views/admin/queue.ejs`**
- Show cancelled requests with a toggle; Restore button for admins
- Total stat no longer counts cancelled items

**`portal/views/portal/requests.ejs`**
- Restore button visible to request creator on cancelled rows

**`portal/views/portal/tasks.ejs` / `portal/models/Task.js`**
- CLIENT_SALES users now appear in task assignable users list and can create tasks

**`controllers/adminHubController.js` / `controllers/reportController.js`**
- Deactivated users (`is_active = 0`) hidden from attendance logs

**`controllers/userController.js` / `views/admin/users.ejs`**
- Deactivate user endpoint now returns proper XHR response with error handling on the frontend

---

## Group Channel & Work Page Cleanup

### Changes (commit `12832ad`)

**`controllers/groupChannelController.js`**
- `getUsers` now restricts to `CLIENT_*` roles only (LOCAL_* users excluded from group channel)

**`portal/views/portal/channel.ejs`**
- Removed offline LOCAL_ user count from presence strip (not relevant on portal side)

**`views/admin/work.ejs`**
- Renamed 'All Tasks' card label to 'All Task Manager'

---

## Queue SN, Comments & Permissions Fix

### Problem
Queue SN column was starting at 2 (off-by-one). Portal request-detail comment list was blank because `commenter_name`/`role` fields weren't included. Latest Comment column in admin queue had no data.

### Changes (commit `d0b26bc`)

**`models/ClientRequest.js`**
- Added `latest_comment_text`, `latest_comment_by`, `latest_comment_at` fields to `getQueueForDate()` join

**`views/admin/queue.ejs`**
- Fixed SN counter start to 1

**`portal/views/portal/requests.ejs`**
- Comment list now uses `commenter_name` / `role` fields; avatar initial guarded against null name

**`.claude/settings.json`**
- Added mysql and timezone helper commands to Claude tool permissions

---

## Late Pick & Delayed Done Feature

### Problem
Missed tasks from past dates had no recovery path — agents couldn't pick them up or mark them done after the fact.

### Changes (commits `96d7c6c`, `a4b0711`, `d38a90d`, `3c0ed5c`)

**`models/ClientRequest.js`**
- `pick()` now allows picking instances with `missed` status (not just `open`)
- `complete()` detects past `instance_date` and sets `completed_late = 1`
- `autoMarkMissed()` no longer resets `picked` instances back to `missed` on each page load (was the key bug that broke late-pick entirely)

**`views/admin/queue.ejs`**
- Pick button visible on missed rows regardless of date
- Complete button visible on picked rows on past dates
- Status badge shows **Delayed Done** (purple) when `completed_late = 1`
- Mark Done opens a confirmation modal requiring a remark before completing
- Remark is saved automatically as a comment on the instance
- Release button added on past-date picked rows (table row + detail drawer), allowing a picked task to be released back to missed
- Pick button re-appears for `open` status on past dates (post-release)

**`controllers/clientQueueController.js`**
- Server-side: remark is required to complete a task (validated before update)

**`migrations/051_client_request_completed_late_2026-05-12.sql`** *(new file)*
- `ALTER TABLE client_request_instances ADD COLUMN completed_late TINYINT(1) NOT NULL DEFAULT 0`

---

## Comp-Off Credit System (In Progress — Uncommitted)

### What's built so far
New comp-off system for LOCAL_USER/LOCAL_MANAGER: when a user works on their weekly off day, they earn a comp-off credit that can be applied to a future date (marks attendance as `comp_off`).

**`migrations/052_comp_off_credits_2026-05-12.sql`** *(untracked)*
- New `comp_off_credits` table: `user_id`, `earned_date`, `applied_to_date`, `status` (available/used)
- ALTERs `attendance_logs.manual_status` to include `comp_off` enum value

**`models/CompOff.js`** *(untracked)*
- `earn(userId, earnedDate)` — insert a new available credit
- `getBalance(userId)` — count available credits
- `getHistory(userId)` — full credit history
- `getAllBalanceSummary()` — admin view: all local users with available/used/total/last_earned
- `applyCredits(userId, dates)` — consume N credits against future dates; writes attendance_log entries
- `hasActionToday(userId, dateStr)` — guards against duplicate earn/check-in on same day

**`controllers/compOffController.js`** *(untracked)*
- `checkToday` — returns `showModal: true` if today is the user's weekly off day and no action taken yet
- `offDayAction` — handles three choices: `check_in` (log only), `half_day` (log + notify managers), `working` (earn credit, optionally apply to a future date immediately)
- `applyCompOff` — standalone endpoint to apply balance credits to future dates (validated: all dates must be future)
- `getMyBalance` — returns balance + history for the logged-in user
- `getAdminSummary` — returns balance summary for all active local users
- Notifies LOCAL_ADMIN/LOCAL_MANAGER via socket on comp-off applied or half-day worked

**Modified (uncommitted):** `views/admin/attendance.ejs`, `views/admin/my-attendance.ejs`, `views/admin/layout.ejs`, `routes/index.js`, `controllers/adminHubController.js`, `controllers/reportController.js` — comp-off UI and routing wiring in progress.

---

## Status at End of Day
- All client queue features (cancel/restore, late-pick, delayed done, completion remark) committed and stable.
- Comp-off system: backend fully built; frontend wiring and UI incomplete — needs completion before committing.
