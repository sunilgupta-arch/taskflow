jest.mock('../../config/db', () => ({
  query: jest.fn(),
}));

const db        = require('../../config/db');
const TaskModel = require('../../models/Task');

// ─── findById ─────────────────────────────────────────────────────────────────

describe('TaskModel.findById', () => {
  test('returns the task row when found', async () => {
    const task = { id: 1, title: 'My Task', is_deleted: 0 };
    db.query.mockResolvedValue([[task]]);

    const result = await TaskModel.findById(1);

    expect(result).toEqual(task);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE t.id = ?'), [1]);
  });

  test('returns null when no rows match', async () => {
    db.query.mockResolvedValue([[]]); // empty result set

    const result = await TaskModel.findById(999);

    expect(result).toBeNull();
  });

  test('passes id into parameterised query (no SQL injection)', async () => {
    db.query.mockResolvedValue([[{ id: 7 }]]);
    await TaskModel.findById(7);

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([7]);
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('TaskModel.create', () => {
  const minData = {
    title: 'Test Task',
    description: 'Desc',
    type: 'once',
    created_by: 10,
    created_by_org: 'LOCAL',
  };

  test('returns the insertId from the DB result', async () => {
    db.query.mockResolvedValue([{ insertId: 42 }]);

    const id = await TaskModel.create(minData);

    expect(id).toBe(42);
  });

  test('uses "pending" as default status when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);
    await TaskModel.create(minData);

    const [, params] = db.query.mock.calls[0];
    // status is the 16th positional param (index 15)
    expect(params[15]).toBe('pending');
  });

  test('uses "medium" as default priority when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);
    await TaskModel.create(minData);

    const [, params] = db.query.mock.calls[0];
    // priority is the 17th positional param (index 16)
    expect(params[16]).toBe('medium');
  });

  test('passes explicit status and priority through correctly', async () => {
    db.query.mockResolvedValue([{ insertId: 2 }]);
    await TaskModel.create({ ...minData, status: 'active', priority: 'high' });

    const [, params] = db.query.mock.calls[0];
    expect(params[15]).toBe('active');
    expect(params[16]).toBe('high');
  });

  test('stores null for optional fields when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 3 }]);
    await TaskModel.create(minData);

    const [, params] = db.query.mock.calls[0];
    // recurrence_pattern (index 3), assigned_to (index 7), reward_amount (index 14)
    expect(params[3]).toBeNull();  // recurrence_pattern
    expect(params[7]).toBeNull();  // assigned_to
    expect(params[14]).toBeNull(); // reward_amount
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('TaskModel.update', () => {
  test('returns false immediately when no allowed fields are provided', async () => {
    const result = await TaskModel.update(1, { hacker_field: 'evil' });

    expect(result).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns false when data object is empty', async () => {
    const result = await TaskModel.update(1, {});

    expect(result).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('builds SET clause only from allowed fields', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await TaskModel.update(1, { status: 'completed', hacker_field: 'evil' });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('status = ?');
    expect(sql).not.toContain('hacker_field');
  });

  test('excludes injected values for non-allowed fields from params', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await TaskModel.update(1, { status: 'completed', hacker_field: 'evil' });

    const [, params] = db.query.mock.calls[0];
    expect(params).not.toContain('evil');
  });

  test('returns true when at least one row was updated', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await TaskModel.update(1, { status: 'in_progress' });

    expect(result).toBe(true);
  });

  test('returns false when no rows were affected', async () => {
    db.query.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await TaskModel.update(999, { status: 'in_progress' });

    expect(result).toBe(false);
  });

  test('can update multiple allowed fields in one call', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await TaskModel.update(5, { status: 'completed', assigned_to: 7, priority: 'high' });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('status = ?');
    expect(sql).toContain('assigned_to = ?');
    expect(sql).toContain('priority = ?');
    expect(params).toContain('completed');
    expect(params).toContain(7);
    expect(params).toContain('high');
    // Last param must be the id
    expect(params[params.length - 1]).toBe(5);
  });

  test('appends the row id as the last WHERE param', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await TaskModel.update(42, { status: 'pending' });

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(42);
  });
});

// ─── softDelete ───────────────────────────────────────────────────────────────

describe('TaskModel.softDelete', () => {
  test('returns true when the row is found and marked deleted', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await TaskModel.softDelete(1);

    expect(result).toBe(true);
  });

  test('returns false when no row matched the id', async () => {
    db.query.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await TaskModel.softDelete(999);

    expect(result).toBe(false);
  });

  test('sets is_deleted = 1 (not a hard DELETE)', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await TaskModel.softDelete(3);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('is_deleted = 1');
    expect(sql.toUpperCase()).not.toMatch(/^\s*DELETE\s/);
  });

  test('passes task id as parameter (parameterised query)', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await TaskModel.softDelete(7);

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([7]);
  });
});
