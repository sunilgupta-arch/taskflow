/* Per-page help content for the Portal contextual "?" drawer.
   Keyed by exact route path (window.location.pathname). */
window.PORTAL_HELP_CONTENT = {
  "/portal": {
    "title": "Home Dashboard",
    "intro": "Your portal landing page — quick links to every section plus a daily briefing of overdue work and personal reminders.",
    "topics": [
      { "q": "What do the colored tiles do?", "a": "Each tile jumps straight to a section — Chat, Tasks, Notes, Calendar, Allocate Task TI, Links, and (for admins) Dev Workspace, Team India, and Users. Click any tile to open it." },
      { "q": "What shows up in the Overdue section?", "a": "It only appears if you have tasks past their due date, either assigned to you or created by you. Click a task card to jump straight to it." },
      { "q": "How do reminders work?", "a": "Click Add to set a title, optional note, and a date/time. When it's due you'll get a toast notification and a browser notification, and it stays listed until you check it off or delete it." },
      { "q": "What's the Urgent Message tile?", "a": "It opens a direct line to the local team for something that can't wait — only visible to admin and management roles. Use the History link next to it to see past urgent messages." },
      { "q": "What are the named support tiles?", "a": "Those are your primary and secondary support contacts on the local team. Clicking one opens a chat with them directly." }
    ]
  },
  "/portal/tasks": {
    "title": "Tasks",
    "intro": "Track and discuss tasks assigned to you or your team, with comments, file attachments, and status updates.",
    "topics": [
      { "q": "How do I filter the task list?", "a": "Use the Status, Priority, and User dropdowns at the top right to narrow the list — they combine, so you can filter by status and priority and person at once." },
      { "q": "Who can create a new task?", "a": "Admins, top management, management, managers, and sales roles can click New Task. Everyone else can view and comment on tasks assigned to them." },
      { "q": "Can I mark a task complete myself?", "a": "If you're just the assignee, you can change the status (like moving it to In Progress or Completed), but only the task's creator or an admin can edit the title, description, priority, or due date." },
      { "q": "What does the Archived button show?", "a": "It toggles between your active tasks and ones you've archived. Archiving just hides a task from the main list — it doesn't require the task to be finished first." },
      { "q": "How do I add a comment with a file or voice note?", "a": "Open a task, then use the paperclip icon to attach a file or the mic icon to dictate your comment instead of typing." }
    ]
  },
  "/portal/requests": {
    "title": "Allocate Task TI",
    "intro": "Submit work requests to the internal team's queue and track their status day by day.",
    "topics": [
      { "q": "What's the difference between Quick Request and New Request?", "a": "Quick Request is a one-tap form (title, type, description, optional attachment) that always goes into the open queue as normal priority for today. New Request gives you full control — priority, due time, assignee, recurrence, and an end date." },
      { "q": "What do the status badges mean?", "a": "Pending means it hasn't been picked up yet, In Progress means someone on the local team is working it, Done means they finished and it's waiting on your approval, and Approved means you've signed off." },
      { "q": "Why do Approve/Reject buttons show on some rows?", "a": "They appear once a request you submitted is marked Done. Approve closes it out for good; Reject sends it back with an optional reason so the team knows what to redo." },
      { "q": "How do I stop a recurring request?", "a": "Open the Recurring Requests section below the table, then use Stop — it cancels future occurrences but keeps the history of past ones. It's admin/top-management only." },
      { "q": "I cancelled a request by mistake — can I get it back?", "a": "Yes, show cancelled requests with the link at the bottom of the table, then use Restore on the one you need — it becomes visible to the local team again." }
    ]
  },
  "/portal/calendar": {
    "title": "Calendar",
    "intro": "A month-by-month view of your events, reminders, and task due dates in one place.",
    "topics": [
      { "q": "What do the colored dots on a date mean?", "a": "Blue is an event, amber is a reminder, and purple is a task due that day — check the legend at the top for a quick reference. Faded dates are just in the past." },
      { "q": "How do I add an event?", "a": "Click any date to open its detail panel, then Add Event. Pick a quick preset like Meeting or Deadline, or choose Other to type your own title, then pick a color." },
      { "q": "Can I change how many months I see at once?", "a": "Yes, use the 1/2/3/4/6/12 buttons near the top to switch between a single month and a full year view — your choice is remembered next time you visit." },
      { "q": "What's the Upcoming panel on the right?", "a": "It's a running list of everything ahead — overdue items first, then grouped by Today, Tomorrow, and upcoming dates. Check the box next to any item to mark it done." },
      { "q": "How do I jump back to today?", "a": "Click the Today button in the top bar — it resets the view and scrolls to the current month." }
    ]
  },
  "/portal/chat": {
    "title": "Chat",
    "intro": "Message your team members directly or in groups, plus reach your dedicated support contacts.",
    "topics": [
      { "q": "Who can I chat with?", "a": "Only people on your own company's portal team, plus the local team's primary and secondary support contacts shown at the top of New Chat." },
      { "q": "Who can start a group chat?", "a": "Admins, top management, management, and managers can create groups with New Group; everyone else can start one-on-one chats and join groups they're added to." },
      { "q": "How do I see who's in a group?", "a": "Open the group chat and click the people icon in the header — it lists members and, if you have permission, lets you add more." },
      { "q": "Can I send files or voice messages?", "a": "Yes — use the paperclip icon to attach a file, the emoji icon for reactions, and the mic icon to dictate a message instead of typing it." },
      { "q": "How do I find an old message?", "a": "Click the search icon in the chat header to search within that conversation." }
    ]
  },
  "/portal/channel": {
    "title": "Group Channel",
    "intro": "A shared group chat where your team can talk directly with the internal TaskFlow team handling your account.",
    "topics": [
      { "q": "How do I get someone's attention?", "a": "Type @ and start typing their name to bring up a picker. Mentioning someone drops the message into their Mentions inbox (the @ icon at the top) and can trigger a notification." },
      { "q": "Can I reply to one specific message instead of starting a new one?", "a": "Hover over the message, click the small arrow that appears, and choose Reply. Your new message will show a quoted preview of the one you replied to, and clicking that quote jumps back to the original." },
      { "q": "How do I find something someone said earlier?", "a": "Click the search icon in the top right, type a keyword, and click any result to jump straight to that message in the conversation." },
      { "q": "Can I fix or remove something I just sent?", "a": "Yes, but only within 15 minutes of sending it. Hover the message, open its menu, and choose Edit or Delete." },
      { "q": "What does the pinned bar at the top mean?", "a": "Admins and managers can pin important messages so they stay visible to everyone at the top of the channel. Click the pinned bar to expand the full list." }
    ]
  },
  "/portal/notes": {
    "title": "Notes",
    "intro": "A private notepad for jotting things down, with a full rich-text editor.",
    "topics": [
      { "q": "Can anyone else see my notes?", "a": "No, notes are private to your own account only — no one else on your team or at TaskFlow can view them." },
      { "q": "Do I need to save my note manually?", "a": "No, it auto-saves about 2 seconds after you stop typing. You can also hit the checkmark icon to save right away." },
      { "q": "How do I find an old note?", "a": "Use the search box above the notes list to filter your notes by title or content." },
      { "q": "Can I get a note out of TaskFlow?", "a": "Yes, use the text-file icon to download it as a plain text file, or the printer icon to print it or save it as a PDF." },
      { "q": "Can I dictate a note instead of typing it?", "a": "Yes, click the microphone icon to dictate using speech-to-text — it shows Listening while it's active." }
    ]
  },
  "/portal/team-status": {
    "title": "Team India",
    "intro": "A live, real-time view of the internal team working on your account and what they're currently doing.",
    "topics": [
      { "q": "What do the different status labels mean?", "a": "Working means they're actively on a task, Idle means logged in with nothing in progress, Off Shift means outside their working hours, and Forgot Logout flags someone who's been off shift more than 2 hours without logging out." },
      { "q": "How is someone's week off decided?", "a": "It follows whatever week-off schedule has been planned for that week; if nothing's been planned it falls back to their default weekly off day." },
      { "q": "Can I message someone directly from here?", "a": "Yes, click their name to open their detail panel, then switch to the Chat tab to send a message, attach a file, or dictate." },
      { "q": "How do I see what someone's working on today without opening their full panel?", "a": "Click the chevron on their row to expand an inline list of their tasks for today, right in the table." },
      { "q": "What does Expand All do?", "a": "It opens the inline task list for every employee in the table at once, instead of expanding rows one at a time." }
    ]
  },
  "/portal/reports": {
    "title": "Reports & Links",
    "intro": "A personal bookmark board for quick links to dashboards, spreadsheets, and reports you use often.",
    "topics": [
      { "q": "How do I add a link?", "a": "Click Add Link at the top, then fill in a name and the URL — an icon is picked automatically based on the name, and you can pick a color for the tile." },
      { "q": "Can I change a link after adding it?", "a": "Yes, hover the tile and click the pencil icon to edit its name, URL, or color." },
      { "q": "How do I remove a link?", "a": "Hover the tile and click the trash icon, then confirm — this can't be undone." },
      { "q": "Are these links shared with my team or just me?", "a": "They're saved to your own account, so only you see the links you add here." },
      { "q": "What happens when I click a tile?", "a": "It opens the link in a new browser tab, taking you straight to that dashboard or report." }
    ]
  },
  "/portal/users": {
    "title": "Team Members",
    "intro": "Manage the user accounts your organization has on the client portal, grouped by role.",
    "topics": [
      { "q": "How do I add a new team member?", "a": "Click Add Member in the top right, then fill in their name, email, password, and role. They can log in right away with that password." },
      { "q": "How do I change someone's role or details?", "a": "Click the pencil icon on their card to edit their name, email, or role. This isn't available for Admin accounts." },
      { "q": "How do I reset someone's password?", "a": "Click the key icon on their card and enter a new password of at least 6 characters." },
      { "q": "How do I remove someone's access without deleting their account?", "a": "Click the person icon to deactivate them — it toggles between Active and Inactive, and you can reactivate any time." },
      { "q": "Why can't I edit or deactivate some users?", "a": "Admin accounts are protected from edit, password reset, and deactivation from this screen to prevent locking out the account." }
    ]
  },
  "/portal/workspace": {
    "title": "Dev Workspace",
    "intro": "Track the progress of development projects the team is building for you, and share feedback directly with them.",
    "topics": [
      { "q": "What does clicking a project card show me?", "a": "It opens a details drawer with three tabs: Overview (progress, description, tech stack, sub-tasks), Updates (posts from the dev team), and Releases (shipped versions and release notes)." },
      { "q": "How do I filter which projects I see?", "a": "Use the All / Active / Planning / On Hold / Completed buttons above the project grid to filter by status." },
      { "q": "What's the Thoughts tab for?", "a": "It's a place to post ideas, concerns, or feedback for the dev team — give it a title and message, optionally attach up to 5 files, then click Post." },
      { "q": "Can I comment on other people's thoughts?", "a": "Yes, open any thought to read it and add a comment, with optional file attachments." },
      { "q": "Can I delete a thought or comment?", "a": "You can delete a thought only if you posted it, using the Delete Thought button in its drawer. You can delete your own comments the same way." }
    ]
  },
  "/portal/downloads": {
    "title": "Downloads",
    "intro": "Browse and download software, utilities, and shared files your team has made available to you.",
    "topics": [
      { "q": "How do I find a specific file?", "a": "Use the search box to filter by file name, description, or who uploaded it — the file count updates as you type." },
      { "q": "How do I download a file?", "a": "Click the green Download button on its card. Files marked Disabled can't be downloaded." },
      { "q": "How do I upload a new file?", "a": "Click Upload File in the top right — this option is only available to Admin accounts." },
      { "q": "How do I edit or remove a file I uploaded?", "a": "Use the pencil icon to edit its name, description, or version, or the trash icon to delete it permanently. These actions only appear on files you personally uploaded." },
      { "q": "What does the version badge mean?", "a": "It shows the version number the uploader set for that file, like v2.1.0, so you know if you have the latest one." }
    ]
  },
  "/portal/downloads/upload": {
    "title": "Upload File",
    "intro": "Add a new file to the shared Downloads library for your team to access.",
    "topics": [
      { "q": "How do I select a file to upload?", "a": "Drag and drop it onto the drop zone, or click the drop zone to browse your computer. Max file size is 1 GB." },
      { "q": "What fields do I need to fill in?", "a": "Name is required; Description and Version are optional. The name is pre-filled from the file's filename but you can change it." },
      { "q": "Why does it say Saving to Drive after the upload bar hits 100%?", "a": "The file finishes uploading to the server first, then gets copied to Google Drive in the background — that second step is what that message means." },
      { "q": "Who can access this upload page?", "a": "Only Admin accounts can upload files; everyone else is redirected back to the Downloads page." }
    ]
  }
};
