jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db          = require('../../config/db');
const RewardModel = require('../../models/Reward');

// ── create ────────────────────────────────────────────────────────────────────

describe('RewardModel.create', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 42 }]);

    const id = await RewardModel.create(5, 10, 100);

    expect(id).toBe(42);
  });

  test('passes userId, taskId and amount as parameterised values', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await RewardModel.create(5, 10, 250);

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([5, 10, 250]);
  });

  test('inserts with status "pending"', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await RewardModel.create(5, 10, 100);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("'pending'");
  });

  test('uses ON DUPLICATE KEY UPDATE to prevent duplicate entries', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await RewardModel.create(5, 10, 100);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ON DUPLICATE KEY UPDATE');
  });
});

// ── markPaid ──────────────────────────────────────────────────────────────────

describe('RewardModel.markPaid', () => {
  test('returns true when a pending reward is marked paid', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await RewardModel.markPaid(7, 10); // id=7, paidBy=10

    expect(result).toBe(true);
  });

  test('returns false when no row is updated (already paid or not found)', async () => {
    db.query.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await RewardModel.markPaid(99, 10);

    expect(result).toBe(false);
  });

  test('only marks status="pending" rows (prevents double-pay)', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await RewardModel.markPaid(7, 10);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("status = 'pending'");
  });

  test('records the paid_by user id', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await RewardModel.markPaid(7, 15); // paidBy = 15

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(15); // paidBy is first param
    expect(params[1]).toBe(7);  // id is second
  });
});

// ── getUserSummary ────────────────────────────────────────────────────────────

describe('RewardModel.getUserSummary', () => {
  test('returns the summary object for a user', async () => {
    const summary = { total_earned: 500, pending_amount: 100, paid_amount: 400, total_entries: 5, pending_count: 1, paid_count: 4 };
    db.query.mockResolvedValue([[summary]]);

    const result = await RewardModel.getUserSummary(5);

    expect(result).toEqual(summary);
  });

  test('filters by user_id', async () => {
    db.query.mockResolvedValue([[{ total_earned: 0 }]]);

    await RewardModel.getUserSummary(7);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('WHERE user_id = ?');
    expect(params).toEqual([7]);
  });
});

// ── getAll ────────────────────────────────────────────────────────────────────

describe('RewardModel.getAll', () => {
  function setupPaginatedMock(rows = [], total = 0) {
    db.query
      .mockResolvedValueOnce([rows])
      .mockResolvedValueOnce([[{ total }]]);
  }

  test('returns rows and total with no filters', async () => {
    setupPaginatedMock([{ id: 1 }, { id: 2 }], 2);

    const result = await RewardModel.getAll();

    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  test('applies user_id filter when provided', async () => {
    setupPaginatedMock();

    await RewardModel.getAll({ user_id: 5 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('rl.user_id = ?');
    expect(params).toContain(5);
  });

  test('applies status filter when provided', async () => {
    setupPaginatedMock();

    await RewardModel.getAll({ status: 'pending' });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('rl.status = ?');
    expect(params).toContain('pending');
  });

  test('applies both user_id and status filters together', async () => {
    setupPaginatedMock();

    await RewardModel.getAll({ user_id: 3, status: 'paid' });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('rl.user_id = ?');
    expect(sql).toContain('rl.status = ?');
    expect(params).toContain(3);
    expect(params).toContain('paid');
  });

  test('calculates correct OFFSET for page 3 with limit 10', async () => {
    setupPaginatedMock();

    await RewardModel.getAll({ page: 3, limit: 10 });

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 2]).toBe(10); // LIMIT
    expect(params[params.length - 1]).toBe(20); // OFFSET = (3-1)*10
  });

  test('joins users and tasks in the query', async () => {
    setupPaginatedMock();

    await RewardModel.getAll();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('JOIN users u ON rl.user_id');
    expect(sql).toContain('JOIN tasks t ON rl.task_id');
  });
});

// ── getGlobalSummary ──────────────────────────────────────────────────────────

describe('RewardModel.getGlobalSummary', () => {
  test('returns the global totals object', async () => {
    const summary = { total: 10000, pending: 3000, paid: 7000 };
    db.query.mockResolvedValue([[summary]]);

    const result = await RewardModel.getGlobalSummary();

    expect(result).toEqual(summary);
  });

  test('queries across all users (no WHERE clause)', async () => {
    db.query.mockResolvedValue([[{ total: 0, pending: 0, paid: 0 }]]);

    await RewardModel.getGlobalSummary();

    const [sql] = db.query.mock.calls[0];
    expect(sql.toUpperCase()).not.toContain('WHERE');
  });
});

// ── getPerUserSummary ─────────────────────────────────────────────────────────

describe('RewardModel.getPerUserSummary', () => {
  test('returns per-user reward rows', async () => {
    const rows = [
      { id: 1, name: 'Alice', total_earned: 500, pending: 100, paid: 400 },
      { id: 2, name: 'Bob',   total_earned: 200, pending: 200, paid: 0 },
    ];
    db.query.mockResolvedValue([rows]);

    const result = await RewardModel.getPerUserSummary();

    expect(result).toEqual(rows);
  });

  test('only includes active users', async () => {
    db.query.mockResolvedValue([[]]);

    await RewardModel.getPerUserSummary();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('u.is_active = 1');
  });

  test('orders by total_earned DESC', async () => {
    db.query.mockResolvedValue([[]]);

    await RewardModel.getPerUserSummary();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY total_earned DESC');
  });
});
