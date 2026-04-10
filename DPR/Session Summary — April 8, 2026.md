# Session Summary — April 8, 2026

## Commits

- `895c2dc` — Add shift_history table to track shift changes over time
- `903e1b6` — Hardcode team clock timezone to Asia/Kolkata
- `328b16f` — Add experimental Vite + Tailwind frontend (SPA) alongside EJS

---

## 1. SHIFT HISTORY TABLE

**Problem:** Users' shifts change frequently (training, rotation, etc.). Previously, updating a shift overwrote the old value. This meant historical attendance reports evaluated past logins against the *wrong* shift times — a user who was on night shift last week would show as "late" if their current shift is morning.

**Solution:**
- New `shift_history` table that records every shift change with an `effective_date`
- When a user's shift is updated, a new history row is created instead of overwriting
- Attendance, late-login detection, live status, and reports now look up the shift that was **actually active on a given date**
- Migration 021 creates the table and seeds initial history from current shift values

**Files Changed:**
- `migrations/021_shift_history_2026-04-09.sql` (new)
- `models/ShiftHistory.js` (new — 54 lines)
- `models/User.js` — updated to create history on shift change
- `controllers/authController.js` — uses historical shift for login checks
- `controllers/liveStatusController.js` — uses historical shift for status display
- `controllers/reportController.js` — uses historical shift for attendance reports
- `controllers/userController.js` — triggers shift history on user edit

---

## 2. TEAM CLOCK TIMEZONE FIX

**Problem:** The team clock widget in the topbar was using the user's browser timezone to display the India team time, which could be wrong if the admin was in a different timezone.

**Fix:**
- Hardcoded the team clock to `Asia/Kolkata` so it always shows accurate India time regardless of the viewer's location

**Files Changed:**
- `views/layouts/main.ejs`

---

## 3. EXPERIMENTAL VITE + TAILWIND FRONTEND (SPA)

**Problem:** The existing EJS-based server-rendered frontend works but has limitations for interactivity and modern UI patterns. Explored building a parallel SPA frontend.

**What was built:**
- Scaffolded `frontend/` directory with Vite, Tailwind CSS, and vanilla JS
- Hash-based router mirroring all existing EJS routes
- `spaJson` middleware that intercepts `res.render()` to return JSON when the SPA requests it
- Page shells for all major routes: tasks, dashboard, attendance, chat, reports, etc.
- API utility layer for authenticated requests
- Main layout with sidebar navigation

**Status:** Experimental / not active in production. Kept separate from the working EJS app.

**Files Changed:**
- `frontend/` — 40 new files (1,300+ lines of frontend code + package-lock)
- `middleware/spaJson.js` (new)
- `server.js` — added SPA middleware

---

## Files Changed Summary

| Commit | Files | Additions | Deletions |
|---|---|---|---|
| `895c2dc` | 7 files | 170 | 14 |
| `903e1b6` | 1 file | 2 | 4 |
| `328b16f` | 42 files | 4,007 | 0 |
| **Total** | **50 file changes** | **4,179** | **18** |
