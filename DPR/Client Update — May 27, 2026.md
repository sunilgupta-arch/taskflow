# Client Update — May 27, 2026

## What's New

### Client Request Queue — Smarter Display

The request queue on both the internal admin panel and the client portal has been updated with several usability improvements:

- **Time is now the primary display** in the date column — so you can immediately see what time today a request was created without having to parse a full date
- **Who picked up your request and when** is now shown under the assignee's name
- **Comment count badge** on each request row shows at a glance how active the conversation is
- **How long it took** to complete or approve a request is now displayed, so you can track turnaround time
- **Yesterday / Tomorrow navigation buttons** added to the date picker on the internal side — no more manually selecting adjacent dates

**Portal side only:**
- When submitting a new request, you can now pick from a **pre-defined list of task types** rather than typing freeform — this makes routing and tracking more consistent

---

### Group Channel — @Mention Inbox

When someone tags you with `@yourname` in any group channel, you'll now see a **bell icon badge** in the navigation bar showing how many unread mentions you have.

- Click the bell to open your **Mentions Inbox** — a panel listing every message where you were tagged, across all channels
- Click any mention to **jump directly to that message** in the channel, which gets briefly highlighted so it's easy to spot
- The badge clears once you open the inbox

---

### Group Channel — Image Lightbox

Previously, clicking on an image posted in a group channel opened it in a new browser tab. Now it opens in a **lightbox overlay** directly in the page — no tab-switching needed.

---

### Group Channel — Paste Screenshots Directly

You can now **paste a screenshot** (or any copied image) directly into the group channel message area. A preview modal will appear so you can confirm the image before sending. Works on the internal admin panel and the client portal, in both the full channel page and the sidebar panel.

---

### My Tasks — Generate Daily Progress Report

Team members (managers and users) now have a **Generate DPR** button on their My Tasks page. Clicking it for a given date will:

1. Compile the tasks completed that day
2. Include any client queue requests handled
3. Open a pre-filled Gmail draft ready to send

The subject and recipient are automatically filled in — just review and hit send.

**Fix included:** Tasks without a scheduled due date were incorrectly appearing in every date's DPR. This has been corrected — only tasks actually due on the selected date are included.

---

### My Tasks — Staff Can Now Create Their Own Tasks

All team members (including regular users, not just managers) can now create tasks for themselves directly from the **My Tasks** page using the new **New Task** button.

- Choose between a one-time task (with a due date) or a recurring task (with a pattern, schedule, and optional end date)
- The task is automatically assigned to you — no need to select an assignee
