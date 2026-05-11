# Session Summary — May 7, 2026

## Fix: Attendance Shows 'Off Shift' Instead of Absent Before Shift Starts

**Problem:** On the attendance management page, employees who hadn't clocked in yet were counted as "Absent" even mid-morning if their shift started at, say, 9 AM and it was currently 8:30 AM. This caused inflated absent counts and confused managers reviewing attendance during a live workday.

**Root cause:** The status logic only checked whether a `login_time` existed for the employee. It had no concept of whether the current time was before or after the employee's `shift_start`.

**Fix:** In `AdminHubController`, for today's date specifically, employees without a login are now classified as `off_shift` if the current local time is before their `shift_start` time. A separate `Off Shift` badge, stat pill, and `statusLabel` entry were added to distinguish this from a true absence.

**UI additions:**
- New `off_shift` status badge (neutral grey) in the attendance table
- New "Off Shift" stat pill in the summary row
- `statusLabel['off_shift']` registered so the status filter dropdown works correctly

**Files changed:**
- `controllers/adminHubController.js` — added `off_shift` classification for today's pre-shift employees
- `views/admin/attendance.ejs` — added badge, stat pill, and status label for `off_shift`

---

## Feature: Rename 'Requests Queue' to 'Allocate Task TI' in Client Portal

**What changed:** The client portal sidebar label, tooltip, and page heading for the work-request section were renamed from "Requests Queue" to "Allocate Task TI" to match the client organisation's internal terminology for this workflow.

**Files changed:**
- `portal/views/portal/layout.ejs` — sidebar nav label and tooltip
- `portal/views/portal/requests.ejs` — page heading

---

## Summary of All Files Changed

**Modified:**
- `controllers/adminHubController.js` — off_shift classification before shift start
- `views/admin/attendance.ejs` — off_shift badge, stat pill, statusLabel entry
- `portal/views/portal/layout.ejs` — rename sidebar label/tooltip
- `portal/views/portal/requests.ejs` — rename page heading
