jest.mock('../../../config/db', () => ({ query: jest.fn() }));

const db            = require('../../../config/db');
const CalendarEvent = require('../../../portal/models/CalendarEvent');

// ── create ────────────────────────────────────────────────────────────────────

describe('CalendarEvent.create', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 20 }]);

    const id = await CalendarEvent.create({
      user_id: 5, event_date: '2024-07-04', title: 'Holiday',
    });

    expect(id).toBe(20);
  });

  test('defaults color to "blue" when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await CalendarEvent.create({ user_id: 5, event_date: '2024-07-04', title: 'Day off' });

    const [, params] = db.query.mock.calls[0];
    expect(params[4]).toBe('blue'); // color
  });

  test('stores null for description when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await CalendarEvent.create({ user_id: 5, event_date: '2024-07-04', title: 'Meeting' });

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBeNull(); // description
  });

  test('uses provided color and description', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await CalendarEvent.create({
      user_id: 5, event_date: '2024-07-04', title: 'Event', description: 'Details', color: 'red',
    });

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBe('Details');
    expect(params[4]).toBe('red');
  });
});

// ── findById ──────────────────────────────────────────────────────────────────

describe('CalendarEvent.findById', () => {
  test('returns the event when found', async () => {
    const row = { id: 3, title: 'Holiday' };
    db.query.mockResolvedValue([[row]]);

    const result = await CalendarEvent.findById(3);

    expect(result).toEqual(row);
  });

  test('returns null when no row matches', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await CalendarEvent.findById(999);

    expect(result).toBeNull();
  });
});

// ── toggleDone ────────────────────────────────────────────────────────────────

describe('CalendarEvent.toggleDone', () => {
  test('issues UPDATE with NOT is_done', async () => {
    db.query.mockResolvedValue([{}]);

    await CalendarEvent.toggleDone(7);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('is_done = NOT is_done');
    expect(params).toEqual([7]);
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('CalendarEvent.update', () => {
  test('returns undefined (no-op) when no allowed fields are given', async () => {
    const result = await CalendarEvent.update(1, { hacker: 'x' });

    expect(result).toBeUndefined();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns undefined when fields object is empty', async () => {
    const result = await CalendarEvent.update(1, {});

    expect(result).toBeUndefined();
  });

  test('updates only allowed fields (title, description, event_date, color, is_done)', async () => {
    db.query.mockResolvedValue([{}]);

    await CalendarEvent.update(1, { title: 'New Title', hacker: 'x' });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('title = ?');
    expect(sql).not.toContain('hacker');
  });

  test('appends id as the last WHERE param', async () => {
    db.query.mockResolvedValue([{}]);

    await CalendarEvent.update(99, { color: 'green' });

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(99);
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe('CalendarEvent.delete', () => {
  test('issues a hard DELETE by id', async () => {
    db.query.mockResolvedValue([{}]);

    await CalendarEvent.delete(5);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql.trim().toUpperCase()).toMatch(/^DELETE/);
    expect(params).toEqual([5]);
  });
});

// ── getForYear ────────────────────────────────────────────────────────────────

describe('CalendarEvent.getForYear', () => {
  test('returns events for the given user and year', async () => {
    const rows = [{ id: 1, title: 'Holiday', event_date: '2024-07-04' }];
    db.query.mockResolvedValue([rows]);

    const result = await CalendarEvent.getForYear(5, 2024);

    expect(result).toEqual(rows);
  });

  test('filters by user_id and YEAR(event_date)', async () => {
    db.query.mockResolvedValue([[]]);

    await CalendarEvent.getForYear(7, 2025);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('YEAR(event_date) = ?');
    expect(params).toEqual([7, 2025]);
  });

  test('orders by event_date ASC', async () => {
    db.query.mockResolvedValue([[]]);

    await CalendarEvent.getForYear(5, 2024);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY event_date ASC');
  });
});

// ── getForDate ────────────────────────────────────────────────────────────────

describe('CalendarEvent.getForDate', () => {
  test('returns events for the exact date', async () => {
    const rows = [{ id: 1, title: 'Meeting' }];
    db.query.mockResolvedValue([rows]);

    const result = await CalendarEvent.getForDate(5, '2024-07-04');

    expect(result).toEqual(rows);
  });

  test('filters by user_id and event_date', async () => {
    db.query.mockResolvedValue([[]]);

    await CalendarEvent.getForDate(7, '2024-08-15');

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([7, '2024-08-15']);
  });
});

// ── getDatesWithEvents ────────────────────────────────────────────────────────

describe('CalendarEvent.getDatesWithEvents', () => {
  test('returns an array of date strings', async () => {
    db.query.mockResolvedValue([[
      { event_date: '2024-07-04' },
      { event_date: '2024-07-10' },
    ]]);

    const result = await CalendarEvent.getDatesWithEvents(5, 2024);

    expect(result).toEqual(['2024-07-04', '2024-07-10']);
  });

  test('returns empty array when no events exist', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await CalendarEvent.getDatesWithEvents(5, 2024);

    expect(result).toEqual([]);
  });

  test('strips time component from ISO date strings', async () => {
    db.query.mockResolvedValue([[{ event_date: '2024-07-04T00:00:00.000Z' }]]);

    const result = await CalendarEvent.getDatesWithEvents(5, 2024);

    expect(result[0]).toBe('2024-07-04');
  });
});

// ── getYearData ───────────────────────────────────────────────────────────────

describe('CalendarEvent.getYearData', () => {
  test('returns a dateMap with events, reminders, and tasks', async () => {
    // events (getForYear)
    db.query.mockResolvedValueOnce([[{ event_date: '2024-07-04', title: 'Holiday' }]]);
    // reminders
    db.query.mockResolvedValueOnce([[{ remind_at: '2024-07-05T10:00:00.000Z', title: 'Call' }]]);
    // tasks (non-admin)
    db.query.mockResolvedValueOnce([[{ due_date: '2024-07-06', title: 'Deploy' }]]);

    const result = await CalendarEvent.getYearData(5, 2024, 'CLIENT_USER');

    expect(result['2024-07-04'].events).toHaveLength(1);
    expect(result['2024-07-05'].reminders).toHaveLength(1);
    expect(result['2024-07-06'].tasks).toHaveLength(1);
  });

  test('admin role queries tasks without user filter', async () => {
    db.query
      .mockResolvedValueOnce([[]])  // events
      .mockResolvedValueOnce([[]])  // reminders
      .mockResolvedValueOnce([[]]); // tasks

    await CalendarEvent.getYearData(5, 2024, 'CLIENT_ADMIN');

    const [adminTaskSql] = db.query.mock.calls[2];
    expect(adminTaskSql).not.toContain('assigned_to = ?');
    expect(adminTaskSql).not.toContain('assigned_by = ?');
  });

  test('non-admin role scopes tasks to assigned_to or assigned_by', async () => {
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]); // tasks (user-scoped)

    await CalendarEvent.getYearData(5, 2024, 'CLIENT_USER');

    const [userTaskSql] = db.query.mock.calls[2];
    expect(userTaskSql).toContain('assigned_to = ?');
    expect(userTaskSql).toContain('assigned_by = ?');
  });

  test('CLIENT_TOP_MGMT is treated as admin', async () => {
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]); // tasks

    await CalendarEvent.getYearData(5, 2024, 'CLIENT_TOP_MGMT');

    const [taskSql] = db.query.mock.calls[2];
    expect(taskSql).not.toContain('assigned_to = ?');
  });

  test('returns empty dateMap when no data exists', async () => {
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const result = await CalendarEvent.getYearData(5, 2024, 'CLIENT_USER');

    expect(result).toEqual({});
  });
});
