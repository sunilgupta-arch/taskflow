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

function getDayOfWeek(timezone = 'UTC') {
  return new Date().toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long' });
}

/**
 * Get UTC offset in minutes for common IANA timezones.
 * Avoids reliance on full ICU support in Node.js.
 */
function getTimezoneOffsetMinutes(timezone) {
  const offsets = {
    'UTC': 0,
    'Asia/Kolkata': 330,
    'Asia/Calcutta': 330,
    'America/New_York': -300,
    'America/Chicago': -360,
    'America/Denver': -420,
    'America/Los_Angeles': -480,
    'Europe/London': 0,
    'Europe/Berlin': 60,
    'Europe/Paris': 60,
    'Asia/Dubai': 240,
    'Asia/Singapore': 480,
    'Asia/Tokyo': 540,
    'Australia/Sydney': 660,
  };
  if (offsets.hasOwnProperty(timezone)) return offsets[timezone];
  // Fallback: try Intl (works if full ICU is available)
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone: timezone });
    return Math.round((new Date(tzStr) - new Date(utcStr)) / 60000);
  } catch (e) {
    return 0;
  }
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

module.exports = { getNow, getToday, getDayOfWeek, formatTime, isScheduledForDate };
