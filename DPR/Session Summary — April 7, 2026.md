# Session Summary — April 7, 2026

## Commits

- `437b105` — Switch to America/New_York timezone, add shift-end warning, auto-logout, holidays & UI cleanup
- `75c3a20` — Add CLIENT_USER role, Info Board announcements & fix overdue alert timing

---

## 1. ATTENDANCE LOGOUT COLUMN FIX

**Problem:** When viewing yesterday's attendance, users like Priyanka Suri showed "Active" with a Logout button — impossible since their shift already ended.

**Fix:**
- Past dates with no logout → shows **"No Logout"** in red
- Today with no logout → shows "Active" + admin Logout button (unchanged)
- Duration column shows "—" for past dates with missing logout instead of bogus hours

---

## 2. SHIFT-END WARNING & AUTO-LOGOUT SYSTEM

**Problem:** No warning before auto-logout. Users got silently logged out 3 hours after shift end.

**Built:**
- **Shift-end warning modal** — appears 5 minutes before shift ends with countdown timer
- Two buttons: **"Logout Now"** (immediate) or **"Continue (2 hrs)"** (extends session)
- If user doesn't respond → auto-logout when timer hits zero
- If user clicks Continue → auto-logout 2 hours later
- **Server-side safety net** — cron runs every 15 min, catches sessions where browser was closed, sets logout_time to actual shift-end time (not NOW())

---

## 3. AUTO-LOGOUT DISPLAY

**Problem:** Auto-logout records showed wrong times and no indication it was automatic.

**Fix:**
- Logout column shows time + **"Auto Logout"** label in amber with robot icon
- Logout time set to **shift end time** (not when cron ran)
- Unified all old auto-logout reasons ("Auto - Session Expired", "Auto - Stale Session Cleanup") to consistent "Auto Logout"

---

## 4. COMPLETE TIMEZONE MIGRATION (UTC → America/New_York)

**Problem:** System stored timestamps in UTC and used CONVERT_TZ everywhere — complex, error-prone, caused bugs with auto-logout times.

**What changed (28+ files):**
- **Database:** MySQL session timezone set to `America/New_York` — NOW() returns ET natively
- **No data migration needed** — all columns are TIMESTAMP type, auto-adjust with session timezone
- **shift_start** values converted from IST to ET (e.g., 19:30 IST → 10:00 ET)
- **Removed ALL CONVERT_TZ** from every SQL query (14 instances across 5 controllers)
- **Removed 4 utility functions** — `getUTCNow`, `getTimezoneOffsetString`, `getTimezoneOffsetMinutes`, `formatTime`
- **Replaced `getUTCNow()`** with SQL `NOW()` in TaskCompletion model and taskService
- **Updated 24+ `|| 'UTC'` fallbacks** to `|| 'America/New_York'` across all controllers, services, cron jobs
- **Client-side:** Changed `en-IN` locale to `en-US` in 4 view files, removed IST/dual-timezone display from task logs
- **Config:** `.env`, `config/db.js`, `backupService.js` all updated
- **Schema & seeder:** Default timezone changed to `America/New_York`
- **Migration 017** handles client VM deployment automatically
- **Removed migrations 015 & 016** (interim auto-logout fixes, no longer needed)

---

## 5. ORGANIZATION-WIDE HOLIDAYS

**Problem:** Admin had to manually update attendance for every user on holidays.

**Built:**
- **`holidays` table** — date, name, organization_id
- **"Manage Holidays" button** on attendance calendar header
- **Holiday modal** — add date + name, see list for current month, delete
- **Calendar logic** — holidays checked right after weekly off, before absent marking
- **All users automatically get holiday status** — no per-user override needed
- **Shows everywhere:**
  - Attendance calendar: purple **"H*"** badge with holiday name tooltip
  - Personal attendance (my.ejs): purple calendar-heart icon with holiday name
  - Task completion report: purple **"H"** badge
  - All three have holiday in their legends
- **Working days count** excludes holidays in monthly stats
- **"Holiday" added to attendance override dropdown** as manual option too

---

## 6. DASHBOARD → TASK BOARD SWAP

**Problem:** Dashboard was cluttered and not useful; Task Board was more practical.

**Fix:**
- `/` and `/dashboard` now redirect to `/tasks/board`
- Login lands on Task Board (admins/managers) or Tasks list (users)
- Old dashboard accessible at `/dashboard/overview`
- Small "Dashboard" link added to Task Board header
- Sidebar: Task Board moved to first position, Dashboard link removed

---

## 7. ROLE DROPDOWN FILTER BY ORGANIZATION

**Problem:** When creating/editing users, all 5 roles showed regardless of selected organization — could accidentally assign LOCAL roles to CLIENT org users.

**Fix:**
- Selecting **Client Organization** → shows only `CLIENT_ADMIN`, `CLIENT_MANAGER`, `CLIENT_USER`
- Selecting **Local Organization** → shows only `LOCAL_ADMIN`, `LOCAL_MANAGER`, `LOCAL_USER`
- Filters on page load, on org change, and when editing existing users

---

## 8. CLIENT_USER ROLE

**Problem:** Client needed regular users (not just admin/manager) who could assign tasks to the local team.

**Built:**
- **New role: `CLIENT_USER`** (id: 6) with migration 019
- **Can create tasks** and assign to LOCAL_ADMIN/MANAGER/USER
- **Can view** tasks they created + tasks assigned to them
- **Can edit, deactivate, delete** their own tasks
- **Tasks assigned TO CLIENT_USER** by CLIENT admin/manager are **hidden from LOCAL team** (client-internal)
- **No attendance** — login skips attendance recording
- **No shift restrictions** — no shift-end warning, no auto-logout, no late login modal, no logout reason modal
- **Sidebar:** Tasks, Create Task, Chat, Drive, Rewards, Notes, Help (no Task Board, Reports, Attendance, Admin)
- **Login redirect:** Goes to `/tasks` (task list) instead of Task Board
- **Constants & permissions** updated in `config/constants.js`

---

## 9. INFO BOARD (ANNOUNCEMENTS)

**Problem:** Admin had no way to communicate daily updates/priorities to the team.

**Built:**
- **`announcements` table** — title, body, is_pinned, audience (local/client/all), created_by
- **Audience system:**
  - `local` — only LOCAL team sees it
  - `client` — only CLIENT team sees it
  - `all` — both teams see it
- **Who can post:**
  - LOCAL_ADMIN → posts to local team (automatic)
  - CLIENT_ADMIN/MANAGER → posts with audience dropdown: "Client Team Only" or "All Teams (inc. Local)"
- **Banner on all pages:**
  - Two-column layout: Local Team (purple, left) / Client (amber, right)
  - Shows latest 3-4 posts, pinned first
  - Dismissible per page view (comes back on refresh)
  - Hidden on the Info Board page itself (no duplication)
- **Dedicated page (`/announcements`):**
  - Same two-column layout
  - Admin create form at top with title, body, pin checkbox, audience selector
  - Pin/unpin and delete buttons
  - Author name, role, and timestamp on each post
  - "ALL TEAMS" badge on cross-team posts
- **Security:**
  - LOCAL_ADMIN cannot delete/pin CLIENT posts (and vice versa)
  - Both UI buttons and API endpoints enforce org-level ownership
- **Sidebar:** "Info Board" with megaphone icon for LOCAL team + CLIENT admin/manager

---

## 10. OVERDUE ALERT TIMING FIX

**Problem:** Overdue alert fired at fixed 9:00 AM ET for ALL users — night shift users (shift 10:00 AM ET) got alerts before their shift started. Also reported all recurring tasks as missed regardless of schedule.

**Fix:**
- Changed from fixed 9 AM cron to **every 15 minutes**, triggers **per-user at their shift start**
- Example: Geetika (00:30 ET) gets alert at 00:30, Priyanka (10:00 ET) gets alert at 10:00
- Added **`isScheduledForDate` filter** — weekly tasks only reported as missed on their scheduled days
- Each user gets the alert **exactly once per day** (tracked in memory)

---

## Files Changed Summary

| Commit | Files | Additions | Deletions |
|---|---|---|---|
| `437b105` | 30 files | 587 | 294 |
| `75c3a20` | 16 files | 521 | 38 |
| **Total** | **46 file changes** | **1,108** | **332** |

### New Files Created
- `migrations/017_timezone_to_eastern_2026-04-07.sql`
- `migrations/018_holidays_table_2026-04-07.sql`
- `migrations/019_client_user_role_2026-04-07.sql`
- `migrations/020_announcements_table_2026-04-07.sql`
- `controllers/announcementController.js`
- `views/announcements/index.ejs`

### Files Deleted
- `migrations/015_fix_auto_logout_times_2026-04-07.sql`
- `migrations/016_fix_auto_logout_times_v2_2026-04-07.sql`
