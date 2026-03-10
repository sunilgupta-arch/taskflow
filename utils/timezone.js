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

module.exports = { getNow, getToday, getDayOfWeek, formatTime };
