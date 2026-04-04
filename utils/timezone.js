/**
 * Timezone utility — get current date/time in a specific IANA timezone.
 * Node.js has built-in Intl/timezone support, no external packages needed.
 */

function getNow(timezone = 'UTC') {
  const now = new Date();
  const str = now.toLocaleString('en-CA', { timeZone: timezone, hour12: false });
  // en-CA gives YYYY-MM-DD, HH:MM:SS format
  // Parse parts manually to avoid local timezone reinterpretation
  const [datePart, timePart] = str.replace(',', '').trim().split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = (timePart || '00:00:00').split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function getToday(timezone = 'UTC') {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
  // en-CA returns YYYY-MM-DD
}

/**
 * Get current UTC timestamp as a MySQL-compatible string (YYYY-MM-DD HH:MM:SS).
 * Use this instead of MySQL NOW() to keep JS date and timestamps on the same clock.
 */
function getUTCNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Get the effective "working day" date for a user, accounting for night shifts.
 * If the user's shift crosses midnight and the current time is in the post-midnight
 * portion of the shift, returns yesterday's date instead of today's.
 *
 * @param {string} timezone - IANA timezone (e.g. 'Asia/Kolkata')
 * @param {string} shiftStart - Shift start time as HH:MM:SS (e.g. '19:30:00')
 * @param {number} shiftHours - Shift duration in hours (e.g. 9)
 * @returns {string} YYYY-MM-DD date string
 */
function getEffectiveWorkDate(timezone, shiftStart, shiftHours) {
  const today = getToday(timezone);
  if (!shiftStart || !shiftHours) return today;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { timeZone: timezone, hour12: false });
  const [currentH, currentM] = timeStr.split(':').map(Number);
  const currentDecimal = currentH + currentM / 60;

  const [shiftH, shiftM] = shiftStart.split(':').map(Number);
  const shiftStartDecimal = shiftH + shiftM / 60;
  const shiftEndDecimal = shiftStartDecimal + parseFloat(shiftHours);

  // Only applies when shift crosses midnight and we're in the post-midnight portion
  if (shiftEndDecimal > 24 && currentDecimal < (shiftEndDecimal - 24)) {
    const yesterday = new Date(now.getTime() - 86400000);
    return yesterday.toLocaleDateString('en-CA', { timeZone: timezone });
  }

  return today;
}

/**
 * Enhanced effective work date that also checks for an open attendance session.
 * If the user has an active (not logged-out) session from a previous date, that
 * session's date takes priority — the user's shift is still ongoing.
 *
 * @param {object} db          - Database pool (mysql2/promise)
 * @param {number} userId      - User ID
 * @param {string} timezone    - IANA timezone
 * @param {string} shiftStart  - HH:MM:SS
 * @param {number} shiftHours  - Duration in hours
 * @returns {Promise<string>}  - YYYY-MM-DD
 */
async function getEffectiveWorkDateWithSession(db, userId, timezone, shiftStart, shiftHours) {
  const shiftDate = getEffectiveWorkDate(timezone, shiftStart, shiftHours);

  // Check if there's an open attendance session from a date earlier than shiftDate
  const [[openSession]] = await db.query(
    `SELECT date FROM attendance_logs
     WHERE user_id = ? AND logout_time IS NULL AND date < ?
     ORDER BY date DESC LIMIT 1`,
    [userId, shiftDate]
  );

  if (openSession) {
    const sessionDate = openSession.date instanceof Date
      ? openSession.date.toISOString().split('T')[0]
      : String(openSession.date).split('T')[0];
    return sessionDate;
  }

  return shiftDate;
}

function getDayOfWeek(timezone = 'UTC') {
  return new Date().toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long' });
}

/**
 * Get UTC offset in minutes for a given IANA timezone.
 * Uses Intl API (DST-aware) as primary, with hardcoded fallback for
 * non-DST timezones only when Intl is unavailable.
 */
function getTimezoneOffsetMinutes(timezone) {
  if (timezone === 'UTC') return 0;

  // Primary: Intl API — correctly handles DST transitions
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone: timezone });
    return Math.round((new Date(tzStr) - new Date(utcStr)) / 60000);
  } catch (e) {
    // Intl unavailable — fall back to hardcoded offsets (non-DST zones only)
  }

  const fallbackOffsets = {
    'Asia/Kolkata': 330,
    'Asia/Calcutta': 330,
    'Asia/Dubai': 240,
    'Asia/Singapore': 480,
    'Asia/Tokyo': 540,
  };
  if (fallbackOffsets.hasOwnProperty(timezone)) return fallbackOffsets[timezone];

  return 0;
}

function formatTime(date, timezone = 'UTC') {
  if (!date) return null;
  const d = new Date(date);
  const offsetMs = getTimezoneOffsetMinutes(timezone) * 60000;
  const local = new Date(d.getTime() + offsetMs);
  let h = local.getUTCHours();
  const m = local.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + ampm;
}

/**
 * Check if a recurring task is scheduled for a given date.
 * @param {object} task - Task with recurrence_pattern, recurrence_days, recurrence_end_date
 * @param {string} dateStr - YYYY-MM-DD date string
 * @returns {boolean}
 */
function isScheduledForDate(task, dateStr) {
  if (task.type !== 'recurring') return false;

  // Check if recurrence has ended
  if (task.recurrence_end_date) {
    const endDate = new Date(task.recurrence_end_date);
    const checkDate = new Date(dateStr);
    if (checkDate > endDate) return false;
  }

  const pattern = task.recurrence_pattern;
  if (!pattern) return false;

  if (pattern === 'daily') {
    return true;
  }

  if (pattern === 'weekly') {
    if (!task.recurrence_days) return true; // no days specified = every day
    const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay(); // 0=Sun, 1=Mon...6=Sat
    const scheduledDays = task.recurrence_days.split(',').map(d => parseInt(d.trim(), 10));
    return scheduledDays.includes(dayOfWeek);
  }

  if (pattern === 'monthly') {
    if (!task.recurrence_days) return false;
    const dayOfMonth = new Date(dateStr + 'T12:00:00').getDate();
    const scheduledDates = task.recurrence_days.split(',').map(d => parseInt(d.trim(), 10));
    return scheduledDates.includes(dayOfMonth);
  }

  return false;
}

/**
 * Convert IANA timezone to MySQL offset string (e.g. '+05:30')
 */
function getTimezoneOffsetString(timezone) {
  const mins = getTimezoneOffsetMinutes(timezone);
  const sign = mins >= 0 ? '+' : '-';
  const absMins = Math.abs(mins);
  const h = Math.floor(absMins / 60);
  const m = absMins % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

module.exports = { getNow, getToday, getUTCNow, getEffectiveWorkDate, getEffectiveWorkDateWithSession, getDayOfWeek, formatTime, getTimezoneOffsetMinutes, getTimezoneOffsetString, isScheduledForDate };
