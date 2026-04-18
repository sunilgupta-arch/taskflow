# Session Summary — April 18, 2026

## Features Built

### 1. Group Channel — Persistent Right-Side Team Chat
A WhatsApp-style group chat panel persistent on every page for both portal and local sides. Hidden for `CLIENT_SALES` role on the portal side; visible to all local roles.

**Database:**
- New migration `037_group_channel_2026-04-18.sql` with 2 tables:
  - `group_channel_messages` — text + file messages with sender info
  - `group_channel_attachments` — file attachments
- Migration `038_group_channel_drive_2026-04-18.sql` — added `drive_file_id` to `group_channel_attachments`

**Backend:**
- `models/GroupChannel.js` — full model: getMessages, sendMessage, sendFile, deleteMessage, getUsers (with online status), saveAttachment with `drive_file_id`
- `controllers/groupChannelController.js` — text/file send, Drive upload, delete (Drive trash), serveAttachment (streams from Drive or local fallback), getUsers
- Local routes under `/channel/*` (10 endpoints) including 5MB multer file limit
- Portal routes under `/portal/channel/*` (10 endpoints) including 5MB multer file limit

**UI — Side Panel (both sides):**
- Persistent right-side panel on every page — collapsible to a vertical handle
- Persistent collapse state via `localStorage` (`gc-collapsed` flag)
- Header with channel name, online count, maximize button, collapse button
- Online users strip — colored avatars with green dot for online users
- Local side shows only local team members in the strip (excludes client side)
- Message list with sender name, role badge, timestamp, delete (own messages only)
- Compose box with file attach + emoji + send
- Typing indicator at bottom (animated bouncing dots, no name)
- Sound alert on incoming message (Web Audio API short tone)
- Sibling content shifts via `body.gc-is-collapsed` CSS hook

**UI — Full-Page View:**
- `views/channel/index.ejs` — local-side full-page channel view
- `portal/views/portal/channel.ejs` — portal-side full-page channel view
- Side panel hidden on full-page view (`#main-content { margin-right: 0 !important }`)

**Real-Time:**
- Socket.IO events: `channel:message`, `channel:delete`, `channel:typing`, `channel:typing:stop`, `channel:presence`
- `server.js` tracks `onlineUsers` Map (multi-tab safe via socketCount)
- Presence broadcast on connect/disconnect to both namespaces

### 2. Google Drive Migration — All Attachments
Migrated **every** attachment system from local disk to Google Drive (TMS shared drive):
- Group Channel — 5 MB limit
- Portal Chat — 10 MB limit
- Bridge Chat — 10 MB limit
- Urgent Line — 10 MB limit
- Task Attachments — 25 MB limit
- Portal Task Comments — 10 MB limit

**Database:**
- Migration `039_drive_attachments_2026-04-18.sql` — added `drive_file_id` to:
  - `portal_attachments`, `bridge_attachments`, `portal_urgent_attachments`, `task_attachments`, `portal_task_attachments`

**Backend:**
- `services/googleDriveService.js` — added `uploadGroupChannelAttachment(file)` and generic `uploadToFolder(folderId, file)` helpers
- `config/multer.js` — switched to memory storage, 25 MB limit, 5 files
- All controllers updated to upload buffer to Drive and store `drive_file_id` instead of local `file_path`
- All `serveAttachment` endpoints stream from Drive with backward-compatible fallback to local `file_path` for legacy files
- Delete operations move Drive files to trash via Drive API

**Files Modified:**
- Local: `controllers/bridgeChatController.js`, `controllers/taskController.js`, `models/BridgeChat.js`, `services/taskService.js`, `routes/tasks.js` (added `GET /tasks/attachment/:id`)
- Portal: `portal/controllers/chatController.js`, `portal/controllers/urgentController.js`, `portal/controllers/taskController.js`, `portal/models/Chat.js`, `portal/models/Task.js`, `portal/models/UrgentChat.js`
- View: `views/tasks/show.ejs` — switched URL from `/uploads/tasks/` to `/tasks/attachment/:id`

### 3. UX Polish — Apply Group Channel Pattern Across All Chats (Phases 1–4)
Brought Portal Chat, Bridge Chat, Urgent Line, and Task Comments up to the Group Channel polish bar.

**Upload Progress Placeholders:**
- Helpers `showChatUploadPlaceholder`, `markChatUploadFailed`, `uploadChatFileDirect` in `portal/public/portal.js`
- Skeleton bubble appears immediately on file select; replaced by real message on upload success; flips to red error state on failure
- Applied across all chats

**Colored File Icons:**
- `getFileIconMeta(ext)` in `portal/public/portal.js` and `bridgeFileIconMeta` in `views/layouts/main.ejs`
- PDF (red), Word (blue), Excel (green), PPT (orange), ZIP (yellow), images (cyan), video (purple), audio (pink), default (grey)
- Applied across portal chat, bridge chat, urgent line, group channel, task comments, task attachments

**Delete Buttons:**
- Upgraded `.gc-msg-delete`, `.msg-action-trigger`, `.bridge-msg-delete` to 26×26 px with dark pill background
- Hover-on-button keeps it visible (no flicker)

**Paste Screenshot Support:**
- Group Channel — direct paste into compose box
- Portal Chat — paste handler on `messageInput`
- Bridge Chat — paste handler on bridge input (local layout)
- Urgent Line widget — paste handler attached with retry pattern (`urgentChatInput`)
- Urgent compose modal — paste handler on `urgentComposeMsg` using `DataTransfer` API to populate file input
- Local chat — paste handler on `views/chat/index.ejs` with thumbnail preview via blob URL in `showAttachPreview(name, size, file)`

**Sound Alerts:**
- Group Channel sound on every incoming message (Web Audio API)
- Auto-open chat on incoming bridge messages (no toast)

**Other Polish:**
- Support chat read receipts now mark as seen only when support replies (not on chat open)
- Urgent Line typing indicator moved from header to bottom; bouncing-dots-only animation (no name)
- Fixed full-page view side-panel duplication

## Bug Fixes
- `Unknown column 'u.role_name'` — fixed `GroupChannel` query to JOIN `roles r` and use `r.name AS sender_role`
- Portal Group Channel JS — rewrote from `$.ajax` to `fetch()` (portal side has no jQuery)
- Migration runner kept re-running 038 — manually inserted rows into `_migrations` for 038 and 039
- Drive "File not found" — folders were in My Drive; recreated inside `TMS_FOLDER_ID` shared drive; `.env` updated
- Side panel still showed on full-page view — added `margin-right: 0 !important` override
- Stacked compose buttons squeezed — switched from `flex: 1` to fixed 32×32 px
- Paste not working on Urgent Line / Local Chat — switched from delegated `document` paste listener to direct element binding with retry pattern
- Local chat paste preview showed generic icon only — added `attachPreviewThumb` element with blob-URL thumbnail
- Urgent compose paste broken — added handler with `DataTransfer` to populate the file input

## Files Changed

### New Files
- `controllers/groupChannelController.js`
- `models/GroupChannel.js`
- `views/channel/index.ejs`
- `portal/views/portal/channel.ejs`
- `migrations/036_client_sales_role_2026-04-15.sql`
- `migrations/037_group_channel_2026-04-18.sql`
- `migrations/038_group_channel_drive_2026-04-18.sql`
- `migrations/039_drive_attachments_2026-04-18.sql`
- `prompts/port-forward-wsl.md`

### Modified Files
- `server.js` — onlineUsers presence map, channel socket events
- `routes/index.js` — channel + group channel routes, multer limits
- `routes/tasks.js` — `GET /tasks/attachment/:id`
- `config/multer.js` — memory storage, 25 MB
- `controllers/bridgeChatController.js`, `controllers/taskController.js`
- `models/BridgeChat.js`
- `services/googleDriveService.js`, `services/taskService.js`
- `views/layouts/main.ejs` — group channel side panel, bridge sound + auto-open, paste handlers, file icons, presence
- `views/chat/index.ejs` — paste with thumbnail preview
- `views/tasks/show.ejs` — Drive attachment URLs, colored file icons
- `portal/routes/portal.js` — channel routes, file upload route
- `portal/controllers/chatController.js`, `portal/controllers/urgentController.js`, `portal/controllers/taskController.js`, `portal/controllers/userController.js`
- `portal/models/Chat.js`, `portal/models/Task.js`, `portal/models/UrgentChat.js`
- `portal/public/portal.js` — file icon meta, upload placeholder helpers, paste handlers
- `portal/public/portal.css` — group channel styling, presence strip, delete-button polish
- `portal/views/portal/layout.ejs` — group channel panel, urgent compose paste, colored icons
- `portal/views/portal/home.ejs`

## Deferred (Phase 5 — Group Channel Nice-To-Haves)
- Scroll-to-bottom button
- Unread divider line
- Load-more on scroll up (pagination)
- Browser notifications when tab in background
- Edit own message within 15 min
- @mentions with highlight
- Message reactions (emoji)
- Reply-to-message (quoted reply)
- Link preview
- Message search
- Pinned messages (admin-only)
