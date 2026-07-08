/* Per-page help content for the Admin Hub contextual "?" drawer.
   Keyed by exact route path (window.location.pathname). */
window.ADM_HELP_CONTENT = {
  "/admin": {
    "title": "Admin Hub Home",
    "intro": "The landing page with quick-launch cards to every part of the hub, tailored to your role.",
    "topics": [
      { "q": "Why do my cards look different from a teammate's?", "a": "Admins and Managers see Work, Team, Reports, Communications and Tools. Regular Users see My Tasks, Client Queue, Communications and Leaves instead." },
      { "q": "I don't see a Dev Workspace card, why not?", "a": "That card only appears for accounts flagged as a developer. Ask an admin to enable your developer flag if you need access." },
      { "q": "What's bundled inside Communications?", "a": "The group channel, direct chat, info board announcements and team notes all live there." },
      { "q": "Where do I create or manage tasks?", "a": "Admins and Managers use the Work card for the task board and client queue. Users go to My Tasks for what's assigned to them." }
    ]
  },
  "/admin/my-tasks": {
    "title": "My Tasks",
    "intro": "Your own personal task list for today or all-time, with start/complete actions and a one-click Daily Progress Report.",
    "topics": [
      { "q": "What's the difference between the Today and All My Tasks tabs?", "a": "Today only shows what's scheduled for the selected day. All My Tasks lists everything ever assigned to you, regardless of date." },
      { "q": "How do I mark a task done?", "a": "Click Start when you begin working, then Complete or Done when you finish. Recurring tasks track a live timer between the two." },
      { "q": "What does Generate DPR do?", "a": "It builds a Daily Progress Report from your completed, in-progress, and pending tasks and opens a pre-filled Gmail draft so you can send it." },
      { "q": "Can I create a task for myself here?", "a": "Yes, click New Task — it works like the main task creator but automatically assigns the task to you." },
      { "q": "How do I comment on a task?", "a": "Click the task title to open its detail panel, then use the comment box at the bottom to post." }
    ]
  },
  "/admin/queue": {
    "title": "Client Queue",
    "intro": "The daily list of client-submitted requests to pick up, work, chat about, and mark done.",
    "topics": [
      { "q": "How do I pick up a request?", "a": "Click Pick on the row, or open it and click Pick there — it assigns the request to you and moves it into Picked status." },
      { "q": "How do I mark a request done?", "a": "Click Done — you'll be asked to add a completion remark describing what was done before it closes." },
      { "q": "What does Release do?", "a": "It sends the request back to the open queue so someone else can pick it up, with an optional reason." },
      { "q": "How do I reschedule a request to another day?", "a": "Open the request and click Reschedule — pick a new date, optionally reassign it, and add a reason since it's required so the client knows why." },
      { "q": "How do I search across all requests, not just today's?", "a": "Click Search & Filter to look across everything by client, who picked it up, or a keyword, and export the results to CSV." },
      { "q": "Can I message the client about a request?", "a": "Yes — open the request to see its correspondence thread, or use the chat button to send messages, paste images, or attach files." }
    ]
  },
  "/admin/comms": {
    "title": "Communications",
    "intro": "Hub page linking to all team communication tools — chat, group channel, info board, and notes.",
    "topics": [
      { "q": "What's the difference between Local Chat and Group Channel?", "a": "Local Chat is private direct messages and small group chats between team members. Group Channel is one team-wide chat room with mentions, replies, reactions, and pinned messages." },
      { "q": "Where do I post an announcement for everyone?", "a": "Use Info Board — it's for posting and pinning announcements to your local team or client users, separate from regular chat." },
      { "q": "Where do I keep personal reference notes or SOPs?", "a": "Open Notes — it's your own private space for SOPs and reference material, not shared with the team." },
      { "q": "Which tool should I use to message just one coworker?", "a": "Use Local Chat and start a new Direct conversation with them." }
    ]
  },
  "/admin/chat": {
    "title": "Local Chat",
    "intro": "Private direct messages and group chats between local team members, with file sharing and Drive integration.",
    "topics": [
      { "q": "How do I start a new conversation?", "a": "Click \"New\" in the sidebar, choose Direct or Group, pick users from the list, and (for a group) give it a name, then Start Chat." },
      { "q": "How do I send a file, and can I pull one from Drive?", "a": "Click the paperclip icon and choose Upload File or From Drive — you can also just drag a file onto the chat window to send it." },
      { "q": "How do I mute a conversation so it stops notifying me?", "a": "Open the conversation and click the bell icon in the header — it toggles mute on and off; muted chats won't bump your unread count or play a sound." },
      { "q": "Can I edit or delete a message after sending it?", "a": "Yes — hover the message and use the pencil icon to edit or the trash icon to delete it. You can also reply, react with an emoji, or copy the text." },
      { "q": "What happens when I clear a chat?", "a": "It only hides the messages from your own view — the other person still sees the full history, and this can't be undone." },
      { "q": "What is the System conversation in my chat list?", "a": "That's an automated, read-only channel for system notifications like reminders — you can't reply in it." }
    ]
  },
  "/admin/channel": {
    "title": "Group Channel",
    "intro": "Team-wide real-time chat room with mentions, replies, reactions, pinned messages, and file sharing.",
    "topics": [
      { "q": "How do I mention someone?", "a": "Type @ and start typing their name — a dropdown of matching people appears so you can pick who to tag." },
      { "q": "Where do I see messages that mentioned me?", "a": "Click the @ icon in the top bar to open \"My Mentions\" — it lists every mention with a badge for ones you haven't seen yet." },
      { "q": "Can I edit or delete a message I sent?", "a": "You can edit your own text messages within 15 minutes of sending. You can delete your own messages anytime, and admins can delete or pin any message." },
      { "q": "How do pinned messages work?", "a": "Admins can pin important messages from the message menu; click the pin icon in the top bar to expand the pinned list and jump to any of them." },
      { "q": "How do I search old messages or attach a file?", "a": "Click the search icon to search channel history, or the paperclip icon to attach a file (max 5 MB) — images preview inline and other files show as a download card." }
    ]
  },
  "/admin/infoboard": {
    "title": "Info Board",
    "intro": "A two-column announcement board for posting updates to your local team and viewing client announcements.",
    "topics": [
      { "q": "Who can actually publish a post?", "a": "Only Admins can publish, pin, or delete posts in the Local Team column. Managers and Users can read but not post." },
      { "q": "What's the difference between the two columns?", "a": "Local Team is announcements from your own organization. Client Updates are read-only posts made by the client side, shown for awareness." },
      { "q": "What does Pin to top do?", "a": "It keeps that post at the top of its column with a pin badge, so it doesn't get buried under newer posts. Admins can toggle it anytime." },
      { "q": "What does the ALL TEAMS badge mean on a client post?", "a": "It means the client posted that announcement for every local organization, not just yours." },
      { "q": "Can I edit a post after it's published?", "a": "No, there's no edit option. You'd need to delete it and publish a new one." }
    ]
  },
  "/admin/notes": {
    "title": "My Notes",
    "intro": "Your personal notes space for SOPs and reference material, visible only to you.",
    "topics": [
      { "q": "Who else can see my notes?", "a": "Nobody — notes are private to you only, not shared with the rest of the team." },
      { "q": "How do I switch between grid and list view?", "a": "Use the grid/list icons next to the search box in the toolbar — your choice is remembered for next time." },
      { "q": "Can I dictate a note instead of typing it?", "a": "Yes — click \"Dictate\" next to the Title or Content field to use voice input; click it again to stop." },
      { "q": "Can I have a note read back to me?", "a": "Yes — click the speaker icon on any note card to have it read aloud; click again to stop." },
      { "q": "How do I find an old note?", "a": "Use the search box at the top — it filters notes by matching text in either the title or the content." }
    ]
  },
  "/admin/leaves": {
    "title": "Leave Management",
    "intro": "Apply for leave, review pending requests, and track approval status for the whole team.",
    "topics": [
      { "q": "Who can apply and who can approve?", "a": "Users and Managers can apply for their own leave. Admins and Managers can approve, reject, or grant leave to others. Admins don't have a self-apply option." },
      { "q": "What does Grant Leave do differently from Apply?", "a": "Grant Leave immediately creates an already-approved leave for whichever teammate you pick, no separate approval step needed." },
      { "q": "Why did my request get blocked for overlapping dates?", "a": "The system won't let you submit a new leave request if it overlaps any of your existing pending or approved leave." },
      { "q": "Can I apply for leave in the past?", "a": "No, the from date can't be earlier than today." },
      { "q": "What do the All/Pending/Approved/Rejected/My Leaves tabs do?", "a": "They just filter the table. The Pending tab count lights up orange whenever there's something waiting on a review." }
    ]
  },
  "/admin/downloads": {
    "title": "Downloads",
    "intro": "A shared file library for distributing software, utilities, and documents to the team, with optional public sharing.",
    "topics": [
      { "q": "Who can upload files here?", "a": "Local Admins, Local Managers, and Client Admins see the Upload File button — other roles can browse and download but not add files." },
      { "q": "How do I find a specific file?", "a": "Use the search box to filter by name, description, or uploader — it filters the table live as you type." },
      { "q": "What does making a file 'Public' do?", "a": "Toggling the globe icon (admins and managers only) puts the file on the public /downloads page, where anyone can download it without logging in." },
      { "q": "What does the disable button do versus deleting a file?", "a": "Disabling (admin only) hides the download button from regular users while keeping the file and its history intact — admins can still download disabled files. Deleting removes it permanently." },
      { "q": "Can I edit a file's name, description, or version after uploading?", "a": "Yes — click the pencil icon if you're an admin or the original uploader, update the fields in the modal, and save." }
    ]
  },
  "/admin/downloads/upload": {
    "title": "Upload File",
    "intro": "Upload a new file into the Downloads library, with a name, description, version, and optional public visibility.",
    "topics": [
      { "q": "What's the maximum file size?", "a": "500 MB per file — trying to select something larger shows an error immediately instead of starting the upload." },
      { "q": "Do I have to type a name manually?", "a": "No — as soon as you pick a file, the Name field auto-fills with the filename (minus its extension), though you can edit it before uploading." },
      { "q": "What does 'Make publicly available' do?", "a": "It marks the file so it appears on the public /downloads page where anyone can download it without logging in — you can leave it unchecked to keep the file team-only." },
      { "q": "Is the Version field required?", "a": "No, it's optional — leave it blank if the file doesn't have a meaningful version number." },
      { "q": "What happens after I click Upload File?", "a": "You'll see a progress bar for the upload itself, then a 'Saving to Drive' step while it's backed up to Google Drive, and you're redirected back to the Downloads list once it succeeds." }
    ]
  },
  "/admin/my-attendance": {
    "title": "My Attendance",
    "intro": "Your personal attendance calendar, monthly stats, comp-off balance, and next week's weekoff — plus leave and comp-off requests.",
    "topics": [
      { "q": "How do I see my sessions for a specific day?", "a": "Click any day on the calendar and the panel above it fills in with your login/logout times and total hours for that day." },
      { "q": "How do I request a different weekoff day next week?", "a": "In the 'Next week's weekoff' bar, pick a day from the dropdown and click 'Request a different day' — your manager sees it when they plan the roster." },
      { "q": "How do I apply for leave?", "a": "Click Apply Leave (top right), pick your from/to dates and a reason, and submit — it goes in as pending for approval. This button is only shown to LOCAL_USER and LOCAL_MANAGER." },
      { "q": "How do I use a comp-off credit?", "a": "In the Comp-Off Balance card, click Apply Comp-Off, choose one or more future dates (up to your available balance), and submit. You can cancel a used credit later if the date hasn't passed yet." },
      { "q": "What does the WO Swap badge mean on the calendar?", "a": "It marks a day you worked in exchange for your usual weekoff, which is what earned you a comp-off credit." }
    ]
  },
  "/admin/my-progress": {
    "title": "My Progress",
    "intro": "Your personal day-by-day task activity, completion rate, and a monthly report drawer.",
    "topics": [
      { "q": "How do I look at a different day?", "a": "Use the Prev/Next arrows or the date picker in the toolbar. If you're not on today, a TODAY button appears to jump straight back." },
      { "q": "What's the difference between Pending and Not Done?", "a": "Pending means the task is still open on a day that hasn't passed yet. Not Done means it was left incomplete on a day that's already gone." },
      { "q": "Why does a day show WEEK OFF with no tasks listed?", "a": "That date resolves to your weekoff, either from the published roster or your default weekly off day, so the task list is intentionally cleared for that day." },
      { "q": "What does the Monthly Report drawer show?", "a": "Pick a month and load it to see total/done/completion-rate stats plus a daily breakdown. Click any day in the breakdown to jump straight to it." },
      { "q": "What are Completed Today and This Month?", "a": "Two extra counters that only appear when you're viewing today, showing your running completed-task totals." }
    ]
  },
  "/admin/all-tasks": {
    "title": "All Tasks",
    "intro": "A searchable, filterable catalog of every task in the system with tools to create, reassign, deactivate, or delete tasks.",
    "topics": [
      { "q": "What do the colored cards at the top do?", "a": "Each one is a filter shortcut — click Unassigned, Completed, Deactivated, etc. to instantly narrow the table to that group. Click Total Tasks to clear the filter." },
      { "q": "How do I create a new task?", "a": "Click New Task in the toolbar. Fill in the title, type, and priority, then for recurring tasks pick the pattern and days/dates before hitting Create Task." },
      { "q": "How do I reassign a task to someone else?", "a": "Click the Assign button on the task row, pick the new person from the list, and click Save." },
      { "q": "What's the difference between Deactivate and Delete?", "a": "Deactivate just pauses the task and keeps its history. Once a task is deactivated, the button turns into Delete, which permanently removes it and can't be undone." },
      { "q": "What are the Secondary and Tertiary assignee fields for?", "a": "They're backup assignees who automatically take over the task if the primary person is on leave. They're only available when assigning to one person, not with multi-assign." }
    ]
  },
  "/admin/taskboard": {
    "title": "Task Board",
    "intro": "A single-day view of every employee's assigned tasks with live status, priority, and duration.",
    "topics": [
      { "q": "How do I see a different day's tasks?", "a": "Use the arrow buttons or the date picker to move between days, or click TODAY to jump straight back to the current date." },
      { "q": "What does the small tag next to someone's name mean?", "a": "It means the task fell back to a backup assignee — 2nd or 3rd — because the original person was unavailable, and it shows who it was originally assigned to." },
      { "q": "Can I filter by employee or task type?", "a": "Yes, use the Employee and Type dropdowns in the toolbar to narrow the board to one person or just recurring or one-time tasks." },
      { "q": "What do the Total/Done/In Progress/Pending counts mean?", "a": "They're a live tally of the tasks currently shown on the board, updating as you change the date or filters." }
    ]
  },
  "/admin/work": {
    "title": "Work Hub",
    "intro": "The landing page for task management — links out to the task board, full task list, client queue, dev workspace, and your own tasks.",
    "topics": [
      { "q": "What's the difference between Task Board and All Task Manager?", "a": "Task Board shows one day's tasks grouped by employee for a quick daily check. All Task Manager is the full searchable list of every task with filters and bulk actions." },
      { "q": "What is Client Queue for?", "a": "It's where the team picks up and completes requests that clients have submitted for the day." },
      { "q": "What's Dev Workspace?", "a": "It tracks developer projects — their progress, sub-tasks, and which parts are visible to clients." },
      { "q": "Where do I see just my own tasks?", "a": "Click My Tasks — it shows only what's assigned directly to you, with deadlines and priority." }
    ]
  },
  "/admin/team": {
    "title": "Team Overview",
    "intro": "This is the hub page that links out to every team-management tool — live status, users, attendance, leaves, comp-off, and roster.",
    "topics": [
      { "q": "What's the difference between Live Status and Attendance?", "a": "Live Status shows who is working, idle, or absent right now in real time. Attendance is the historical record — daily logs, a monthly calendar, and override tools." },
      { "q": "Where do I manage weekoffs?", "a": "Click the Roster card. That's where you plan next week's weekoff per employee and see any day-change requests they've submitted." },
      { "q": "Where do I see comp-off credits?", "a": "Click the Comp-Off card to see every team member's available, used, and total earned credits, plus a full history per person." },
      { "q": "Can I manage user accounts from here?", "a": "Yes, the Users card takes you to role, shift, and account settings for each team member." },
      { "q": "Who can see this page?", "a": "Only LOCAL_ADMIN and LOCAL_MANAGER roles get the Team section — regular users don't have access to it." }
    ]
  },
  "/admin/comp-off": {
    "title": "Comp-Off Management",
    "intro": "Track compensatory-off credits your team has earned by working on their days off, and manage each person's credit history.",
    "topics": [
      { "q": "What do the stat cards at the top mean?", "a": "They total available, used, and total-earned credits across the whole team, plus a headcount of members who have any comp-off activity." },
      { "q": "How do I see one person's full credit history?", "a": "Click History next to their row — a drawer opens showing every credit they've earned, when it was applied, and its status." },
      { "q": "What does Revoke do, and when can I use it?", "a": "Revoke removes a credit — available credits any time, or used credits if the day off they applied it to hasn't happened yet. It also cancels any future leave booked against that credit and reverts the day back to a regular week-off." },
      { "q": "Do comp-off credits expire?", "a": "No, there's no expiry — a credit stays available until it's used or manually revoked." },
      { "q": "How do I find a specific team member?", "a": "Type their name into the search box above the table to filter the list." }
    ]
  },
  "/admin/roster": {
    "title": "Weekly Roster",
    "intro": "Plan next week's weekoff for every employee, honoring any day-change requests before you publish.",
    "topics": [
      { "q": "How do I set someone's weekoff day for the week?", "a": "Click the day pill you want in their row — it highlights to show it's selected. Nothing is saved until you hit Publish Week." },
      { "q": "What does the orange dot on a day mean?", "a": "It marks a day the employee has requested for that week. Their note (if they left one) shows underneath their row." },
      { "q": "What happens to a pending request when I publish?", "a": "If you assign the day they asked for, their request is marked fulfilled; if you pick a different day, it's marked declined. Either way it's resolved — nothing stays pending after publish." },
      { "q": "What's the difference between Draft and Published status?", "a": "Draft means the week hasn't been published yet, so employees are still seeing their default weekoff day. Published means the assignments are live and override the default." },
      { "q": "How do I jump to a different week?", "a": "Use the arrows next to the week label, or click any date in the mini calendar on the right — it jumps straight to the week containing that date." }
    ]
  },
  "/admin/live-status": {
    "title": "Live Status",
    "intro": "A real-time, auto-refreshing view of who's currently working, idle, absent, or off-shift, with quick chat and force-logout actions.",
    "topics": [
      { "q": "How often does this refresh?", "a": "Automatically every 30 seconds — the countdown in the top bar shows time until the next refresh. You can also hit Refresh to update immediately." },
      { "q": "What's the difference between Idle, Absent, and Stale?", "a": "Idle means they're logged in but have no active task session. Absent means their shift started but they haven't logged in. Stale means they're still logged in well after their shift ended and likely forgot to log out." },
      { "q": "What does Force Logout do?", "a": "It ends that person's open session immediately, stamped with your name as the reason. It only appears for people who are stale, extending, or idle with an open attendance session." },
      { "q": "Can I message someone from this page?", "a": "Yes, hover any card and click Chat to open a private message drawer with them, right from their status card." },
      { "q": "How do I find one specific person?", "a": "Use the search box in the top bar to filter by name, or click one of the status tabs (Working, Idle, Absent, Extending, Off/Leave) to narrow the grid." }
    ]
  },
  "/admin/users": {
    "title": "Users",
    "intro": "Manage local team members and client portal users — create accounts, set roles/shifts, and control access.",
    "topics": [
      { "q": "How do I add a new team member or client user?", "a": "Switch to the Local Team or Client Users tab and click Add Member (or Add Client User), then fill in name, email, organization, and role. Local Users/Managers also get a weekly off day, shift start time, and shift hours." },
      { "q": "What does the Visible/Hidden toggle on a local user do?", "a": "It controls whether that team member shows up to clients in the portal. Only admins can toggle it, and it only appears on local team members." },
      { "q": "How do I reset someone's password?", "a": "Click the Pwd button on their card, enter a new password (min 6 characters) twice, and hit Reset. This works for both local and client accounts if you're an admin." },
      { "q": "What's the difference between deactivating and force-logging-out a user?", "a": "Deactivate (admin only) disables their account entirely so they can't log in again. Force logout just kicks a currently-logged-in LOCAL_USER out immediately — managers can do this too, but only for regular users, not other managers or admins." },
      { "q": "What is Portal Support Delegation?", "a": "As the primary admin, you're the default support contact shown in the client portal — this strip lets you optionally hand that off to a secondary local team member instead." }
    ]
  },
  "/admin/attendance": {
    "title": "Attendance",
    "intro": "Review daily and monthly attendance across the team, override statuses, manage holidays, and force-close open sessions.",
    "topics": [
      { "q": "What's the difference between the Daily, Monthly, Comp-Off, and Status tabs?", "a": "Daily shows one day's login/logout sessions per person. Monthly shows a full-month grid with a status icon per day. Comp-Off shows the same credit summary as the Comp-Off page. Status shows team-wide totals for the selected day." },
      { "q": "How do I correct someone's attendance for a day?", "a": "Click Override on their row (Daily tab) or click their cell in the Monthly grid, then pick a status like Present, Absent, Half Day, or Leave and add a note. This is admin-only." },
      { "q": "What does the orange +Xm chip mean?", "a": "It flags a late login — the time shown is how far past their shift start they logged in. Hover it to see their late reason if they gave one." },
      { "q": "How do I add or remove a company holiday?", "a": "Click the Holidays button (top right of Daily or Monthly view), then add a date and name or delete an existing one. Holidays apply to the whole team, not just one person." },
      { "q": "What does Force Logout do here?", "a": "Same as on Live Status — it closes a still-open session immediately. You'll find it inside a person's expanded session row on the Daily tab." }
    ]
  },
  "/admin/reports": {
    "title": "Reports",
    "intro": "Landing page for the two analytics reports — task completion and client queue performance.",
    "topics": [
      { "q": "What's the difference between the two report cards?", "a": "Task Completion shows a monthly grid of completed vs total tasks per team member — click any cell to drill into that day. Client Queue Report shows monthly client-request stats like completion rate, missed, and rejected requests." },
      { "q": "Where do I see task completion by employee?", "a": "Click the Task Completion card — it opens a monthly grid you can click into for any day's task detail." },
      { "q": "Where do I see how the queue performed last month?", "a": "Click the Client Queue Report card to open the monthly breakdown of client requests and team performance." }
    ]
  },
  "/admin/task-completion": {
    "title": "Task Completion Report",
    "intro": "A monthly grid showing every employee's day-by-day task completion rate.",
    "topics": [
      { "q": "What do the colored chips mean?", "a": "Green means 100% of that day's tasks were done, amber is 50-99%, orange is under 50%, and red is 0%. Gray W is a week off and purple H is a holiday." },
      { "q": "How do I see which tasks were done or missed on a given day?", "a": "Click any chip to open a popup listing that day's tasks with Done, Not Done, or Pending badges." },
      { "q": "What does the Score column mean?", "a": "It's the employee's overall completion percentage for the month, excluding week-offs, holidays, and future days." },
      { "q": "How do I view a different month?", "a": "Use the arrows next to the month label at the top to move to the previous or next month." }
    ]
  },
  "/admin/queue-report": {
    "title": "Client Queue Report",
    "intro": "Monthly breakdown of client requests — completion rate, missed, rejected, and per-employee performance.",
    "topics": [
      { "q": "How do I see a different month?", "a": "Use the left/right chevron buttons next to the month label to step back or forward. You can't go past the current month." },
      { "q": "What counts as \"Missed / Not Picked\"?", "a": "That stat combines requests that were missed and requests nobody picked up in time — it's shown together as one red stat card." },
      { "q": "What's the difference between Rejected and In Progress?", "a": "Rejected is requests the local team turned down; In Progress is requests currently picked up and being worked on right now." },
      { "q": "What do the columns in the Team Performance table mean?", "a": "Handled is total requests touched, Completed and On Time break down finished work, Late flags anything completed past deadline, and Rejected/In Progress show current workload per person." },
      { "q": "How do I email this report to myself?", "a": "Click \"Email Report\" in the top right — it sends the currently viewed month's report to your email and shows a confirmation." }
    ]
  },
  "/admin/workspace": {
    "title": "Dev Workspace",
    "intro": "Where developers track project progress, tasks, and releases, and exchange ideas with admins and clients.",
    "topics": [
      { "q": "Who can see this page?", "a": "Admins, Managers, and any account flagged as a developer." },
      { "q": "What's the difference between Projects, Notes, and Thoughts?", "a": "Projects tracks dev work with tasks, milestones, updates and releases. Notes are ideas admins share with specific developers. Thoughts are read-only ideas submitted from the client side." },
      { "q": "What does the Visible to client toggle do?", "a": "When checked, that project's overview, updates, and releases become visible on the client portal's own workspace view. Tasks and the internal discussion tab always stay private." },
      { "q": "How do I move a task through its stages?", "a": "Click a task's checkbox to cycle it through todo, in progress, and done. Click the priority dot to cycle high, medium, and low." },
      { "q": "What's the difference between the Updates and Discussion tabs?", "a": "Updates is a one-way progress log for posting what you worked on. Discussion is a two-way comment thread anyone with access to the project can reply in." }
    ]
  },
  "/admin/tools": {
    "title": "Tools",
    "intro": "A hub linking out to utility integrations — Google Drive, file downloads, help docs, and (admin-only) database backups.",
    "topics": [
      { "q": "What tools are available here?", "a": "Google Drive for file storage/sharing, Downloads for distributing software and files to the team, and Help Center for guides. Admins also see a Backup card." },
      { "q": "Why don't I see the Backup option?", "a": "Backup management is restricted to LOCAL_ADMIN accounts only — managers and users won't see that card." },
      { "q": "Where does clicking each card take me?", "a": "Each card is just a shortcut to its own dedicated page — Drive opens /admin/drive, Downloads opens /admin/downloads, and so on." }
    ]
  },
  "/admin/drive": {
    "title": "Google Drive",
    "intro": "Browse, upload, and organize files in your connected Google Drive folder directly from TaskFlow.",
    "topics": [
      { "q": "How do I upload a file?", "a": "Click Upload to open the drop zone, then drag files in or click browse. You can also just drag files anywhere onto the page." },
      { "q": "Is there a file size limit?", "a": "Yes — admins and managers can upload up to 100MB per file, while other roles are capped at 10MB per file. The limit is shown next to the Upload button." },
      { "q": "How do I create a folder or move into one?", "a": "Click Folder to create a new one in the current location, and double-click any folder tile to open it — the breadcrumb at the top lets you jump back to a parent folder or My Drive." },
      { "q": "How do I rename, download, or delete a file?", "a": "Click the three-dot menu on a file or folder tile to open Open, Download, Rename, and Delete options. Deleting moves the item to Drive's trash rather than permanently erasing it." }
    ]
  },
  "/admin/backup": {
    "title": "Database Backup",
    "intro": "Create, schedule, and restore full database backups, with optional storage in Google Drive — admin only.",
    "topics": [
      { "q": "How do I create a backup right now?", "a": "Click Create Backup in the Quick Actions tile — it runs immediately and the new file shows up at the top of Backup History." },
      { "q": "How do I set up automatic daily backups?", "a": "In the Scheduled Backup card, pick a daily time and how many backups to keep (Max Kept), then hit Save. You can disable it anytime with the X button." },
      { "q": "How do I restore the database from a backup?", "a": "Click Restore next to any successful backup in the history table, a Drive backup via the Restore from Google Drive section, or upload a .sql file directly. Every restore path automatically takes a safety backup first and requires two confirmations since it overwrites the live database." },
      { "q": "Can I store backups in Google Drive?", "a": "Yes — click the Drive button next to a backup to upload it to the db_backup folder, or use Refresh in the Restore from Google Drive card to pull backups that already live there." },
      { "q": "How do I get a backup file onto my own machine?", "a": "Click the download icon in the Actions column for any backup row to download the raw .sql file." }
    ]
  },
  "/admin/security": {
    "title": "Security Audit",
    "intro": "Flags local team members whose login/logout timing looks automated or scripted, based on the last 21 days of sessions.",
    "topics": [
      { "q": "What makes someone show up as High Risk vs Medium Risk?", "a": "High risk means their login time barely varies day to day (under 90 seconds of spread) or they log in within 45 seconds of shift start on average — both look like a bot rather than a human. Medium risk is a milder version of the same pattern, like consistency under 300 seconds." },
      { "q": "Why isn't a user showing up here at all?", "a": "Users need at least 5 recorded sessions before they're analyzed at all, and if their timing looks normal they simply don't appear — a 'No anomalies detected' message shows when nobody is flagged." },
      { "q": "What do Login Time SD and Avg offset actually mean?", "a": "SD (standard deviation) is how much their daily login/logout time varies — a very low number means suspiciously consistent timing. Avg offset is how close, on average, their login/logout lands to their scheduled shift start/end." },
      { "q": "Can I see the actual session times behind a flag?", "a": "Yes, expand a user's card to see their last 7 days of login/logout times in a table, plus the specific flags that were triggered and their shift info." },
      { "q": "Why are some cards already expanded when I load the page?", "a": "High risk cards auto-expand so you can immediately see the evidence; medium risk cards stay collapsed until you click them." }
    ]
  }
};
