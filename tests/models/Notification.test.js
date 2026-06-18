jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db           = require('../../config/db');
const Notification = require('../../models/Notification');

// ── create ────────────────────────────────────────────────────────────────────

describe('Notification.create', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 55 }]);

    const id = await Notification.create(1, 'info', 'Hello', 'body text', '/link', 'task', 10);

    expect(id).toBe(55);
  });

  test('passes all 7 params in correct order', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await Notification.create(5, 'alert', 'Title', 'Body', '/page', 'leave', 99);

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([5, 'alert', 'Title', 'Body', '/page', 'leave', 99]);
  });

  test('accepts null for optional fields (body, link, refType, refId)', async () => {
    db.query.mockResolvedValue([{ insertId: 2 }]);

    await expect(
      Notification.create(5, 'info', 'Title')
    ).resolves.toBe(2);

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBeNull(); // body
    expect(params[4]).toBeNull(); // link
    expect(params[5]).toBeNull(); // refType
    expect(params[6]).toBeNull(); // refId
  });
});

// ── createIfNotExists ─────────────────────────────────────────────────────────

describe('Notification.createIfNotExists', () => {
  test('returns existing notification id when one already exists for that ref', async () => {
    db.query.mockResolvedValueOnce([[{ id: 77 }]]); // existing unread notification

    const id = await Notification.createIfNotExists(5, 'chat', 'Msg', null, null, 'chat', 3);

    expect(id).toBe(77);
    expect(db.query).toHaveBeenCalledTimes(1); // no INSERT
  });

  test('creates a new notification when no existing unread one for that ref', async () => {
    db.query
      .mockResolvedValueOnce([[]])             // no existing
      .mockResolvedValueOnce([{ insertId: 88 }]); // INSERT

    const id = await Notification.createIfNotExists(5, 'chat', 'Msg', null, null, 'chat', 3);

    expect(id).toBe(88);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('skips the existence check and always creates when refType is null', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 99 }]); // only INSERT, no SELECT

    const id = await Notification.createIfNotExists(5, 'info', 'Hi', null, null, null, null);

    expect(id).toBe(99);
    // Only one db call because there's no refType check
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('skips the existence check when refId is null', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 1 }]);

    await Notification.createIfNotExists(5, 'info', 'Hi', null, null, 'task', null);

    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('checks WHERE is_read = 0 (only unread)', async () => {
    db.query.mockResolvedValueOnce([[]]); // no match
    db.query.mockResolvedValueOnce([{ insertId: 1 }]);

    await Notification.createIfNotExists(5, 'info', 'Hi', null, null, 'task', 10);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('is_read = 0');
  });
});

// ── clearByRef ────────────────────────────────────────────────────────────────

describe('Notification.clearByRef', () => {
  test('returns empty array when userIds is empty', async () => {
    const result = await Notification.clearByRef([], 'task', 1);

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns empty array when refType is falsy', async () => {
    const result = await Notification.clearByRef([1, 2], null, 1);

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns empty array when refId is falsy', async () => {
    const result = await Notification.clearByRef([1], 'task', null);

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns empty array and skips UPDATE when no unread notifications found', async () => {
    db.query.mockResolvedValueOnce([[]]); // SELECT returns nothing

    const result = await Notification.clearByRef([1, 2], 'task', 5);

    expect(result).toEqual([]);
    expect(db.query).toHaveBeenCalledTimes(1); // no UPDATE
  });

  test('returns the IDs of notifications that were cleared', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 10 }, { id: 20 }]])  // SELECT
      .mockResolvedValueOnce([{ affectedRows: 2 }]);        // UPDATE

    const result = await Notification.clearByRef([5, 6], 'task', 3);

    expect(result).toEqual([10, 20]);
  });

  test('runs UPDATE after SELECT when notifications are found', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 10 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await Notification.clearByRef([5], 'task', 3);

    expect(db.query).toHaveBeenCalledTimes(2);
    const [updateSql] = db.query.mock.calls[1];
    expect(updateSql).toContain('is_read = 1');
  });

  test('builds correct IN placeholders for multiple users', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await Notification.clearByRef([5, 6, 7], 'task', 3);

    const [selectSql, selectParams] = db.query.mock.calls[0];
    expect(selectSql).toContain('IN (?,?,?)');
    expect(selectParams).toContain(5);
    expect(selectParams).toContain(6);
    expect(selectParams).toContain(7);
  });
});

// ── clearByRefForUser ─────────────────────────────────────────────────────────

describe('Notification.clearByRefForUser', () => {
  test('delegates to clearByRef with a single-element array', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 42 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await Notification.clearByRefForUser(7, 'chat', 3);

    expect(result).toEqual([42]);
    const [, selectParams] = db.query.mock.calls[0];
    expect(selectParams[0]).toBe(7); // userId wrapped in array
  });

  test('returns empty array when refType is missing', async () => {
    const result = await Notification.clearByRefForUser(7, null, 3);

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── getForUser ────────────────────────────────────────────────────────────────

describe('Notification.getForUser', () => {
  test('returns notifications for a user', async () => {
    const rows = [{ id: 1, title: 'Hi', is_read: 0 }, { id: 2, title: 'Done', is_read: 1 }];
    db.query.mockResolvedValue([rows]);

    const result = await Notification.getForUser(5);

    expect(result).toEqual(rows);
  });

  test('orders by created_at DESC', async () => {
    db.query.mockResolvedValue([[]]);

    await Notification.getForUser(5);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at DESC');
  });

  test('uses the provided limit', async () => {
    db.query.mockResolvedValue([[]]);

    await Notification.getForUser(5, 50);

    const [, params] = db.query.mock.calls[0];
    expect(params).toContain(50);
  });

  test('defaults to limit 30 when not specified', async () => {
    db.query.mockResolvedValue([[]]);

    await Notification.getForUser(5);

    const [, params] = db.query.mock.calls[0];
    expect(params).toContain(30);
  });
});

// ── getUnreadCount ────────────────────────────────────────────────────────────

describe('Notification.getUnreadCount', () => {
  test('returns the unread count for a user', async () => {
    db.query.mockResolvedValue([[{ count: 7 }]]);

    const count = await Notification.getUnreadCount(5);

    expect(count).toBe(7);
  });

  test('filters by is_read = 0', async () => {
    db.query.mockResolvedValue([[{ count: 0 }]]);

    await Notification.getUnreadCount(5);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('is_read = 0');
  });
});

// ── markRead ──────────────────────────────────────────────────────────────────

describe('Notification.markRead', () => {
  test('updates the correct notification scoped to the user', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await Notification.markRead(10, 5);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('is_read = 1');
    expect(params).toEqual([10, 5]);
  });
});

// ── markAllRead ───────────────────────────────────────────────────────────────

describe('Notification.markAllRead', () => {
  test('marks all unread notifications as read for the user', async () => {
    db.query.mockResolvedValue([{ affectedRows: 3 }]);

    await Notification.markAllRead(5);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('is_read = 1');
    expect(sql).toContain('is_read = 0'); // only unread ones
    expect(params).toEqual([5]);
  });
});
