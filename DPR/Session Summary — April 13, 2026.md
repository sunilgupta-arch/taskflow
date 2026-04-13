# Session Summary — April 13, 2026

## Features Built

### 1. Daily Briefing Dashboard (Home Page Redesign)
- Rebuilt the portal home page with a **two-column layout**: hero card tiles on the left, briefing sidebar on the right
- **Stat cards row**: Overdue, Due Today, In Progress, Open, Unread Chats — all clickable (navigate to tasks/chat with filters)
- **Due Today section**: Shows tasks due today with priority color bars, clickable to open task detail
- **Overdue section**: Appears only when overdue tasks exist, highlighted in red
- **Today's Activity feed**: Recent task comments with timestamps
- **Live clock**: Top-right corner showing current time (updates every second)
- All task cards are clickable — navigate to `/portal/tasks?task=ID` and auto-open the task detail panel
- Stat cards for In Progress/Open pre-set the filter dropdown on the tasks page

### 2. Reminders System
- New `portal_reminders` table (migration 031)
- Full CRUD API: create, edit, toggle done, delete reminders
- Reminders panel on the home page with add/edit modal
- **Cron job** (every minute): checks for due reminders, sends Socket.IO notification to the user's portal namespace
- **Browser notifications**: requests permission and shows native notifications when reminders fire
- **Toast notifications**: in-app toast with bell icon when a reminder is due

### 3. Calendar Page (Full Year Planner)
- New `portal_calendar_events` table (migration 032) + `is_done` column (migration 033)
- **12-month year grid** with compact day cells
- **Unified data**: pulls from 3 sources — calendar events (blue), reminders (amber), task due dates (purple)
- **Colored dots** on dates with entries
- **Hover tooltips**: beautiful popover showing all entries for a date
- **Click a date**: opens detail panel with events, reminders, tasks — edit/delete events inline
- **Add Event modal**: quick-pick title chips (Meeting, Deadline, Note, Event, Call, Other) with auto-color matching + 7-color palette
- **View selector**: 1, 2, 3, 4, 6, 12 month views with persistent localStorage preference
- Month sizes scale up when fewer months shown (1 month = large centered, 12 = compact grid)
- Year navigation with smart header labels (e.g., "Apr – Jun 2026")
- **Weekend styling**: Saturdays faded, Sundays in red, DOW headers match
- **Past months**: month names faded to indicate they're in the past, with legend indicator
- Regular dates faded (35% opacity), dates with activity pop to full opacity
- Today always highlighted with accent background

### 4. Upcoming Side Rail (Calendar Page)
- Right-side panel (280px) showing all entries for next 30 days + overdue items
- Grouped by: Overdue (red), Today, Tomorrow, then by date
- **Checkboxes** (custom styled): check to strike-through/fade, uncheck to restore
- Items stay in list until explicitly deleted (not hidden on check)
- Expandable descriptions: click truncated text to see full content
- Syncs with calendar — checking/unchecking refreshes dots, rail, and open date panel
- Events toggle `is_done`, reminders toggle `is_done`, tasks toggle `completed/open` status

### 5. Links Page (formerly Reports)
- New `portal_reports` table (migration 034)
- Card grid layout (auto-fill, 6 per row on wide screens)
- **Auto icon guessing**: matches keywords in name to Bootstrap icons (sales→graph, finance→dollar, HR→people, etc.)
- **Color palette**: same 7-color picker as calendar events
- Edit/delete on hover (pencil/trash buttons)
- Cards open URL in new tab, showing shortened hostname
- Added to sidebar nav with link icon

### 6. Contextual Help Icons
- Added amber `?` icon to every portal page (home, chat, tasks, notes, calendar, team status, users)
- Each links to `/portal/help?section=<relevant-section>` — auto-opens the correct help section
- Help page updated to handle `?section=` query parameter

### 7. Calendar Help Section
- Full documentation added to Help & Training page covering:
  - Calendar view, dots, weekend styling
  - Navigation, hovering, clicking dates
  - Creating/editing/deleting events
  - Title chips and color picker
  - Upcoming panel and checkbox behavior
  - Admin view (sees all team task due dates)
- Calendar card added to help overview section

### 8. UI/UX Improvements
- **Sidebar**: reduced menu item height (48px → 40px), added scroll for small screens, moved toggle button inline with logo
- **Task cards clickable**: briefing task cards and activity feed link directly to task detail via `?task=ID` param
- **Tasks page**: handles `?status=` and `?task=` URL params for deep linking
- Home page clock (live, no seconds)
- Secondary support (Priyanka) card restored on dashboard

## Files Changed

### New Files
- `migrations/031_portal_reminders_2026-04-13.sql`
- `migrations/032_portal_calendar_events_2026-04-13.sql`
- `migrations/033_calendar_event_done_2026-04-13.sql`
- `migrations/034_portal_reports_2026-04-13.sql`
- `portal/models/Reminder.js`
- `portal/models/CalendarEvent.js`
- `portal/models/Report.js`
- `portal/views/portal/calendar.ejs`
- `portal/views/portal/reports.ejs`

### Modified Files
- `portal/routes/portal.js` — briefing API, reminders CRUD, calendar CRUD, reports CRUD, upcoming entries API
- `portal/views/portal/home.ejs` — full redesign with briefing, reminders, clock, cards
- `portal/views/portal/layout.ejs` — calendar + links nav items, sidebar toggle restructure
- `portal/views/portal/help.ejs` — calendar help section, overview card, `?section=` param handling
- `portal/views/portal/tasks.ejs` — help icon, `?task=`/`?status=` param support
- `portal/views/portal/chat.ejs` — help icon
- `portal/views/portal/notes.ejs` — help icon
- `portal/views/portal/team-status.ejs` — help icon
- `portal/views/portal/users.ejs` — help icon
- `portal/public/portal.css` — ~1400 lines of new styles (briefing, calendar, reports, reminders, rail, responsive)
- `portal/public/portal.js` — task page deep linking via URL params
- `utils/cronJobs.js` — portal reminder cron job
