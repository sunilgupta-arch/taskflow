jest.mock('../../../config/db', () => ({ query: jest.fn() }));

const db             = require('../../../config/db');
const PortalReminder = require('../../../portal/models/Reminder');

// ── create ────────────────────────────────────────────────────────────────────

describe('PortalReminder.create', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 15 }]);

    const id = await PortalReminder.create({
      user_id: 5, title: 'Call client', note: 'At 3pm', remind_at: '2024-07-01 15:00:00',
    });

    expect(id).toBe(15);
  });

  test('stores null for note when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await PortalReminder.create({ user_id: 5, title: 'Meeting', remind_at: '2024-07-01 10:00:00' });

    const [, params] = db.query.mock.calls[0];
    expect(params[2]).toBeNull(); // note
  });

  test('passes all four values in correct order', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await PortalReminder.create({ user_id: 7, title: 'T', note: 'N', remind_at: '2024-07-01 09:00:00' });

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([7, 'T', 'N', '2024-07-01 09:00:00']);
  });
});

// ── findById ──────────────────────────────────────────────────────────────────

describe('PortalReminder.findById', () => {
  test('returns the reminder when found', async () => {
    const row = { id: 3, title: 'Follow up', is_done: 0 };
    db.query.mockResolvedValue([[row]]);

    const result = await PortalReminder.findById(3);

    expect(result).toEqual(row);
  });

  test('returns null when no row matches', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await PortalReminder.findById(999);

    expect(result).toBeNull();
  });
});

// ── getForUser ────────────────────────────────────────────────────────────────

describe('PortalReminder.getForUser', () => {
  test('filters out done reminders by default (includeDone = false)', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalReminder.getForUser(5);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('is_done = 0');
  });

  test('includes done reminders when includeDone = true', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalReminder.getForUser(5, { includeDone: true });

    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain('is_done = 0');
  });

  test('orders by remind_at ASC', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalReminder.getForUser(5);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY remind_at ASC');
  });

  test('filters by user_id', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalReminder.getForUser(7);

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(7);
  });

  test('returns all reminder rows', async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    db.query.mockResolvedValue([rows]);

    const result = await PortalReminder.getForUser(5, { includeDone: true });

    expect(result).toEqual(rows);
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('PortalReminder.update', () => {
  test('returns undefined (no-op) when no allowed fields are given', async () => {
    const result = await PortalReminder.update(1, { hacker: 'evil' });

    expect(result).toBeUndefined();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns undefined when fields object is empty', async () => {
    const result = await PortalReminder.update(1, {});

    expect(result).toBeUndefined();
  });

  test('updates only allowed fields (title, note, remind_at, is_done, notified)', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalReminder.update(1, { title: 'Updated', hacker: 'evil' });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('title = ?');
    expect(sql).not.toContain('hacker');
  });

  test('appends id as the last WHERE param', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalReminder.update(42, { is_done: 1 });

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(42);
  });

  test('can update notified field', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalReminder.update(1, { notified: 1 });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('notified = ?');
  });
});

// ── toggleDone ────────────────────────────────────────────────────────────────

describe('PortalReminder.toggleDone', () => {
  test('issues UPDATE with NOT is_done', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalReminder.toggleDone(5);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('is_done = NOT is_done');
    expect(params).toEqual([5]);
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe('PortalReminder.delete', () => {
  test('issues a hard DELETE by id', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalReminder.delete(5);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql.trim().toUpperCase()).toMatch(/^DELETE/);
    expect(params).toEqual([5]);
  });
});

// ── getDueReminders ───────────────────────────────────────────────────────────

describe('PortalReminder.getDueReminders', () => {
  test('returns reminders that are due and unnotified', async () => {
    const rows = [{ id: 1, title: 'Call', remind_at: '2024-06-10 09:00:00' }];
    db.query.mockResolvedValue([rows]);

    const result = await PortalReminder.getDueReminders();

    expect(result).toEqual(rows);
  });

  test('filters by is_done = 0, notified = 0, and remind_at <= NOW()', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalReminder.getDueReminders();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('is_done = 0');
    expect(sql).toContain('notified = 0');
    expect(sql).toContain('remind_at <= NOW()');
  });
});

// ── markNotified ──────────────────────────────────────────────────────────────

describe('PortalReminder.markNotified', () => {
  test('sets notified = 1 for the given id', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalReminder.markNotified(7);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('notified = 1');
    expect(params).toEqual([7]);
  });
});
