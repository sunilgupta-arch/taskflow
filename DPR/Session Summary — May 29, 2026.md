# Session Summary — May 29, 2026

## Focus
Major improvements across three areas: Client Queue (local + portal), Auth/403 bug fix, and Local Chat (full feature overhaul — group management, message actions, emoji, search, reactions, lightbox, sound, mute, and more).

---

## 1. Client Queue — Cancelled Task Leakage Fix

**Files:** `models/ClientRequest.js`, `controllers/clientQueueController.js`, `controllers/adminHubController.js`, `views/admin/queue.ejs`

Cancelled tasks were separated from active ones only via client-side JS — a single bug or direct API call could have exposed them in the active list.

- `getQueueForDate()` now runs **two separate SQL queries** — active (`status != 'cancelled'`) and cancelled (`status = 'cancelled'`). Returns `{ instances, cancelledInstances, stats }`.
- Stats are now **derived from the fetched instances** (accurate carry-forward counts) instead of a separate `getDateStats()` query — one fewer DB round-trip per load.
- Both `clientQueueController` and `adminHubController` updated to destructure and pass pre-split arrays.
- `renderTable()` in `queue.ejs` now receives pre-split arrays — no client-side filter needed.
- **Fixed 500 error**: `adminHubController.queue` was missed in first pass; corrected to destructure `queueData`.
- **Cancelled-by info shown in UI**: `cancelled_by_name` JOIN added; cancelled rows display "By [Name] · [time]".

---

## 2. Client Queue — Security & Data Integrity (12 improvements)

**Files:** `models/ClientRequest.js`, `controllers/clientQueueController.js`, `controllers/adminHubController.js`, `portal/controllers/clientRequestController.js`, `views/admin/queue.ejs`, `migrations/066_cri_cancel_audit_2026-05-29.sql`, `migrations/067_cri_uncancel_audit_2026-05-29.sql`

| # | Fix | Details |
|---|-----|---------|
| 1 | Race condition on `pick()` | Removed pre-read SELECT; single atomic UPDATE checks `affectedRows === 0` |
| 2 | `complete()` status gate | Removed `'open'` from allowed statuses — task must be `picked` first |
| 3 | Double-submission guard | Portal `create()` rejects duplicate title from same user within 30 seconds (429) |
| 4 | Cancellation audit | Migration 066: `cancelled_by INT UNSIGNED`, `cancelled_at DATETIME` on `client_request_instances` |
| 5 | Date input validation | `isValidDate()` helper guards all date inputs in queue controller and reschedule |
| 6 | Correlated subquery optimisation | Replaced per-row `COUNT` + correlated comment JOIN with a single pre-aggregated `crc_agg` derived table |
| 7 | Reschedule race condition | `rescheduleInstance()` wrapped in DB transaction with `SELECT FOR UPDATE` |
| 8 | Re-pick rejected tasks | Server blocks `LOCAL_USER` with 403; button hidden from non-admins; confirmation dialog |
| 9 | Stats accuracy | Stats derived from fetched instances (carry-forward included); removed separate `getDateStats()` call |
| 10 | `release()` ownership | Server rejects non-admin/manager releasing a task they didn't pick (403) |
| 11 | `uncancelInstance()` audit | Migration 067: `uncancelled_by`, `uncancelled_at`; controller passes `req.user.id` |
| 12 | `cancelled_by` visible | JOIN added to query; UI shows who cancelled and when on cancelled rows |

---

## 3. Portal Side — Client Request Improvements

**Files:** `portal/controllers/clientRequestController.js`

- **Input validation on `create()` and `update()`**: `recurrence` must be `none/daily/weekly/monthly`; `priority` must be `low/normal/high/urgent`; `start_date` must be valid `YYYY-MM-DD`; `due_time` must be valid `HH:MM` (24-hour); `recurrence_days` required for weekly.
- **`approve`/`reject` role check**: Changed from "creator only" to allow `CLIENT_ADMIN`, `CLIENT_TOP_MGMT`, `CLIENT_MANAGER` to approve/reject any org request. `CLIENT_USER` and `CLIENT_SALES` who didn't create the request get 403.

---

## 4. Portal Sidebar — Collapsed State UI Fix

**File:** `portal/public/portal.css`

- When sidebar is collapsed, the "C" logo (`activity-bar-brand`) is now hidden (`display: none` by default).
- Only the expand/collapse chevron button remains visible, centered in the brand row.
- Expanded state restores the logo alongside the button as before.

---

## 5. Attendance — IST Timezone Display

**Files:** `controllers/adminHubController.js`, `controllers/reportController.js`, `views/admin/my-attendance.ejs`

- Both attendance queries (monthly + today) now include `DATE_FORMAT(CONVERT_TZ(login_time, 'America/New_York', 'Asia/Kolkata'), '%h:%i %p') as loginIst`.
- Calendar day boxes show login time as: `01:51 PM / 11:21 PM IST` — same row, IST in slightly dimmed inline span.
- **Root cause of original empty IST**: admin hub uses `adminHubController.js`, not `reportController.js` — both now updated.
- **Correct conversion**: stored times are Eastern, so `America/New_York → Asia/Kolkata` via MySQL `CONVERT_TZ` (handles DST automatically).

---

## 6. Attendance — Week-Off Check-In Late Modal Fix

**File:** `views/admin/layout.ejs`

When a user logs in on their day off and chooses "Just checking in", the late login modal no longer appears (they're not starting a work shift).

- Late login check exposed as `window._admRunLateCheck()` — not auto-fired immediately.
- Comp-off block sets `window._admCoModalPending = true` on load, deferring the late check.
- After user picks their day-off action:
  - `check_in` → late check suppressed entirely.
  - `working` / `half_day` → `_admRunLateCheck()` called normally.
- If no day-off modal (normal day) → comp-off block releases the check immediately.

---

## 7. Auth — 403 Bug Fix & Session Recovery

**Files:** `middleware/authorize.js`, `routes/auth.js`, `views/error.ejs`

**Problem:** Users with a stale or mismatched cookie landed on a 403 "Your role does not have access" page with no escape — the only recovery was manually deleting the cookie.

**Fixes:**
- `GET /auth/clear-session` — new unauthenticated route; clears both `token` and `tf-token` cookies, redirects to `/auth/login`. Used as escape hatch.
- `requireRoles` and `authorize` middleware: browser requests now **redirect to a safe home page** instead of rendering 403:
  - `LOCAL_*` → `/admin` (accessible to all local roles via `requireLocalAll`)
  - `CLIENT_*` → `/portal`
  - No role → `/auth/login`
  - API/XHR → still returns 403 JSON
- `views/error.ejs` — 403 page adds a "⟳ Clear session & Login again" button with plain-English explanation as a last-resort fallback.

---

## 8. Local Chat — Layout & Full-Page

**File:** `views/admin/chat.ejs`

- Removed `← Comms` back button.
- Height changed from `calc(100vh - 176px)` to `calc(100vh - 92px)` — fills the full available viewport.

---

## 9. Local Chat — 9 UX Features

**File:** `views/admin/chat.ejs`

| # | Feature | Details |
|---|---------|---------|
| 1 | Auto-focus | Textarea gains focus 80ms after conversation opens |
| 2 | Jump to latest | Cyan `↓ Latest` button appears when scrolled up; hides at bottom |
| 3 | Clickable URLs | `linkify()` wraps `http(s)://` links in `<a>` tags |
| 4 | Tab unread count | Browser tab shows `(3) Chat`; updates on socket messages, clears on open |
| 5 | Keyboard shortcuts | `Ctrl+K` = search sidebar, `Ctrl+N` = new conversation, `Ctrl+F` = message search, `Escape` = close modals |
| 6 | Drag-and-drop upload | Drop file onto chat panel — cyan dashed overlay, then attaches |
| 7 | Message hover actions | Clipboard copy button on bubble hover; shows ✓ for 1.5s after copy |
| 8 | @mention in groups | Type `@` → member dropdown → Arrow/Enter/Tab to insert, Escape to dismiss |
| 9 | Group member list | Click group name or people icon → modal with all members, roles, org tags |

---

## 10. Local Chat — Group Management

**Files:** `models/Chat.js`, `controllers/chatController.js`, `routes/chat.js`, `views/admin/chat.ejs`

Three new model methods + controller endpoints + routes:

| Action | Route | Who can |
|--------|-------|---------|
| Leave group | `POST /chat/conversations/:id/leave` | Any member |
| Delete group | `DELETE /chat/conversations/:id` | Creator or LOCAL_ADMIN/MANAGER |
| Remove member | `DELETE /chat/conversations/:id/members/:userId` | Creator or LOCAL_ADMIN/MANAGER (cannot remove creator) |

- Header shows Leave (all members) and Delete (creator/admin only, `bi-x-octagon-fill` icon — distinct from clear chat trash).
- Member list modal shows **Remove** button per member (for creator/admin), **Creator** badge, and **(you)** label.
- Socket events: `chat:group_deleted` removes group from all members' sidebars instantly; `chat:member_removed` removes the group from the kicked user's sidebar.

---

## 11. Local Chat — 6 Message Features

**Files:** `migrations/068_chat_messages_enhancements_2026-05-29.sql`, `models/Chat.js`, `controllers/chatController.js`, `routes/chat.js`, `views/admin/chat.ejs`

**Migration 068** (applied): adds `is_deleted`, `is_edited`, `edited_at`, `reply_to_id` to `chat_messages`; creates `chat_reactions` table.

| # | Feature | Details |
|---|---------|---------|
| 1 | Edit message | Hover → pencil → content in textarea with yellow "Editing" bar → send saves; `edited` badge; socket `chat:message_edited` |
| 2 | Delete message | Hover → red trash → confirm → soft-delete in DB → "Message deleted" shown; socket `chat:message_deleted` |
| 3 | Reply/quote | Hover → reply icon → teal bar above input with preview → sent message shows quote → click to scroll to original |
| 4 | Emoji picker | 😊 button left of textarea → 32-emoji grid; also used as react picker from hover actions |
| 5 | Search | 🔍 in header or `Ctrl+F` → debounced 300ms search → results with highlighted matches → click scrolls to message |
| 6 | Online status | Green dot in DM header when the other person is online via socket `chat:user_online/offline` |

**New routes:** `PATCH /chat/messages/:id`, `DELETE /chat/messages/:id`, `POST /chat/conversations/:id/reply`, `POST /chat/messages/:id/react`, `GET /chat/conversations/:id/search`

---

## 12. Local Chat — 5 More Features

**Files:** `migrations/069_chat_mute_2026-05-29.sql`, `models/Chat.js`, `controllers/chatController.js`, `routes/chat.js`, `views/admin/chat.ejs`

**Migration 069** (applied): adds `is_muted TINYINT(1)` to `chat_participants`.

| # | Feature | Details |
|---|---------|---------|
| 1 | Add members | `+` button in header (creator/admin) → modal excludes existing members → socket `chat:members_added` |
| 2 | Rename group | Pencil icon next to group name (creator/admin) → inline editable input → Enter saves, Escape cancels → socket `chat:renamed` |
| 3 | Notification sound | 🔊 toggle in sidebar header; Web Audio API two-tone beep (no sound file); skipped for muted conversations; preference in localStorage |
| 4 | Image lightbox | Image attachments open in full-screen dark overlay instead of new tab; click anywhere or × to close |
| 5 | Conversation mute | 🔔 bell button in header; suppresses unread badges, tab count, and sound; 🔕 icon shown in sidebar; stored in `chat_participants.is_muted` |

**New routes:** `POST /chat/conversations/:id/members`, `PATCH /chat/conversations/:id/name`, `POST /chat/conversations/:id/mute`

---

## Migrations Applied Today

| File | What |
|------|------|
| `066_cri_cancel_audit_2026-05-29.sql` | `cancelled_by`, `cancelled_at` on `client_request_instances` |
| `067_cri_uncancel_audit_2026-05-29.sql` | `uncancelled_by`, `uncancelled_at` on `client_request_instances` |
| `068_chat_messages_enhancements_2026-05-29.sql` | `is_deleted`, `is_edited`, `edited_at`, `reply_to_id` on `chat_messages`; `chat_reactions` table |
| `069_chat_mute_2026-05-29.sql` | `is_muted` on `chat_participants` |

---

## Files Changed

| File | Summary |
|------|---------|
| `models/ClientRequest.js` | DB-split query, stats derivation, audit trail, atomic pick, complete gate, reschedule transaction |
| `models/Chat.js` | editMessage, deleteMessage, sendReply, toggleReaction, getReactions, searchMessages, addMembers, renameGroup, toggleMute, leaveGroup, deleteGroup, removeMember; getMessages updated for reply/reactions/deleted |
| `controllers/clientQueueController.js` | Date validation, stats from getQueueForDate, ownership checks, role guards |
| `controllers/adminHubController.js` | Updated queue() for cancelledInstances + stats; IST query added |
| `controllers/chatController.js` | editMessage, deleteMessage, sendReply, toggleReaction, searchMessages, addMembers, renameGroup, toggleMute, leaveGroup, deleteGroup, removeMember |
| `controllers/reportController.js` | IST column added to myAttendance query |
| `portal/controllers/clientRequestController.js` | Input validation, duplicate guard, approve/reject role check, cancelInstance userId |
| `middleware/authorize.js` | requireRoles/authorize redirect to safe home instead of 403 |
| `routes/auth.js` | `GET /auth/clear-session` route |
| `routes/chat.js` | 10 new routes for all chat features |
| `routes/index.js` | Minor adjustments |
| `portal/public/portal.css` | Collapsed sidebar hides logo |
| `views/admin/chat.ejs` | Full overhaul — all 20 new chat features wired in |
| `views/admin/layout.ejs` | Week-off late modal fix |
| `views/admin/my-attendance.ejs` | IST display in calendar day boxes |
| `views/admin/queue.ejs` | Pre-split rendering, cancelled_by display, re-pick confirmation |
| `views/error.ejs` | Clear session button on 403 |
| `migrations/066–069` | 4 new migrations, all applied |
