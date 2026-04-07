/**
 * Timezone utility — all times use America/New_York (Eastern Time).
 * No timezone conversions needed. MySQL session timezone is set to ET,
 * so NOW() and all TIMESTAMP columns are in ET natively.
 */

const TZ = 'America/New_York';

function getNow(timezone = TZ) {
  const now = new Date();
  const str = now.toLocaleString('en-CA', { timeZone: timezone, hour12: false });
  const [datePart, timePart] = str.replace(',', '').trim().split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = (timePart || '00:00:00').split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function getToday(timezone = TZ) {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
}

function getDayOfWeek(timezone = TZ) {
  return new Date().toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long' });
}

/**
 * Get the effective "working day" date for a user, accounting for night shifts.
 */
function getEffectiveWorkDate(timezone, shiftStart, shiftHours) {
  timezone = timezone || TZ;
  const today = getToday(timezone);
  if (!shiftStart || !shiftHours) return today;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { timeZone: timezone, hour12: false });
  const [currentH, currentM] = timeStr.split(':').map(Number);
  const currentDecimal = currentH + currentM / 60;

  const [shiftH, shiftM] = shiftStart.split(':').map(Number);
  const shiftStartDecimal = shiftH + shiftM / 60;
  const shiftEndDecimal = shiftStartDecimal + parseFloat(shiftHours);

  if (shiftEndDecimal > 24 && currentDecimal < (shiftEndDecimal - 24)) {
    const yesterday = new Date(now.getTime() - 86400000);
    return yesterday.toLocaleDateString('en-CA', { timeZone: timezone });
  }

  return today;
}

/**
 * Enhanced effective work date that also checks for an open attendance session.
 */
async function getEffectiveWorkDateWithSession(db, userId, timezone, shiftStart, shiftHours) {
  const shiftDate = getEffectiveWorkDate(timezone, shiftStart, shiftHours);

  const yesterday = new Date(new Date(shiftDate + 'T12:00:00').getTime() - 86400000)
    .toISOString().split('T')[0];

  const [[openSession]] = await db.query(
    `SELECT date FROM attendance_logs
     WHERE user_id = ? AND logout_time IS NULL AND date = ?
     LIMIT 1`,
    [userId, yesterday]
  );

  if (openSession) {
    const sessionDate = openSession.date instanceof Date
      ? openSession.date.toISOString().split('T')[0]
      : String(openSession.date).split('T')[0];
    return sessionDate;
  }

  return shiftDate;
}

/**
 * Check if a recurring task is scheduled for a given date.
 */
function isScheduledForDate(task, dateStr) {
  if (task.type !== 'recurring') return false;

  if (task.recurrence_end_date) {
    const endDate = new Date(task.recurrence_end_date);
    const checkDate = new Date(dateStr);
    if (checkDate > endDate) return false;
  }

  const pattern = task.recurrence_pattern;
  if (!pattern) return false;

  if (pattern === 'daily') return true;

  if (pattern === 'weekly') {
    if (!task.recurrence_days) return true;
    const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
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

module.exports = { getNow, getToday, getEffectiveWorkDate, getEffectiveWorkDateWithSession, getDayOfWeek, isScheduledForDate };
