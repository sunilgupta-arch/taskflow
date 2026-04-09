# Client Portal — Implementation Prompt

## Context

We are building a **Private Client Portal** within the existing TaskFlow Express app. This is a private internal communication hub exclusively for the client's team. Local team members have zero knowledge or access to it.

## Existing Stack

- Node.js/Express, EJS views, MySQL (mysql2), Socket.IO, JWT auth via cookies
- Roles: CLIENT_ADMIN, CLIENT_MANAGER, CLIENT_USER, LOCAL_ADMIN, LOCAL_MANAGER, LOCAL_USER

---

## Requirements

### Users (5-10 total)

| Role | Count | Example |
|---|---|---|
| Admin | 1 | Sandeep (Client Owner) |
| Manager | 3-4 | Megan (CFO), Danny (COO), Justin (Store Manager) |
| User | 1-2 | Amy (Sales Person) |

### Communication Rules

- **Private 1-to-1 Chat**: Any person can chat with any other person. Conversations are completely sealed — only the two participants know it exists.
- **Group Chat / Broadcast**: Admin and Managers can create group conversations with selected people. Users cannot create groups but can participate if added. Groups are also private to participants only.
- **Task Assignment**: Admin/Managers can assign tasks to individuals within a chat.
- **File Sharing**: Any participant can send files within a chat (1-to-1 or group).

### Communication Matrix

| Role | Private 1-to-1 | Create Group/Broadcast |
|---|---|---|
| Admin | Anyone | Yes |
| Manager | Anyone | Yes |
| User | Anyone | No (participate only) |

### Login & Redirect Flow

```
Login (single auth, same credentials)
  ├── CLIENT_ADMIN / CLIENT_MANAGER / CLIENT_USER → /portal (Client Portal)
  │     → "Go to TaskFlow" button in header
  └── LOCAL_ADMIN / LOCAL_MANAGER / LOCAL_USER → /dashboard (TaskFlow)
        → Zero awareness of portal
```

---

## Technical Plan

### Architecture

- Same Express app, same server, same auth system
- New route group: `/portal/*`
- New views: `views/portal/`
- `portalOnly` middleware — blocks all LOCAL_* roles from `/portal` routes
- Same Socket.IO server, separate namespace `/portal` for real-time

### New Database Tables (same MySQL DB)

```sql
-- Conversations (1-to-1 and group)
portal_conversations
  - id, type ('direct'/'group'), name (for groups), created_by, created_at, updated_at

-- Participants in each conversation
portal_participants
  - id, conversation_id, user_id, joined_at, last_read_message_id

-- Messages
portal_messages
  - id, conversation_id, sender_id, content, type ('text'/'task'/'file'), created_at

-- Tasks assigned within chats
portal_tasks
  - id, conversation_id, message_id, assigned_by, assigned_to, title, description, status, due_date, created_at, updated_at

-- File attachments
portal_attachments
  - id, message_id, file_name, file_path, file_size, mime_type, uploaded_by, created_at
```

### Files to Create

```
routes/portal.js          — All portal routes
controllers/portalController.js — Business logic
models/Portal.js          — DB queries for portal tables
middleware/portalOnly.js   — Block non-client roles
views/portal/
  ├── index.ejs           — Main portal layout (chat UI)
  ├── chat.ejs            — Chat window
  └── partials/
      ├── sidebar.ejs     — Contact list
      └── header.ejs      — Header with "Go to TaskFlow"
public/src/portal/
  ├── portal.js           — Frontend JS (Socket.IO, chat logic)
  └── portal.css          — Portal styles
migrations/XXX_create_portal_tables.js — DB migration
config/portalSocket.js    — Socket.IO namespace setup for portal
```

### Files to Modify

```
controllers/authController.js — Add role-based redirect after login
app.js or server.js           — Register /portal routes
config/socket.js              — Add portal namespace
views/layouts/main.ejs        — Add "Go to TaskFlow" link for client roles (if shared layout)
```

### UI Concept

- **Left sidebar**: Contact list with online status, search
- **Main area**: Chat window (messages, inline task/file actions)
- **Header**: User name, avatar, "Go to TaskFlow" button
- Clean, minimal — WhatsApp/Telegram-like feel
- No dashboards, no charts, no clutter

---

## Key Principles

1. Total privacy — no conversation leaks
2. Simplicity — clean UI, focused on communication
3. Isolation — local team has zero awareness
4. Single auth — one login for both apps
5. Real-time — live chat via Socket.IO

---

## Start Command

> "Let's start building the client portal. Requirements are in `prompts/client-portal.md`."
