/**
 * Timezone utility — get current date/time in a specific IANA timezone.
 * Node.js has built-in Intl/timezone support, no external packages needed.
 */

function getNow(timezone = 'UTC') {
  const now = new Date();
  const str = now.toLocaleString('en-CA', { timeZone: timezone, hour12: false });
  // en-CA gives YYYY-MM-DD, HH:MM:SS format
  return new Date(str.replace(',', ''));
}

function getToday(timezone = 'UTC') {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
  // en-CA returns YYYY-MM-DD
}

function getDayOfWeek(timezone = 'UTC') {
  return new Date().toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long' });
}

function formatTime(date, timezone = 'UTC') {
  if (!date) return null;
  return new Date(date).toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
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
