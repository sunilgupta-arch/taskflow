# Session Summary — May 9, 2026

## Feature: Google SSO, Bot-Proof Login, and Attendance Anomaly Detector

### Google OAuth2 Sign-In
Added Google Single Sign-On as an alternative to password login.

**Flow:**
- `GET /auth/google` — redirects to Google's OAuth consent screen
- `GET /auth/google/callback` — receives the code, exchanges for profile, looks up user by `google_id` or email, issues JWT cookie
- CLIENT_ role users get a 365-day persistent session via Google login (no forced sign-out, since they are typically always signed in on shared devices)
- `users.google_id` column added via migration 049 to link Google accounts to existing users

### Bot-Proof Login
The local-side password login page is now protected against automated scraping and brute-force bots:
- **HMAC-signed page token** — the login form is rendered with a short-lived token. The controller validates the signature on POST; a forged or replayed request is rejected.
- **`middleware/botDetect.js`** — blocks requests from Python `requests`, `curl`, and similar library User-Agents; also validates `Origin` and `Sec-Fetch-Site` headers to distinguish browser-initiated POSTs from scripted ones.
- Legitimate users on real browsers are completely unaffected.

### Security Audit Page (`/admin/security`)
Admin-only page that runs an attendance anomaly check. It queries the last 30 days of `attendance_logs` and flags users whose login/logout times have suspiciously low standard deviation relative to their scheduled shift — an indicator that someone may be scripting their clock-in/out rather than doing it manually.

Output shows each flagged user, their standard deviation score, and a sample of suspicious timestamps so the admin can investigate.

**Files changed:**
- `.env.example` — added Google OAuth env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `SESSION_SECRET`)
- `controllers/authController.js` — `googleAuth`, `googleCallback` handlers; HMAC token generation/validation
- `controllers/adminHubController.js` — `security` method for the audit page
- `middleware/botDetect.js` — new file; UA + header checks
- `migrations/049_google_auth_2026-05-09.sql` — adds `google_id VARCHAR(64)` to `users`
- `routes/auth.js` — `/auth/google` and `/auth/google/callback` routes
- `routes/index.js` — `GET /admin/security`
- `services/authService.js` — `findOrCreateGoogleUser()` helper
- `views/admin/layout.ejs` — Security link in Tools section of sidebar
- `views/admin/security.ejs` — new file; anomaly audit table
- `views/auth/login.ejs` — Google sign-in button + HMAC token hidden field

---

## Fix: Group Channel Audio Deduplication, User Grouping, Auto-Logout Regression

### Channel message deduplication and date dividers
The Group Channel in the admin hub was occasionally rendering duplicate messages when the socket echo arrived after an optimistic local insert. Added a `Set` of rendered message IDs to skip duplicates. Also added date divider rows between messages sent on different days, matching the classic UI behaviour. Sent messages now play audio immediately on the sending client without waiting for the socket echo.

### Users page — group by role
The `/admin/users` page was grouping users by organisation name, which made the table header confusing when LOCAL and CLIENT users appeared intermixed. Changed to group by role category: LOCAL users are split into **Admin / Managers / Users** sub-headers; CLIENT users are split by their own role (CLIENT_ADMIN, CLIENT_MANAGER, etc.).

### Auto-logout regression
A previous session added an aggressive check: if the current time was already past the user's shift end at login, immediately start the auto-logout countdown. This incorrectly booted overnight-shift workers who log in early in the morning before midnight resets the day boundary. The immediate-logout-on-login path was removed; the countdown now only starts from the calculated shift-end moment going forward.

**Files changed:**
- `views/admin/channel.ejs` — message dedup Set, date dividers, immediate own-message audio
- `views/admin/users.ejs` — role-based grouping instead of org-based
- `views/layouts/main.ejs` — removed aggressive auto-logout-on-login trigger

---

## Fix: Notification Sounds Silent Due to New AudioContext on Every Call

**Problem:** All three notification sounds (portal new-message, admin comment sound, admin bridge chat sound) were completely silent after the first interaction. Each call to `playNotificationSound()` was creating a brand new `AudioContext`, which browsers start in `suspended` state. Without a fresh user gesture on the new context, `createOscillator().start()` silently failed every time.

**Root cause pattern:** Three separate functions each had `new AudioContext()` inside the call body rather than reusing a singleton.

**Fix applied to each:**

1. **`portal.js playNotificationSound()`** — converted to singleton `_sndCtx`. Added `_sndUnlocked` flag and `_sndPending` queue. `_unlockSnd()` called on any user interaction to resume the context; pending sounds fire immediately after unlock.

2. **`views/admin/layout.ejs _admPlayCommentSound()`** — removed `new AudioContext()` call; reuses the existing `_admBellCtx` singleton (the bell already manages unlock/resume correctly).

3. **Admin hub bridge chat sound** — same fix; reuses `_admBellCtx` instead of creating a new context.

**Files changed:**
- `portal/public/portal.js` — singleton `_sndCtx`, `_unlockSnd()`, `_sndPending` pattern
- `views/admin/layout.ejs` — `_admPlayCommentSound` and bridge chat sound reuse `_admBellCtx`

---

## Fix: LOCAL_USER Cannot Mark Client Requests Done/Release After Picking

**Problem:** After a LOCAL_USER picked a client request, the Done and Release buttons did not appear. The table row showed no action buttons at all even though the user had just picked the task.

**Root cause:** The frontend checked `inst.picked_by_id` to determine if the current user was the picker. However, the API's SQL query selects the field as `cri.picked_by` (not `picked_by_id`), so `inst.picked_by_id` was always `undefined`. The picker comparison `inst.picked_by_id === currentUserId` never matched, so LOCAL_USER saw no buttons.

**Fix:** Changed the template check from `inst.picked_by_id` to `inst.picked_by` to match the actual API field name.

**Files changed:**
- `views/admin/queue.ejs` — two references changed from `inst.picked_by_id` to `inst.picked_by`

---

## Feature: Client Queue — Latest Comment Column, Quick Comment Modal, UX Compacting

### Latest Comment column
A new **Latest Comment** column was added to the queue table, showing a 45-character snippet of the most recent comment on each instance plus the commenter's name. Hovering reveals the full comment body via `data-tooltip`. The comment is fetched via a correlated `MAX(id)` subquery JOIN in `ClientRequest.getInstances()` — no N+1 queries.

The tooltip system was generalised from `.admq-title-cell[data-desc]` to `td[data-tooltip]` so both the title and comment cells share one tooltip handler.

### Quick comment modal
A purple **Comment** icon button was added to the Actions column of each row. Clicking it opens a small inline modal where the user can type and submit a comment without navigating to the full detail drawer. Posts to the existing `POST /queue/:id/comments` endpoint.

### Icon-only action buttons
The Done (✓), Release (↩), and Comment (💬) buttons were made icon-only with native `title` attributes for browser-native tooltips. This keeps the Actions column narrow enough that it does not overflow on standard screen widths.

### First-name-only for Creator and Picked By
The Creator and Picked By columns now show only the first name. The full name is visible on hover via the generalised `data-tooltip` system.

### Model fix
`ClientRequest.getComments()` and `addComment()` had incorrect aliases for `commenter_name` and `commenter_role` — fixed so the comment author's name appears correctly in both the quick modal and the detail drawer thread.

**Files changed:**
- `models/ClientRequest.js` — correlated subquery for latest_comment in `getInstances()`; alias fixes in `getComments()` and `addComment()`
- `views/admin/queue.ejs` — Latest Comment column, icon-only buttons, quick comment modal HTML + JS, first-name truncation, generalised tooltip system, `commentSnippet()` function, Test Sound button

---

## Fix: Queue Notification Sound Silent on Queue Page and After Audio Auto-Suspend

**Problem:** Multiple layered bugs caused the queue notification bell to play in no situation at all:

1. `queue:new_request` handler suppressed `_admStartBell()` entirely when `admqIsQueuePage` was true — so no bell ever played while sitting on the queue tab.
2. `_admUnlockAudio()` had an `if (_admBellUnlocked) return` early-exit that cached the unlock state. Chrome auto-suspends `AudioContext` after ~30 seconds of silence, so the cached `true` was stale and `resume()` was never called again.
3. The refactored `_admPlayBell()` called `resume()` directly instead of using the `_admBellPending` flag pattern — if `resume()` hadn't settled yet, the tone played against a suspended context and produced silence.
4. **Portal side:** `portal.js` had no `request:comment` socket listener — so clients never heard a notification sound when an admin replied to their request.

**Fixes:**
- `_admUnlockAudio`: removed the early-return; now always checks `_admBellCtx.state === 'running'` and calls `resume()` if needed on every user gesture
- `_admPlayBell`: restored the `_admBellPending = true` pattern — the tone is queued and fires after the context confirms it is running, not before
- `_admPlayCommentSound`: same pending/resume pattern
- `portal.js _unlockSnd`: checks actual `state` instead of cached flag; uses `_sndPending` pattern
- `portal.js`: added `portalSocket.on('request:comment', () => { playNotificationSound(); })` listener
- Added a **Test Sound** button to the queue page topbar so users can verify audio is working without waiting for a real request

**Files changed:**
- `views/admin/layout.ejs` — `_admUnlockAudio` always checks actual state; `_admPlayBell` restored pending pattern; `_admPlayCommentSound` pending/resume
- `views/admin/queue.ejs` — Test Sound button + `admqTestSound()` function; removed `_admStopBell()` call on page load
- `portal/public/portal.js` — `_unlockSnd` checks state; `_doPlaySnd` uses pending pattern; `request:comment` listener added

---

## UX: Timestamps in Request Drawer and Online Users Strip in Group Channel

### Request detail drawer — timestamps
The detail drawer for client request instances previously showed only the scheduled date ("Date"). Three precise timestamps were added:
- **Submitted** — `created_at` with date and time (when the client originally created the request)
- **Picked At** — datetime when a LOCAL team member picked it up
- **Completed At** — datetime when it was marked done

"Date" was renamed to **Scheduled For** to distinguish it from the Submitted timestamp, which eliminates the confusion of seeing two date fields that appeared identical.

### Online users strip — admin hub Group Channel
A horizontal strip of online-user avatars was added below the Group Channel off-canvas header in the admin hub. Each avatar is a purple gradient circle showing two initials with a green online dot at the bottom-right. The current user is excluded.

The strip fetches `GET /channel/users` when the drawer opens and re-fetches on every `channel:presence` socket event so it stays live as people connect and disconnect. When no one else is online it shows "No one else online" in muted text.

### Online users strip — client portal Group Channel
Updated the portal's existing presence strip to match the admin hub visual style: purple gradient background (no border), two initials (was one), green dot only for online users. The offline count label was removed — the strip now shows only online users and auto-hides when empty.

**Files changed:**
- `views/admin/queue.ejs` — Submitted, Picked At, Completed At fields; "Scheduled For" rename
- `views/admin/layout.ejs` — `.adm-gc-online-bar` strip HTML + CSS; `_gcOnlineUsers` map; `_gcRenderOnlineBar()` + `_gcLoadOnlineUsers()` functions; `channel:presence` listener re-fetches
- `portal/views/portal/layout.ejs` — `renderGcPresence()` updated: two initials, no offline count, hides when empty
- `portal/public/portal.css` — `.gc-presence-avatar.online` purple gradient; `.gc-presence-dot` green; removed offline styles

---

## Fix: Play Notification Bell on Queue Page When New Request Arrives

**Problem:** Local users reported that no audio notification sounded when a new client request arrived while they were sitting on the queue tab. The previous assumption was "you can see the new row appear, so you don't need a sound" — but users disagree and want the audio regardless.

**Fix:**
- `queue:new_request` socket handler in `layout.ejs` now always calls `_admStartBell()` unconditionally, with no `admqIsQueuePage` check
- `queue.ejs` no longer calls `_admStopBell()` on page load, so a bell triggered by a request that arrived just before navigation finishes is not silenced

**Files changed:**
- `views/admin/layout.ejs` — removed `if (window.admqIsQueuePage)` branch; always calls `_admStartBell()`
- `views/admin/queue.ejs` — removed `if (typeof _admStopBell === 'function') _admStopBell()` on load

---

## Docs: Blueprint Updated

Updated `BLUEPRINT.md` to reflect current state (as of May 9, 2026):
- Added all newly migrated admin hub routes (taskboard, all-tasks, users, attendance, leaves, notes, helpcenter, live-status, task-completion)
- Added `GET /channel/users` and LOCAL team DM routes
- Added `dm:message` socket event and `request:comment` portal event
- Expanded Client Request Queue description with Latest Comment, icon-only buttons, timestamps, and AudioContext sound behaviour
- Added online users strip description to Group Channel feature
- Added `local_dm_conversations` / `local_dm_messages` model entry
- Updated Section 17 known state: date, migrated pages, Google SSO, bot-proof login, anomaly detector, AudioContext sound system docs, updated "still on classic" list

---

## Summary of All Files Changed

**New files:**
- `middleware/botDetect.js` — bot-proof login middleware
- `migrations/049_google_auth_2026-05-09.sql` — adds `google_id` to users
- `views/admin/security.ejs` — attendance anomaly audit page

**Modified:**
- `controllers/adminHubController.js` — `security` audit page method; Google SSO handler
- `controllers/authController.js` — `googleAuth`, `googleCallback`, HMAC token
- `services/authService.js` — `findOrCreateGoogleUser()`
- `routes/auth.js` — Google OAuth routes
- `routes/index.js` — `/admin/security` route
- `views/auth/login.ejs` — Google sign-in button, HMAC token field
- `.env.example` — Google OAuth env vars
- `views/admin/channel.ejs` — message dedup, date dividers, own-message audio
- `views/admin/users.ejs` — role-based user grouping
- `views/layouts/main.ejs` — removed auto-logout-on-login trigger
- `portal/public/portal.js` — singleton `_sndCtx`, `_unlockSnd`, `_sndPending`, `request:comment` listener
- `views/admin/layout.ejs` — audio fixes; online users strip; timestamps; bell-always-plays
- `models/ClientRequest.js` — latest_comment subquery; alias fixes
- `views/admin/queue.ejs` — Latest Comment column; icon-only buttons; quick comment modal; first-name columns; Test Sound button; field name fix (`picked_by`); timestamps
- `portal/views/portal/layout.ejs` — presence strip: two initials, no offline count
- `portal/public/portal.css` — presence avatar purple gradient, green dot, removed offline styles
- `BLUEPRINT.md` — full documentation update
