# Session Summary — April 15, 2026

## Features Built

### 1. Urgent Line — Cross-Team Real-Time Urgent Chat
Complete new feature allowing client portal admins/managers to send urgent requests to the local team with real-time chat.

**Database:**
- New migration `035_urgent_chats_2026-04-15.sql` with 3 tables:
  - `portal_urgent_chats` — tracks urgent sessions (status: waiting → accepted → resolved)
  - `portal_urgent_messages` — text, file, and system messages within a session
  - `portal_urgent_attachments` — file attachments for urgent messages

**Backend:**
- `portal/models/UrgentChat.js` — full model: create, accept, resolve, sendMessage, getMessages, getHistory, saveAttachment
- `portal/controllers/urgentController.js` — controller handling both portal and local sides: create, accept, resolve, send message, send file, serve attachment, buzz, typing indicators, history
- Portal routes: 11 endpoints under `/portal/urgent/*` (create, active, messages, file, resolve, buzz, history, typing, stop-typing, attachment)
- Local routes: 9 endpoints under `/urgent/*` (active, accept, messages, file, resolve, history, typing, stop-typing, attachment)
- `uploads/urgent/` directory auto-created on server startup

**Portal Side (Client UI):**
- **Urgent Line tile** on home page dashboard — red with pulsing border animation, stands out from other tiles
- **Compose modal** — write urgent message + optional file attachment, sends to all local team
- **Floating chat widget** (bottom-right) — appears after sending, shows status: "Waiting for response..." → "Connected with [Name]"
- **Minimized FAB** — red pulsing button when widget is collapsed, persists across pages
- Client can send messages even while waiting for acceptance
- **Buzzer button** (yellow bell icon) — hits API endpoint which emits loud alarm on all local screens, force-opens chat widget, 5-second cooldown to prevent spam
- **Typing indicator** — shows "[Name] is typing..." with animated dots in widget header
- **History modal** — table of all past urgent chats (date, raised by, message, accepted by, status, duration, message count) with drill-down to view full message thread
- History link on the Urgent Line tile (bottom-right corner)

**Local Side (TaskFlow UI):**
- **Red alert banner** — slides down below topbar on every page, persists across navigation
  - Shows: pulsing dot + "URGENT" label + sender name + message preview + Accept button
  - Slide-in animation, alert sound (two-tone chime) on arrival
- **Accept workflow** — any local team member clicks Accept, banner updates for others to "Accepted by [Name]" with View/Dismiss options
- **Floating chat widget** (bottom-right, above bridge chat) — opens for the acceptor, shows live messages
- **Minimized FAB** — red pulsing button when collapsed
- **Buzzer alarm** — 3 ascending beeps + long sawtooth tone, flashes widget header and banner yellow
- **Message sound** — short alert tone on every incoming client message
- **Typing indicator** — shows "[Name] is typing..." with animated dots
- **Resolve** — either side can resolve, closes everything for everyone with toast notification

**Socket.IO:**
- All events emitted to both main namespace (`io.emit`) and portal namespace (`io.of('/portal').emit`)
- Events: `urgent:new`, `urgent:accepted`, `urgent:message`, `urgent:resolved`, `urgent:buzz`, `urgent:typing`, `urgent:stop-typing`
- Local side uses dedicated `urgentSocket` connection (avoids IIFE scoping issues with other socket instances)

### 2. Portal Home Cleanup
- Removed **stats row** (Due Today / In Progress / Open / Unread Chats bar)
- Removed **Due Today** card from right sidebar
- Removed **Today's Activity** card from right sidebar
- Removed related JS (stat rendering, activity rendering, scrollToSection)
- Right sidebar now only shows Overdue (conditional) + Reminders — much cleaner

## Bug Fixes
- Fixed migration failure: `INT` → `INT UNSIGNED` to match `users.id` column type
- Fixed urgent banner not showing: CSS had `display: none` on `.urgent-banner` class, causing `style.display = ''` to fall back to hidden — changed to explicit `display: block`
- Fixed socket events not received on local side: `socket` variable was scoped inside a different IIFE — created dedicated `urgentSocket` connection
- Fixed client chat input hidden while waiting: removed the `display: none` on input when status is `waiting` — client can always send messages
- Changed buzzer from raw socket emit to HTTP endpoint (`POST /portal/urgent/:id/buzz`) for reliability

## Files Changed

### New Files
- `migrations/035_urgent_chats_2026-04-15.sql`
- `portal/models/UrgentChat.js`
- `portal/controllers/urgentController.js`

### Modified Files
- `portal/routes/portal.js` — urgent routes (create, active, messages, file, resolve, buzz, history, typing)
- `portal/views/portal/home.ejs` — removed stats/activity/dueToday, added Urgent Line tile with history link
- `portal/views/portal/layout.ejs` — compose modal, chat widget, minimized FAB, history modals, buzzer, typing indicators, all socket listeners
- `portal/public/portal.css` — ~160 lines of urgent styling (tile glow, widget, messages, FAB, typing dots, buzzer shake)
- `routes/index.js` — local-side urgent routes (accept, messages, file, resolve, history, typing)
- `server.js` — added `uploads/urgent` directory
- `views/layouts/main.ejs` — alert banner, chat widget, FAB, accept/view/dismiss logic, buzzer alarm, message sound, typing indicators, ~200 lines of CSS
