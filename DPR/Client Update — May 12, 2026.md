# Client Update — May 12, 2026

**Subject:** TaskFlow Development Update — May 12, 2026

---

Hi,

Here's a summary of what was worked on and delivered today for the TaskFlow system.

---

## What Was Delivered Today

### 1. Cancelled Request — Restore Feature
Previously, once a request was cancelled it was gone for good. We've now added the ability to restore a cancelled request:

- **Admins** can see all cancelled requests in the queue (sorted to the bottom) and restore any of them with a single click.
- **Request creators** on the portal can also restore their own cancelled requests.
- The queue's total count no longer includes cancelled items, so the numbers you see reflect only active work.

---

### 2. Missed Task Recovery — Late Pick & Delayed Done
If a task was missed on a past date, there was previously no way to go back and complete it. This has now been resolved:

- Agents can now **pick up a missed task from a past date** and mark it as done.
- Completed late tasks are clearly marked with a **"Delayed Done"** badge in purple so it's easy to tell them apart from on-time completions.
- When marking a task done, the agent is now **required to enter a completion remark** — this is saved as a comment on the task automatically, giving you a clear record of what happened.
- A **Release** button has been added for past picked tasks, allowing a picked task to be handed back if the agent can't complete it.

---

### 3. Queue Display Fixes
A few small but important display issues were corrected:

- The serial number (SN) column in the queue was starting at 2 — it now correctly starts at 1.
- The **Latest Comment** column in the admin queue was not showing any data — this is now fixed and shows the most recent comment on each request.
- Comment threads on the portal request detail page were blank — names, roles, and avatars now display correctly.

---

### 4. Sales Role Access
Users with the **Client Sales** role can now be assigned to tasks and can create tasks themselves. This was previously restricted by mistake.

---

### 5. Deactivated Users Cleanup
Deactivated user accounts no longer appear in attendance logs or reports. Only active users are shown going forward.

---

## In Progress

### Comp-Off Credit System
We started building a comp-off credit system for internal staff. When a team member works on their weekly off day, they can log it and earn a comp-off credit to use on a future date. The backend is fully built — the UI is being finalised and will be ready soon.

---

That's everything for May 12. Let us know if you have any questions or feedback.

Best regards,
TaskFlow Development Team
