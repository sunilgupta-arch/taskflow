# Session Summary — May 8, 2026

## Feature: Port Classic UI Behaviours to New Admin Hub

**Goal:** Close the feature gap between the classic UI and the new admin hub so LOCAL users have a complete experience without switching back to the classic layout.

### Late Login Reason Modal
Carried over from the classic UI's undismissable overlay. If the user's login time is past their shift start, the hub shows a centred modal requiring them to submit a reason before they can interact with anything. Same `POST /auth/late-reason` endpoint; same "cannot close without submitting" logic.

### Shift-End Warning Modal
15 minutes before the user's shift ends, a modal appears with a live countdown timer showing minutes and seconds remaining. At shift end + 3 beeps (using the existing `_admBellCtx` AudioContext), the user is redirected to the logout flow. The modal cannot be dismissed — it forces the user to either log out or acknowledge the warning.

### Pending Tasks Reminder Modal
1 hour before shift end, if the user has uncompleted tasks assigned for today, a modal lists them as a reminder. Plays 4 beeps via the same AudioContext. Dismissible (unlike the shift-end modal).

### Motivation System (`motivation.js`)
A new client-side module that fires contextual messages throughout the workday:
- **Login greeting** — personalised welcome message when the hub loads
- **Task celebration** — fired when a task completion socket event is received
- **Mid-shift nudge** — encouraging prompt at the midpoint of the shift
- **Logout summary** — overlay shown when "Sign out" is clicked, showing tasks completed today before redirecting

The Sign out button now calls `handleLogout()` instead of navigating directly, so the logout summary fires before the redirect.

### Supporting plumbing
- `USER_TIMEZONE` and `autoLogoutWithReason` global variables added to the layout for shift timing calculations
- `data-user-name` / `data-user-role` attributes on the sidebar user row so `motivation.js` can personalise messages without an extra API call
- `--tf-*` CSS variable aliases added to both light and dark admin hub themes so `motivation.js` logout modal renders with correct colours (it uses the classic UI's variable names)
- `fadeIn` / `scaleIn` keyframe animations added for the logout modal entrance

### Classic UI: 'Try New Admin UI' button for LOCAL_USER
Previously the "Try New Admin UI" banner button in the classic sidebar footer was only shown to LOCAL_ADMIN and LOCAL_MANAGER. Extended to LOCAL_USER so all local team members can access the hub.

**Files changed:**
- `views/admin/layout.ejs` — all of the above: late-login modal, shift-end modal, pending-tasks modal, motivation globals, sign-out handler, CSS aliases, keyframe animations, LOCAL_USER data attributes (~369 lines added)
- `views/layouts/main.ejs` — show "Try New Admin UI" button to LOCAL_USER

---

## UX: Complete 'Allocate Task TI' Rename in Client Portal

**What changed:** Follow-up to May 7's rename — the home dashboard tile label and the page `<title>` tag still said "Requests". Updated both to "Allocate Task TI" so the rename is consistent across every surface in the portal.

**Files changed:**
- `portal/controllers/clientRequestController.js` — updated page title string passed to `index` render
- `portal/views/portal/home.ejs` — updated dashboard tile label

---

## Summary of All Files Changed

**Modified:**
- `views/admin/layout.ejs` — late login modal, shift-end warning, pending tasks reminder, motivation system, CSS aliases, sign-out flow, USER_TIMEZONE global
- `views/layouts/main.ejs` — show New Admin UI button for LOCAL_USER
- `portal/controllers/clientRequestController.js` — page title rename
- `portal/views/portal/home.ejs` — dashboard tile rename
