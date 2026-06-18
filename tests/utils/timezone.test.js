const { isScheduledForDate, getEffectiveWorkDate } = require('../../utils/timezone');

// ─── isScheduledForDate ───────────────────────────────────────────────────────

describe('isScheduledForDate', () => {
  // 2024-01-15 is a Monday (day index 1)
  const MONDAY    = '2024-01-15';
  // 2024-01-16 is a Tuesday (day index 2)
  const TUESDAY   = '2024-01-16';
  // 2024-01-17 is a Wednesday (day index 3)
  const WEDNESDAY = '2024-01-17';

  describe('non-recurring tasks', () => {
    test('returns false for a one-off task', () => {
      expect(isScheduledForDate({ type: 'once', recurrence_pattern: null }, MONDAY)).toBe(false);
    });
  });

  describe('recurrence_end_date', () => {
    test('returns false when check date is past end date', () => {
      const task = {
        type: 'recurring',
        recurrence_pattern: 'daily',
        recurrence_end_date: '2024-01-10',
        recurrence_days: null,
      };
      expect(isScheduledForDate(task, MONDAY)).toBe(false);
    });

    test('returns true when check date equals end date', () => {
      const task = {
        type: 'recurring',
        recurrence_pattern: 'daily',
        recurrence_end_date: MONDAY,
        recurrence_days: null,
      };
      expect(isScheduledForDate(task, MONDAY)).toBe(true);
    });

    test('returns true when check date is before end date', () => {
      const task = {
        type: 'recurring',
        recurrence_pattern: 'daily',
        recurrence_end_date: '2024-02-01',
        recurrence_days: null,
      };
      expect(isScheduledForDate(task, MONDAY)).toBe(true);
    });
  });

  describe('daily recurrence', () => {
    const dailyTask = { type: 'recurring', recurrence_pattern: 'daily', recurrence_end_date: null, recurrence_days: null };

    test('returns true for any date', () => {
      expect(isScheduledForDate(dailyTask, MONDAY)).toBe(true);
      expect(isScheduledForDate(dailyTask, TUESDAY)).toBe(true);
      expect(isScheduledForDate(dailyTask, WEDNESDAY)).toBe(true);
    });
  });

  describe('weekly recurrence', () => {
    test('returns true when no recurrence_days set (every day of week)', () => {
      const task = { type: 'recurring', recurrence_pattern: 'weekly', recurrence_end_date: null, recurrence_days: null };
      expect(isScheduledForDate(task, MONDAY)).toBe(true);
    });

    test('returns true when day index matches recurrence_days', () => {
      // Monday = day 1
      const task = { type: 'recurring', recurrence_pattern: 'weekly', recurrence_end_date: null, recurrence_days: '1,3' };
      expect(isScheduledForDate(task, MONDAY)).toBe(true);       // day 1
      expect(isScheduledForDate(task, WEDNESDAY)).toBe(true);    // day 3
    });

    test('returns false when day index not in recurrence_days', () => {
      const task = { type: 'recurring', recurrence_pattern: 'weekly', recurrence_end_date: null, recurrence_days: '1,3' };
      expect(isScheduledForDate(task, TUESDAY)).toBe(false);     // day 2, not in [1,3]
    });

    test('handles single day string', () => {
      const task = { type: 'recurring', recurrence_pattern: 'weekly', recurrence_end_date: null, recurrence_days: '2' };
      expect(isScheduledForDate(task, TUESDAY)).toBe(true);
      expect(isScheduledForDate(task, MONDAY)).toBe(false);
    });
  });

  describe('monthly recurrence', () => {
    // 2024-01-15 is the 15th of the month
    test('returns true when day-of-month matches', () => {
      const task = { type: 'recurring', recurrence_pattern: 'monthly', recurrence_end_date: null, recurrence_days: '15,20' };
      expect(isScheduledForDate(task, MONDAY)).toBe(true);  // 15th
    });

    test('returns false when day-of-month not in recurrence_days', () => {
      const task = { type: 'recurring', recurrence_pattern: 'monthly', recurrence_end_date: null, recurrence_days: '10,20' };
      expect(isScheduledForDate(task, MONDAY)).toBe(false); // 15th, not in [10,20]
    });

    test('returns false when recurrence_days is null', () => {
      const task = { type: 'recurring', recurrence_pattern: 'monthly', recurrence_end_date: null, recurrence_days: null };
      expect(isScheduledForDate(task, MONDAY)).toBe(false);
    });
  });

  describe('unknown pattern', () => {
    test('returns false for unrecognised pattern', () => {
      const task = { type: 'recurring', recurrence_pattern: 'fortnightly', recurrence_end_date: null, recurrence_days: null };
      expect(isScheduledForDate(task, MONDAY)).toBe(false);
    });

    test('returns false when pattern is missing entirely', () => {
      const task = { type: 'recurring', recurrence_pattern: null, recurrence_end_date: null, recurrence_days: null };
      expect(isScheduledForDate(task, MONDAY)).toBe(false);
    });
  });
});

// ─── getEffectiveWorkDate ─────────────────────────────────────────────────────

describe('getEffectiveWorkDate', () => {
  // We use fake timers to control "now" so tests are deterministic.
  // Fix time to: 2024-06-10 02:00 ET (06:00 UTC)
  // — which is 2 AM Eastern, falling inside a night-shift that started on June 9.

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns today when no shift info provided', () => {
    // Set time to 10:00 AM ET on June 10 (14:00 UTC)
    jest.setSystemTime(new Date('2024-06-10T14:00:00.000Z'));
    const date = getEffectiveWorkDate('America/New_York', null, null);
    expect(date).toBe('2024-06-10');
  });

  test('returns today for a day shift (not crossing midnight)', () => {
    // 10:00 AM ET — well within a 09:00–17:00 shift
    jest.setSystemTime(new Date('2024-06-10T14:00:00.000Z'));
    const date = getEffectiveWorkDate('America/New_York', '09:00', 8);
    expect(date).toBe('2024-06-10');
  });

  test('returns yesterday when night shift crosses midnight and current time is before shift end', () => {
    // Night shift: 22:00 (10 PM) for 8 hours → ends at 06:00 next day
    // Current time: 02:00 ET on June 10 = still inside the June 9 shift
    // 02:00 ET = 06:00 UTC → use that UTC offset
    jest.setSystemTime(new Date('2024-06-10T06:00:00.000Z')); // 02:00 ET
    const date = getEffectiveWorkDate('America/New_York', '22:00', 8);
    expect(date).toBe('2024-06-09');
  });

  test('returns today when night shift has ended (current time past shift end)', () => {
    // Shift: 22:00 for 8 hrs → ends 06:00. It is now 08:00 ET (past shift end).
    // 08:00 ET = 12:00 UTC
    jest.setSystemTime(new Date('2024-06-10T12:00:00.000Z')); // 08:00 ET
    const date = getEffectiveWorkDate('America/New_York', '22:00', 8);
    expect(date).toBe('2024-06-10');
  });
});
