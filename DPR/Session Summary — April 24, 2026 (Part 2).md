# Session Summary — April 24, 2026 (Part 2)

## Queue: Cancelled Request Filtering

**Problem:** Cancelled client requests still appeared in the local admin queue and on the client portal.

**Local queue fix (`models/ClientRequest.js`):**
- Added `AND cri.status != 'cancelled'` to the `getQueueForDate` WHERE clause
- Removed `WHEN 'cancelled' THEN 4` from ORDER BY (no longer needed)

**Portal fix (`portal/views/portal/requests.ejs`):**
- Cancelled instances hidden by default in `renderInstances` — separated into `active` and `cancelled` arrays
- "Show X cancelled request(s)" toggle link rendered below the table when cancelled exist
- Clicking reveals cancelled rows (strikethrough + 50% opacity); clicking again hides them
- CSS: `.req-row-cancelled`, `.req-cancelled-toggle`

---

## Queue: Request Comment Notifications (Two-Way)

**Problem:** When a local user added a comment/query on a picked request, the client had no idea. When the client replied, the local user had no idea.

**Model (`models/ClientRequest.js`):**
- Added `getInstanceContext(instanceId)` — returns `id`, `picked_by`, `instance_date`, `title`, `created_by`, `org_id` for a given instance; used by both controllers to target the right socket room

**Local queue comment (`controllers/clientQueueController.js`):**
- After saving comment, emits `request:comment` to `/portal` namespace on `portal:user:${ctx.created_by}` room
- Payload: `{ instance_id, instance_date, title, body, commenter_name, commenter_role }`

**Portal comment (`portal/controllers/clientRequestController.js`):**
- After saving comment, emits `request:comment` to main namespace
- Targets `user:${ctx.picked_by}` if picked, otherwise `admins` room
- Same payload shape

**Admin hub layout (`views/admin/layout.ejs`):**
- Added `#_admToastContainer` div + CSS (top-center position, solid `--adm-surface-2` background, top accent border, slide-in animation)
- `_admPlayCommentSound()` — two-note WhatsApp-style ping (880 Hz → 1108 Hz, staggered 110ms, sine wave, ~130–160ms decay)
- `_admShowToast(title, text, instanceId)` — renders toast; click navigates to `/admin/queue`
- `_admEsc()` helper for HTML escaping in toast
- `admBdrSock.on('request:comment')` — calls `_admShowToast`, `_admPlayCommentSound`, and `window.admqOnComment` callback

**Admin queue page (`views/admin/queue.ejs`):**
- `window.admqOnComment(data)` — if the detail drawer is open for the incoming `instance_id`, appends the comment node live to `.admq-comments-list` and scrolls it into view; no drawer reload needed

**Portal layout (`portal/views/portal/layout.ejs`):**
- `_playReqCommentSound()` — same two-note ping as admin side
- `portalSocket.on('request:comment')` — calls `window.portalReqOnComment(data)` first; if it returns `true` (modal already open), toast's click handler scrolls to comments instead of navigating; otherwise toast navigates to `/portal/requests?date=YYYY-MM-DD#open=instanceId`

**Portal requests page (`portal/views/portal/requests.ejs`):**
- `_openDetailId` variable tracks which instance the modal is currently open for; cleared on `hidden.bs.modal`
- `openReqDetail(id)` refactored into a named function used by link clicks, row clicks, hash auto-open, and toast navigation; uses `bootstrap.Modal.getOrCreateInstance` to avoid double-modal issues
- Comments section given `id="reqCommentsList"` stable ID; "No comments yet" has `id="reqNoComments"` for removal
- `window.portalReqOnComment(data)` — if `_openDetailId === data.instance_id`, appends comment live, removes "no comments" placeholder, scrolls into view; returns `true` so layout knows not to navigate
- `_hashOpen` constant reads `#open=NNN` from URL hash on page load; passed to `loadInstances` as `autoOpenId`
- `showPortalToast` in `portal.js` — added `href` and `onClickOverride` params; `onClickOverride` takes precedence over default `/portal/tasks` navigation

**Classic layout (`views/layouts/main.ejs`):**
- Queue notification block rewritten to match admin hub pattern: persistent `AudioContext`, `_unlocked`/`_pending` flags, silent buffer unlock on first interaction, tab title blink `(!) New Request`, repeating bell every 4s, `stopBell()` when badge count = 0 or on queue page

---

## Bell / Notification Sound

- Bell tone reverted to original harmonics `[[659, 0.20], [1318, 0.10], [1975, 0.05]]` (user preferred it over C major arpeggio)
- Comment notification uses separate lighter two-note ping: 880 Hz + 1108 Hz (major third), each ~130–160ms, independent fresh `AudioContext` per play

---

## Files Changed

- `controllers/clientQueueController.js` — `addComment` emits socket event
- `models/ClientRequest.js` — `getInstanceContext` added; `getQueueForDate` filters cancelled
- `portal/controllers/clientRequestController.js` — `addComment` emits socket event
- `portal/public/portal.js` — `showPortalToast` gains `href` and `onClickOverride` params
- `portal/views/portal/layout.ejs` — `_playReqCommentSound`, `request:comment` socket handler
- `portal/views/portal/requests.ejs` — cancelled toggle, `_openDetailId`, `openReqDetail` refactor, `reqCommentsList` ID, `portalReqOnComment` callback, `_hashOpen` auto-open
- `views/admin/layout.ejs` — toast system, `_admPlayCommentSound`, `request:comment` handler, classic bell rewrite
- `views/admin/queue.ejs` — `admqOnComment` live append callback
- `views/layouts/main.ejs` — full queue notification rewrite with persistent bell + title blink
