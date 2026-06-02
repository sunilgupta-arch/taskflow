# Session Summary — June 1, 2026

## Focus
Comp-off cancel and revoke features, Google OAuth login diagnosis.

---

## 1. Comp-Off Cancel — User Self-Service

**Files:** `models/CompOff.js`, `controllers/compOffController.js`, `routes/index.js`, `views/admin/my-attendance.ejs`

### Scenario
User works on week-off day → earns comp-off → applies it to a future date → leave gets rejected or plans change → they need to undo it.

### What Was Built

**`CompOff.cancelCredit(creditId, userId)`**
- Validates: credit belongs to user, `status = 'used'`, `applied_to_date >= today`
- Reverts credit to `status = 'available'`, clears `applied_to_date`
- Deletes the `attendance_logs` row for the applied date (comp_off entry removed)

**New route:** `DELETE /comp-off/:creditId/cancel` — accessible to all LOCAL roles

**UI change in `views/admin/my-attendance.ejs`:**
- Comp-off history table now has a 4th column
- Rows with `status = 'used'` and `applied_to_date >= today` show a red **Cancel** button
- Clicking prompts confirmation, calls the API, refreshes the balance panel

**Rule:** Cancel only works if the comp-off date is today or in the future. Past comp-offs (already taken) cannot be cancelled.

---

## 2. Comp-Off Revoke — Admin/Manager Action

**Files:** `migrations/059_comp_off_revoked_status_2026-06-01.sql`, `models/CompOff.js`, `controllers/compOffController.js`, `routes/index.js`, `views/admin/comp-off.ejs`

### Scenario
User logs in on week-off day and marks as "working" → earns comp-off credit → manager says "no, take the day off, you didn't actually work" → admin needs to undo the earned credit and fix yesterday's attendance.

### What Was Built

**Migration 059** — adds `revoked` to `comp_off_credits.status` enum (`available` | `used` | `revoked`) so revoked credits stay in history.

**`CompOff.revokeCredit(creditId)`** (no userId — admin action, any user's credit)
- If `status = 'used'` and `applied_to_date >= today`: also removes the future leave from `attendance_logs`
- Removes the "worked on off day" `attendance_logs` entry for `earned_date` → day reverts to week-off on calendar
- Sets credit to `status = 'revoked'`, clears `applied_to_date`

**New route:** `DELETE /comp-off/:creditId/revoke` — `LOCAL_ADMIN` and `LOCAL_MANAGER` only

**UI change in `views/admin/comp-off.ejs` (admin history drawer):**
- Revoked credits show grey "Revoked" badge + "Revoked — attendance corrected" subtext
- **Revoke button** shown for:
  - `available` credits (not yet applied — just fix attendance)
  - `used` credits where `applied_to_date >= today` (fix attendance + cancel the future leave)
- Confirmation dialog explains exactly what will happen (two bullet points)
- After revoke: summary table refreshes + drawer re-opens with updated history

### Cancel vs Revoke Summary

| | Cancel | Revoke |
|---|---|---|
| Who | Any LOCAL user (own credits only) | LOCAL_ADMIN / LOCAL_MANAGER (any user) |
| What it fixes | Future comp-off leave entry | Earned credit + future leave (if any) |
| Attendance corrected | Applied date only | Earned date + applied date |
| Credit status after | `available` (restored) | `revoked` (permanent) |

---

## 3. Google OAuth Login — Diagnosis

**No code changed** — investigation and fix guidance only.

### Root Cause
`GOOGLE_CALLBACK_URL=http://localhost:5600/auth/google/callback` in `.env` — hardcoded to `localhost`. Users on other machines get a redirect URI pointing to their own localhost, which has no server.

### Production Fix Required
On the production server (`192.168.0.211`), the `.env` must have:
```
APP_URL=http://192.168.0.211:5500
GOOGLE_CALLBACK_URL=http://192.168.0.211:5500/auth/google/callback
```
And Google Cloud Console → OAuth Client → **Authorized redirect URIs** must have `http://192.168.0.211:5500/auth/google/callback` exactly.

### New User Clarification
Google login in this app is **login-only**, not self-registration. `AuthService.loginWithGoogle()` looks up the user by email — if not found, throws `not_registered`. New users must be created by admin first (email must match their Google account), then they can use Google sign-in. Auto-registration was intentionally not built because LOCAL vs CLIENT role assignment can't be inferred from a Google account alone.

---

## Migrations Applied Today

| File | What |
|------|------|
| `059_comp_off_revoked_status_2026-06-01.sql` | Added `revoked` to `comp_off_credits.status` enum |

---

## Files Changed

| File | Summary |
|------|---------|
| `models/CompOff.js` | Added `cancelCredit()` and `revokeCredit()` methods |
| `controllers/compOffController.js` | Added `cancelCompOff()` and `revokeCredit()` handlers |
| `routes/index.js` | `DELETE /comp-off/:creditId/cancel` (all LOCAL), `DELETE /comp-off/:creditId/revoke` (admin/manager only) |
| `views/admin/my-attendance.ejs` | Cancel button in comp-off history rows (future/today dates only) |
| `views/admin/comp-off.ejs` | Revoke button in admin history drawer; `revoked` status styling; refreshes summary after revoke |
| `migrations/059_comp_off_revoked_status_2026-06-01.sql` | New migration: `revoked` enum value |
