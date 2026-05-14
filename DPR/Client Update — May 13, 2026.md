# Client Update — May 13, 2026

**Subject:** TaskFlow Development Update — May 13, 2026

---

Hi,

Here's a summary of what was worked on today for the TaskFlow system.

---

## What Was Done Today

### 1. Google Login — Production Setup Completed
The Google login (Sign in with Google) has been fully configured for both the development and production environments. Users on the internal network can now log in with their Google accounts when accessing the system via the office server, in addition to the development setup on localhost.

---

### 2. Email Notification System Built
A complete email notification system has been set up for TaskFlow using Gmail. This is the foundation that will allow the system to send email alerts for various events — such as task assignments, leave approvals, and other important updates.

The system is ready and will be connected to specific features as needed. Emails will carry TaskFlow branding and be clearly formatted for easy reading.

---

### 3. Group Channel Drawer — @mention and Reply Fixed (Multiple Attempts)

The Group Channel quick-access panel (the drawer that opens from the top bar) was missing the ability to reply to messages and to type `@` to mention a team member. These were fixed and are now working.

However, this fix required several rounds of investigation and correction, which is worth being transparent about:

**Round 1 — Wrong location fixed:** The first fix was applied to the wrong part of the system (the full channel page instead of the drawer panel). This was committed and deployed without being tested in the browser first, which was a mistake that should not happen. The user had to report back that nothing had changed before this was caught.

**Round 2 — Reply and actions fixed, mention still broken:** Once the correct component (the drawer) was identified, reply and delete actions were added and worked. But the `@` mention popup still did not appear.

**Round 3 — Wrong theory about user data:** The investigation pointed to a database query that was only returning client-type accounts. This was corrected to return all staff members too — but this turned out not to be the actual cause of the popup problem.

**Round 4 — True root cause found:** The drawer slides onto the screen using a CSS animation technique (`transform`). A known but non-obvious browser rule is that this type of animation breaks the way "fixed position" pop-up elements are placed on screen — they get anchored to the drawer panel itself rather than the screen, so they were rendering completely off-screen and invisible. Once the popup was changed to position itself relative to the input box inside the drawer (rather than the full screen), it appeared correctly.

**This issue took longer than it should have** because the popup was technically rendering with no errors — it just appeared in the wrong place. There was nothing in the code to indicate it was broken; it had to be ruled out step by step. The lesson for future work: whenever a pop-up is placed inside a sliding or animated panel, `position:fixed` cannot be used.

---

### 4. Group Channel Drawer — Date Separator Lines Now Visible

The date labels (e.g. "May 11") that divide messages by day were showing the text but the horizontal lines on either side were invisible against the dark background. The line colour has been made slightly brighter so the separators are now clearly visible.

---

### 5. Group Channel Drawer — Reply Quote Block Fixed

When replying to a message in the drawer, the reply bar at the bottom correctly showed which message was being replied to. However, once the reply was sent, the quoted preview of the original message did not appear inside the sent reply. This was caused by a mismatched field name in the code (a typo introduced when the drawer was built). It is now corrected — replied messages show the quoted original content above the reply text, matching the behaviour of the classic channel page.

---

### 6. Info Board — Access Controls Corrected

The Info Board (at `/admin/infoboard`) was already live but had two issues corrected:

- The sidebar navigation was not highlighting "Info Board" as the active page when you were on it — the wrong section identifier was being passed. This is now fixed.
- The "New Post", pin, and delete buttons were visible to all staff members, even though only admins can actually use those actions. Staff members would see the buttons but get an error if they tried to use them. These buttons are now correctly hidden for non-admin users.

---

### 7. My Attendance — Confirmed Complete

The My Attendance page (`/admin/my-attendance`) is confirmed fully working for all local users:
- Monthly attendance calendar with colour-coded day statuses
- Today's session breakdown (login/logout times, duration)
- Stats summary (days present, absent, leave, attendance rate)
- Comp-Off balance and application built in

---

## In Progress / Coming Next
- Wiring email notifications into specific features (task assignments, leave updates, etc.) — will be done feature by feature as confirmed

---

That's everything for May 13. Let us know if you have any questions.

Best regards,
TaskFlow Development Team
