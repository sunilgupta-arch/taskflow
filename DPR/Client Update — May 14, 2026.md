# Client Update — May 14, 2026

**Subject:** TaskFlow Development Update — May 14, 2026

---

Hi,

Here is a summary of everything added and improved in TaskFlow today.

---

## What Was Done Today

### 1. Client Request Workflow — Approve and Reject

When a local staff member marks a client request as **Done**, the client who originally submitted that request now sees two buttons: **Approve** and **Reject**.

- If the client **approves**, the request is marked as Approved and the workflow is complete.
- If the client **rejects**, they are asked to enter a reason. That reason is saved as a comment and is immediately visible to local staff — so the team knows exactly why it was sent back.
- A rejected request returns to the queue so local staff can pick it up again and redo the work.
- All client users can see the Approved or Rejected status on any request in the portal — not just the original creator.

---

### 2. Reschedule Request Feature

Any local staff member can now **reschedule an open request** to a future date when the right person is not available that day.

When rescheduling:
- They must select a future date.
- They can optionally assign the rescheduled task directly to a specific team member.
- They must enter a reason — this reason is saved as a comment visible to everyone.

On the client portal, the request shows a **"Rescheduled → [new date]"** status so the client is always informed.

When a request is rescheduled, the client who created it automatically receives an **email notification** with the new date and the reason given by the team. This only applies to clients with a `@123cfc.com` workspace email.

---

### 3. Queue — Status Filters (Clickable Stat Cards)

The summary cards above the local request queue (Total, Open, In Progress, Done, Missed) are now **clickable filters**.

Clicking a card filters the queue table to show only requests with that status. Clicking the same card again — or clicking Total — clears the filter and shows all requests. A **Rescheduled** card has also been added to the summary row and works the same way.

---

### 4. Queue — Status Badges for Approved and Rejected

The local queue now shows clear status badges for **Approved** (green) and **Rejected** (rose/red) requests — so staff can see the outcome at a glance without opening the detail panel.

Rejected requests show a **Re-pick** button so the relevant staff member can immediately pick the task back up.

---

### 5. Queue — Done Button Improvement

Previously, the Done button always required entering a comment before completing a request. If a comment had already been added earlier during the same task, it would ask for another one.

This has been improved — if a comment already exists on the request, clicking Done will complete it immediately without asking for another comment.

---

### 6. Queue — Table Scrolls on Narrow Screens

On smaller screens or lower resolutions, the request table was getting cut off on the right side. The table now has a horizontal scroll so all columns remain accessible without anything being clipped.

---

### 7. Daily Requests Report — Automated Email at Midnight

A **daily summary email** is now sent automatically to the local admin team every night at midnight.

The report covers all client requests handled that day and includes:
- A summary row with counts for: Total, Done, In Progress, Open, Missed, and Rescheduled
- A detailed table listing every request with its title, who created it, current status, priority, who handled it, and the latest comment

The report is skipped in the development environment — it only runs on the live system.

---

### 8. Queue — Cleaner Top Bar Layout

The top section of the local queue has been reorganised into two rows so it no longer feels cluttered as more buttons were added.

- **Top row**: Date navigation on the left; Test Sound, Monthly Report, and the back button on the right.
- **Second row**: The status filter cards (Total, Open, In Progress, Done, etc.) sit on their own line, giving them more breathing room.

---

### 9. Queue — Monthly Requests Report (On-Demand)

Local admins and managers can now generate and receive a **monthly client requests report** directly from the queue page.

A **Monthly Report** button sits in the top bar of the queue. Clicking it opens a small panel where you select a month — the list only shows months that have actual request data in the system, so there are no empty options. After selecting a month and clicking Send, the report is emailed directly to the signed-in admin's email address.

The report email includes:
- A summary row with counts for: Total, Done, In Progress, Open, Missed, Approved, Rejected, and Rescheduled
- A full request table listing every request for that month with its date, title, who created it, current status, priority, who handled it, and the latest comment

This works for the current month as well as any previous month on record.

---

### 9. Queue — Client Online Status Indicator

The local request queue now shows a small **green dot** next to the name of the client who created a request, when that client is currently active on the portal.

- The dot appears and disappears in real time — no page refresh needed.
- If the client is offline, the dot simply isn't shown.
- This lets local staff instantly see whether the client is available, without opening the request or switching screens.

---

## In Progress / Coming Next
- Wiring email notifications into additional features (task assignments, leave updates, etc.) — will be done feature by feature as confirmed

---

That's everything for May 14. Let us know if you have any questions.

Best regards,
TaskFlow Development Team
