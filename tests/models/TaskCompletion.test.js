jest.mock('../../config/db', () => ({
  query:  jest.fn(),
  escape: jest.fn(v => `'${String(v)}'`),
}));

const db             = require('../../config/db');
const TaskCompletion = require('../../models/TaskCompletion');

// ── logCompletion ─────────────────────────────────────────────────────────────

describe('TaskCompletion.logCompletion', () => {
  test('returns insertId when a new row is created', async () => {
    db.query.mockResolvedValue([{ insertId: 77, affectedRows: 1 }]);

    const result = await TaskCompletion.logCompletion(1, 2, '2024-06-10');

    expect(result).toBe(77);
  });

  test('returns true when ON DUPLICATE KEY UPDATE fires (insertId is 0)', async () => {
    db.query.mockResolvedValue([{ insertId: 0, affectedRows: 2 }]);

    const result = await TaskCompletion.logCompletion(1, 2, '2024-06-10');

    expect(result).toBe(true);
  });

  test('uses ON DUPLICATE KEY UPDATE in the SQL', async () => {
    db.query.mockResolvedValue([{ insertId: 1, affectedRows: 1 }]);

    await TaskCompletion.logCompletion(1, 2, '2024-06-10', 'Done!');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ON DUPLICATE KEY UPDATE');
  });

  test('passes notes as a parameterised value', async () => {
    db.query.mockResolvedValue([{ insertId: 1, affectedRows: 1 }]);

    await TaskCompletion.logCompletion(1, 2, '2024-06-10', 'My notes');

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBe('My notes');
  });

  test('passes null for notes when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1, affectedRows: 1 }]);

    await TaskCompletion.logCompletion(1, 2, '2024-06-10');

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBeNull();
  });
});

// ── startSession ──────────────────────────────────────────────────────────────

describe('TaskCompletion.startSession', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 55 }]);

    const id = await TaskCompletion.startSession(1, 2, '2024-06-10');

    expect(id).toBe(55);
  });

  test('inserts with started_at = NOW() (no completed_at)', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await TaskCompletion.startSession(1, 2, '2024-06-10');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('started_at');
    expect(sql).not.toContain('completed_at');
  });

  test('passes taskId, userId, date as params', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await TaskCompletion.startSession(10, 20, '2024-07-01');

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([10, 20, '2024-07-01']);
  });
});

// ── completeSession ───────────────────────────────────────────────────────────

describe('TaskCompletion.completeSession', () => {
  test('returns true when a started session is completed', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await TaskCompletion.completeSession(1, 2, '2024-06-10');

    expect(result).toBe(true);
  });

  test('returns false when no matching session found', async () => {
    db.query.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await TaskCompletion.completeSession(1, 2, '2024-06-10');

    expect(result).toBe(false);
  });

  test('only updates rows with started_at IS NOT NULL AND completed_at IS NULL', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await TaskCompletion.completeSession(1, 2, '2024-06-10');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('started_at IS NOT NULL');
    expect(sql).toContain('completed_at IS NULL');
  });

  test('calculates duration_minutes using TIMESTAMPDIFF', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await TaskCompletion.completeSession(1, 2, '2024-06-10');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('TIMESTAMPDIFF(MINUTE');
  });
});

// ── getTodaySession ───────────────────────────────────────────────────────────

describe('TaskCompletion.getTodaySession', () => {
  test('returns the session row when found', async () => {
    const row = { id: 5, started_at: '2024-06-10T08:00:00', completed_at: null, duration_minutes: null };
    db.query.mockResolvedValue([[row]]);

    const result = await TaskCompletion.getTodaySession(1, 2, '2024-06-10');

    expect(result).toEqual(row);
  });

  test('returns null when no session exists', async () => {
    db.query.mockResolvedValue([[undefined]]);

    const result = await TaskCompletion.getTodaySession(1, 2, '2024-06-10');

    expect(result).toBeNull();
  });
});

// ── undoCompletion ────────────────────────────────────────────────────────────

describe('TaskCompletion.undoCompletion', () => {
  test('returns true when the row is deleted', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await TaskCompletion.undoCompletion(1, 2, '2024-06-10');

    expect(result).toBe(true);
  });

  test('returns false when no row is found', async () => {
    db.query.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await TaskCompletion.undoCompletion(1, 2, '2024-06-10');

    expect(result).toBe(false);
  });

  test('issues a DELETE query', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await TaskCompletion.undoCompletion(1, 2, '2024-06-10');

    const [sql] = db.query.mock.calls[0];
    expect(sql.trim().toUpperCase()).toMatch(/^DELETE/);
  });
});

// ── isCompletedForDate ────────────────────────────────────────────────────────

describe('TaskCompletion.isCompletedForDate', () => {
  test('returns true when a completed record exists', async () => {
    db.query.mockResolvedValue([[{ id: 5 }]]);

    const result = await TaskCompletion.isCompletedForDate(1, 2, '2024-06-10');

    expect(result).toBe(true);
  });

  test('returns false when no record with completed_at exists', async () => {
    db.query.mockResolvedValue([[undefined]]);

    const result = await TaskCompletion.isCompletedForDate(1, 2, '2024-06-10');

    expect(result).toBe(false);
  });

  test('queries with completed_at IS NOT NULL guard', async () => {
    db.query.mockResolvedValue([[undefined]]);

    await TaskCompletion.isCompletedForDate(1, 2, '2024-06-10');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('completed_at IS NOT NULL');
  });
});

// ── isStartedToday ────────────────────────────────────────────────────────────

describe('TaskCompletion.isStartedToday', () => {
  test('returns true when session is in started-but-not-completed state', async () => {
    db.query.mockResolvedValue([[{ id: 3 }]]);

    const result = await TaskCompletion.isStartedToday(1, 2, '2024-06-10');

    expect(result).toBe(true);
  });

  test('returns false when no matching open session exists', async () => {
    db.query.mockResolvedValue([[undefined]]);

    const result = await TaskCompletion.isStartedToday(1, 2, '2024-06-10');

    expect(result).toBe(false);
  });

  test('requires started_at IS NOT NULL and completed_at IS NULL', async () => {
    db.query.mockResolvedValue([[undefined]]);

    await TaskCompletion.isStartedToday(1, 2, '2024-06-10');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('started_at IS NOT NULL');
    expect(sql).toContain('completed_at IS NULL');
  });
});

// ── getCompletionsForUser ─────────────────────────────────────────────────────

describe('TaskCompletion.getCompletionsForUser', () => {
  test('returns completion rows with task info', async () => {
    const rows = [{ id: 1, task_id: 5, title: 'Deploy', type: 'recurring' }];
    db.query.mockResolvedValue([rows]);

    const result = await TaskCompletion.getCompletionsForUser(2, '2024-06-01', '2024-06-30');

    expect(result).toEqual(rows);
  });

  test('filters by userId and date range', async () => {
    db.query.mockResolvedValue([[]]);

    await TaskCompletion.getCompletionsForUser(7, '2024-06-01', '2024-06-30');

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(7);
    expect(params[1]).toBe('2024-06-01');
    expect(params[2]).toBe('2024-06-30');
  });

  test('orders by completion_date DESC', async () => {
    db.query.mockResolvedValue([[]]);

    await TaskCompletion.getCompletionsForUser(2, '2024-06-01', '2024-06-30');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY tc.completion_date DESC');
  });
});

// ── getCompletionsForTask ─────────────────────────────────────────────────────

describe('TaskCompletion.getCompletionsForTask', () => {
  test('returns only rows with completed_at IS NOT NULL', async () => {
    db.query.mockResolvedValue([[]]);

    await TaskCompletion.getCompletionsForTask(5, '2024-06-01', '2024-06-30');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('completed_at IS NOT NULL');
  });

  test('filters by taskId and date range', async () => {
    db.query.mockResolvedValue([[]]);

    await TaskCompletion.getCompletionsForTask(10, '2024-06-01', '2024-06-30');

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(10);
    expect(params[1]).toBe('2024-06-01');
    expect(params[2]).toBe('2024-06-30');
  });
});

// ── countByPeriod ─────────────────────────────────────────────────────────────

describe('TaskCompletion.countByPeriod', () => {
  test('returns the stats object', async () => {
    const stats = { total: 10, completed_today: 2, completed_this_week: 5 };
    db.query.mockResolvedValue([[stats]]);

    const result = await TaskCompletion.countByPeriod();

    expect(result).toEqual(stats);
  });

  test('uses CURDATE() when todayDate is not provided', async () => {
    db.query.mockResolvedValue([[{ total: 0 }]]);

    await TaskCompletion.countByPeriod();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('CURDATE()');
  });

  test('calls db.escape with todayDate when provided', async () => {
    db.query.mockResolvedValue([[{ total: 0 }]]);

    await TaskCompletion.countByPeriod(null, '2024-06-10');

    expect(db.escape).toHaveBeenCalledWith('2024-06-10');
  });

  test('injects user filter when userId is provided', async () => {
    db.query.mockResolvedValue([[{ total: 0 }]]);

    await TaskCompletion.countByPeriod(5);

    expect(db.escape).toHaveBeenCalledWith(5);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('tc.user_id');
  });

  test('does not inject user filter when userId is null', async () => {
    db.query.mockResolvedValue([[{ total: 0 }]]);

    await TaskCompletion.countByPeriod(null);

    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain('tc.user_id');
  });
});
