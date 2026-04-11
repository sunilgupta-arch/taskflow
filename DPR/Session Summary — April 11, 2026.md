# Session Summary — April 11, 2026

## Commits

- Pending (all changes in this DPR are uncommitted)

---

## 1. EXPANDABLE / COLLAPSIBLE SIDEBAR

**Problem:** The client found the 48px icon-only activity bar too thin and hard to read.

**Built:**
- **Toggle button** (chevron) below the brand icon — expands sidebar to 180px with text labels, collapses back to 48px icons-only
- Text labels on every nav item: Chat, Tasks, Notes, Team India, Users, Help, Support contacts
- **Persisted in localStorage** — preference remembered across sessions
- **No flash on page load** — inline `<script>` in `<html>` applies expanded state before first paint (same pattern as theme), CSS transitions blocked during load via `html:not(.sidebar-ready)` rule

**Files Changed:**
- `portal/views/portal/layout.ejs` — toggle button, `ab-label` spans, instant restore JS
- `portal/public/portal.css` — expanded state styles, transition suppression, label/toggle CSS

---

## 2. CFC PORTAL HOME PAGE (LANDING PAGE)

**Problem:** Portal redirected straight to Chat — no overview or quick navigation for the client.

**Built:**
- **New home page** at `/portal` with greeting ("Welcome, {name}") and "CFC Portal" subtitle
- **Big icon tiles** in a centered grid: Chat, Tasks, Notes, Team India, Users, Help, Primary Support, Secondary Support
- Each tile has a colored icon, label, and short description
- Hover effect: tiles lift with shadow
- Responsive grid — adjusts on smaller screens
- **Brand icon ("C") clickable** — takes user back to home from any page
- "CFC Portal" brand name appears next to logo when sidebar is expanded

**Files Changed:**
- `portal/views/portal/home.ejs` (new)
- `portal/routes/portal.js` — `/portal` renders home page instead of redirect
- `portal/views/portal/layout.ejs` — brand link + `ab-brand-name`
- `portal/public/portal.css` — brand name, home page tile styles

---

## 3. USERS PAGE — CARD LAYOUT FIX

**Problem:** Action icons (edit, reset password, deactivate) were overlapping with long email addresses on user cards.

**Fix:**
- Card layout changed from `display: flex` to `display: grid` with explicit columns (`46px 1fr auto`)
- Name and email get `text-overflow: ellipsis` truncation
- Info container gets `overflow: hidden` to enforce truncation

**Files Changed:**
- `portal/public/portal.css` — `.user-card` grid layout, `.user-card-name` / `.user-card-email` truncation

---

## 4. TEAM INDIA — ACCORDION TASK VIEW

**Problem:** Client had to click each employee row to open a side panel just to see their tasks. No quick overview of the whole team's workload.

**Built:**
- **Chevron icon** on every row — click to expand/collapse that employee's day tasks inline
- Expanded view shows all tasks with status badges (In Progress, Pending, Done), type labels (Recurring, Ad-hoc), color-coded borders
- Tasks fetched once per employee and cached — subsequent toggles are instant
- **"Expand All / Collapse All"** button in the header — toggles all rows, button label auto-updates
- Expanded rows persist across auto-refresh (30s interval)
- Clicking the **employee name** still opens the right panel (tasks + chat)

**Files Changed:**
- `portal/views/portal/team-status.ejs` — chevron column, expand-all button
- `portal/public/portal.js` — `toggleAccordion()`, `fetchAccordionTasks()`, `toggleAllAccordions()`, cache system
- `portal/public/portal.css` — accordion row styles, chevron rotation, inline task items

---

## 5. DELEGATED SECONDARY SUPPORT

**Problem:** If the local admin (Sunil) was unavailable, the client had no one to contact for support.

**Built:**
- **Admin delegation UI** on TaskFlow Users page — dropdown of all LOCAL team members, admin picks one person as secondary support
- **Portal sidebar** shows two support contacts: Primary (headset icon) + Secondary (person-badge icon) with role subtitles
- **"SUPPORT" section label** in expanded sidebar above the support buttons
- Each opens its own floating chat panel (only one at a time)
- **Home page** shows both as separate tiles
- **Unread badges** tracked independently per support contact via `getUnreadCountByUser()` method
- **Database**: `delegated_support_id` column on `organizations` table
- **Cache system**: middleware caches delegate info, cleared when admin updates

**Files Changed:**
- `migrations/029_delegated_support_2026-04-11.sql` (new)
- `portal/middleware/portalOnly.js` — fetches + caches delegate
- `routes/index.js` — GET/POST `/users/delegate-support` API
- `controllers/userController.js` — passes `delegatedSupportId` to Users view
- `views/users/index.ejs` — delegation card + dropdown UI
- `models/BridgeChat.js` — `getUnreadCountByUser()` method
- `controllers/bridgeChatController.js` — returns `by_user` in unread count
- `portal/views/portal/layout.ejs` — two sidebar buttons, two chat panels, unified JS
- `portal/views/portal/home.ejs` — separate tiles for primary + secondary
- `portal/public/portal.css` — section label, role subtitle styles

---

## 6. CHAT — ONLINE / OFFLINE DOTS

**Problem:** No visual indication of which users were online or offline in the chat sidebar.

**Built:**
- **Green dot** for online users, **Red dot** for offline users on all direct chat contacts
- Dots update in real-time via existing socket presence events
- Applied to both conversation list and contacts list
- Group chats show no dot (as expected)

**Files Changed:**
- `portal/public/portal.js` — `renderConversations()` shows dots for all direct chats, `updateContactOnlineStatus()` updated
- `portal/public/portal.css` — `.offline-dot` style

---

## 7. CHAT — "NEW CHAT" BUTTON + TOP_MGMT VISIBILITY FIX

**Problem:** CLIENT_TOP_MGMT user (Danny) couldn't see other users to chat with — only existing conversations were visible, and the "New Chat" button was hidden in the empty placeholder area.

**Fix:**
- **"New Chat" button** added to the sidebar header — always visible next to "New Group"
- Search box now **filters both conversations and contacts**
- Sidebar header stays visible when viewing contacts
- Search clears when switching views

**Files Changed:**
- `portal/views/portal/chat.ejs` — "New Chat" button in header
- `portal/public/portal.js` — `showContacts()` keeps header visible, search filters contacts too

---

## 8. CHAT — WHATSAPP-STYLE TOAST NOTIFICATIONS

**Problem:** When a message arrived and the user wasn't viewing that conversation, no notification appeared — only a sound played if they were lucky enough to be in the conversation room.

**Built:**
- **`portal:notify` event** emitted to each participant's personal room (not just conversation room) — ensures delivery even if chat isn't open
- **WhatsApp-style toast** slides in from top-center with sender avatar, name, and message preview
- **Clickable** — navigates to chat page and opens the conversation
- **Auto-dismiss** after 5 seconds
- Smart deduplication — won't double-notify if conversation is already open
- Toast container repositioned to **top center** with vertical slide animation

**Files Changed:**
- `portal/controllers/chatController.js` — emits `portal:notify` to participant personal rooms
- `portal/public/portal.js` — `portal:notify` handler, `showChatToast()`, `openConversationById()`
- `portal/public/portal.css` — toast container centered, chat toast avatar styles, vertical slide animation

---

## 9. BRIDGE CHAT — TICKS + TYPING INDICATOR

**Problem:** No read receipts or typing indication in the client-to-support chat.

**Built:**
- **Double-check ticks** on sent messages — grey (delivered), blue (read)
- **`bridge:read` socket event** turns ticks blue in real-time when other side reads
- **Typing indicator** — three animated green dots appear in the header subtitle when the other side is typing
- **Both sides implemented** — portal floating panels + TaskFlow LOCAL widget
- Typing emits on `keydown` (not `input`) — works with backspace and all keys
- Auto-clears after 3 seconds of no keystroke

**Files Changed:**
- `portal/views/portal/layout.ejs` — ticks in `renderSupportMessages()` + `appendSupportMsg()`, read/typing listeners, typing emit
- `views/layouts/main.ejs` — ticks in bridge widget render/append, read/typing on LOCAL side
- `server.js` — bridge typing relay via socket
- `portal/public/portal.css` — typing animation (bouncing dots)

---

## 10. CHAT INPUT ALIGNMENT FIX

**Problem:** The support chat input textarea wasn't height-aligned with the action buttons.

**Fix:**
- Changed flex container from `align-items: end` to `align-items: stretch`
- Removed fixed `min-height` on textarea so it stretches to match button grid

**Files Changed:**
- `portal/public/portal.css` — `.admin-chat-input .d-flex` stretch
- `portal/views/portal/layout.ejs` — removed `align-items-end` class

---

## 11. CHAT SIDEBAR RESPONSIVE FIX

**Problem:** On narrower screens, the 340px chat sidebar squeezed the chat window into an unusable sliver.

**Fix:**
- Breakpoint raised from 768px to 900px for full-width overlay mode
- Intermediate breakpoint at 1100px shrinks sidebar to 280px
- Chat container gets `position: relative; overflow: hidden`

**Files Changed:**
- `portal/public/portal.css` — responsive breakpoints for `.chat-sidebar`

---

## 12. TASK ARCHIVING (GMAIL-STYLE)

**Problem:** Completed tasks cluttered the task list with no way to clean up the view.

**Built:**
- **Archive button** on completed/cancelled task cards and in the detail panel
- Archived tasks disappear from the main list
- **"Archived" toggle button** in the header switches to a **compact table view**:
  - Search box (searches title, assignee, creator — 400ms debounce)
  - Table columns: Title, Status, Priority, Assigned To, Created By, Due Date, Archived Date, Unarchive
  - **Server-side pagination** — 100 tasks per page with page navigation
  - Total count display ("42 archived tasks")
- **Unarchive** button on each row to restore tasks
- Status/priority/user filters hidden in archived view (table has its own search)
- Database: `is_archived` column on `portal_tasks`

**Files Changed:**
- `migrations/030_portal_task_archive_2026-04-11.sql` (new)
- `portal/models/Task.js` — `_buildFilters()` helper, search + pagination support, `toggleArchive()`
- `portal/controllers/taskController.js` — `archived/search/page/limit` params, `toggleArchive` endpoint
- `portal/routes/portal.js` — `PATCH /tasks/:id/archive` route
- `portal/views/portal/tasks.ejs` — "Archived" toggle button
- `portal/public/portal.js` — `toggleArchiveView()`, `loadArchivedTasks()`, `renderArchivedTable()`, pagination
- `portal/public/portal.css` — archived table styles, search box, pagination

---

## 13. RICH TEXT EDITOR FOR NOTES

**Problem:** Notes page only had a plain textarea — no formatting options.

**Built:**
- **Quill.js** rich text editor with full formatting toolbar:
  - Headers (H1, H2, H3), Bold, Italic, Underline, Strikethrough
  - Text color picker, Background highlight picker
  - Font sizes (Small, Normal, Large, Huge)
  - Ordered/Unordered lists, Indent/Outdent
  - Text alignment (Left, Center, Right, Justify)
  - Blockquote, Code block, Links
  - "Clean" button to strip formatting
- **Dark/Light theme** — toolbar icons, dropdowns, code blocks, tooltips all themed
- Content stored as HTML in existing TEXT column (no migration needed)
- **Auto-save** via Quill's `text-change` event (2s debounce)
- **Dictation** inserts at Quill cursor position
- **Export as text** strips HTML for plain text download
- **Print/PDF** renders rich HTML formatting
- **Sidebar preview** strips HTML tags for plain text snippet

**Files Changed:**
- `portal/views/portal/notes.ejs` — textarea → Quill container, CDN links, init script
- `portal/public/portal.js` — all note functions updated for Quill API
- `portal/public/portal.css` — Quill theming (toolbar, editor, dropdowns, tooltips, code blocks)

---

## 14. HELP PAGE UPDATES

Updated all help documentation to reflect new features:
- **Navigation Guide** rewritten — sidebar expand/collapse, home page, section labels
- **Team India** — accordion task view, expand all/collapse all
- **First Login Guide** — landing page, sidebar references
- **Admin Chat** — updated to sidebar location references

**Files Changed:**
- `portal/views/portal/help.ejs` — navigation, team-india, first-login sections updated

---

## 15. SUPPORT SECTION LABEL IN SIDEBAR

**Problem:** Support contacts (Sunil, Priyanka) showed just names — no indication they were support staff.

**Fix:**
- **"SUPPORT" section label** above the support buttons (visible when expanded)
- **Role subtitle** under each name: "Primary" / "Secondary"
- Tooltips updated: "Sunil (Primary Support)" / "Priyanka (Secondary Support)"

**Files Changed:**
- `portal/views/portal/layout.ejs` — section label, label name/role structure
- `portal/public/portal.css` — `.ab-section-label`, `.ab-label-name`, `.ab-label-role`

---

## Files Changed Summary

| Area | Files | Lines Added | Lines Removed |
|---|---|---|---|
| Portal Views | 7 | ~550 | ~80 |
| Portal CSS | 1 | ~600 | ~30 |
| Portal JS | 1 | ~600 | ~160 |
| Portal Backend | 4 | ~120 | ~30 |
| TaskFlow Backend | 4 | ~80 | ~10 |
| TaskFlow Views | 2 | ~120 | ~10 |
| Migrations | 2 | ~5 | 0 |
| **Total** | **21 files** | **~2,075** | **~320** |
