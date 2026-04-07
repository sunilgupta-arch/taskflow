# Session Summary — April 6, 2026

## Commits

- `ee9395e` — Add live client/team clocks & shift countdown to topbar header
- `55fb82d` — Fixed the timing issue and added a new Live Status Board
- `8ccf159` — Add admin force-logout, fix stale live-status sessions & progress page bugs

---

## 1. LIVE CLOCKS IN TOPBAR

**Problem:** Users had no quick way to see the client's timezone or know how much shift time remained.

**Built:**
- **Client Time clock** — real-time ticking clock showing client org timezone
- **Team Time clock** — real-time ticking clock showing local org timezone
- **Shift Remaining countdown** — shows hours and minutes left in shift, visible only to LOCAL_USER and LOCAL_MANAGER
- Clocks update every second using `toLocaleTimeString` with respective IANA timezones
- Middleware updated to pass `otherOrgTimezone` to all views

**Files:** `middleware/authenticate.js`, `views/layouts/main.ejs` (2 files, 94 additions)

---

## 2. LIVE STATUS BOARD

**Problem:** Admins/managers had no real-time visibility into who was working, what tasks they were on, and session durations.

**Built:**
- **New page: `/live-status`** — real-time employee status board
- **New controller:** `liveStatusController.js` (201 lines)
- **Employee cards** showing:
  - Current status: Active, On Break, Idle, Extending Shift
  - Current task being worked on with session duration
  - Login time, total active time, break count
  - Shift progress bar
- **Auto-refresh** — page polls for updates
- **Sidebar link** added for LOCAL_ADMIN, LOCAL_MANAGER, CLIENT_ADMIN, CLIENT_MANAGER

**Timing Fixes (in same commit):**
- Fixed timezone issues across dashboard, leave, report, task, and user controllers
- Updated cron jobs to use correct timezone calculations
- Fixed task show page with dual-timezone display (IST/ET) for task logs
- Enhanced `timezone.js` with additional utility functions

**Files:** 13 files, 664 additions, 58 deletions

---

## 3. ADMIN FORCE-LOGOUT & BUG FIXES

**Problem:** Stale sessions showed users as "Active" on live status even when they'd left. Progress page had incorrect completion counts.

**Built:**
- **Force-logout endpoint:** `POST /attendance/force-logout` — admin can manually end stale sessions
- **"Logout" button on attendance page** — appears next to active sessions for LOCAL_ADMIN/MANAGER
- **"Force Logout" button on live-status page** — for idle/extending/stale employees
- Sets `logout_reason = 'Admin Force Logout by [admin_name]'`

**Bug Fixes:**
- **Live status stale sessions** — filtered task sessions to today/yesterday only, preventing days-old sessions showing as "Extending Shift"
- **Progress page completion count** — changed `tc.id IS NOT NULL` to `tc.completed_at IS NOT NULL` to exclude started-but-not-completed tasks from "done" count
- **Ghost "Completed: 05:30:00 am" time** — fixed `new Date(null)` + IST offset showing phantom completion times
- **"In progress" badge** — added cyan badge for recurring tasks currently being worked on
- **Timezone consistency** — attendance absent check, overdue/completion reports, and leave validation all updated to use LOCAL org timezone instead of viewer's timezone

**Files:** 7 files, 99 additions, 5 deletions

---

## Files Changed Summary

| Commit | Files | Additions | Deletions |
|---|---|---|---|
| `ee9395e` | 2 files | 94 | 1 |
| `55fb82d` | 13 files | 664 | 58 |
| `8ccf159` | 7 files | 99 | 5 |
| **Total** | **16 file changes** | **857** | **64** |

### New Files Created
- `controllers/liveStatusController.js`
- `views/live-status/index.ejs`
