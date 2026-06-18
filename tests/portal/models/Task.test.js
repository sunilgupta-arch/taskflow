jest.mock('../../../config/db', () => ({ query: jest.fn() }));

const db         = require('../../../config/db');
const PortalTask = require('../../../portal/models/Task');

// ── _buildFilters ─────────────────────────────────────────────────────────────

describe('PortalTask._buildFilters', () => {
  test('adds is_archived = 1 when archived filter is "1"', () => {
    const params = [];
    const where = PortalTask._buildFilters({ archived: '1' }, params);

    expect(where).toContain('t.is_archived = 1');
    expect(where).not.toContain('t.is_archived = 0');
  });

  test('adds is_archived = 0 (default) when archived is not "1"', () => {
    const params = [];
    const where = PortalTask._buildFilters({}, params);

    expect(where).toContain('t.is_archived = 0');
  });

  test('adds status filter when provided', () => {
    const params = [];
    const where = PortalTask._buildFilters({ status: 'in_progress' }, params);

    expect(where).toContain('t.status = ?');
    expect(params).toContain('in_progress');
  });

  test('adds priority filter when provided', () => {
    const params = [];
    const where = PortalTask._buildFilters({ priority: 'high' }, params);

    expect(where).toContain('t.priority = ?');
    expect(params).toContain('high');
  });

  test('adds LIKE search on title, creator.name, and assignee.name when search is given', () => {
    const params = [];
    const where = PortalTask._buildFilters({ search: 'deploy' }, params);

    expect(where).toContain('t.title LIKE ?');
    expect(where).toContain('creator.name LIKE ?');
    expect(where).toContain('assignee.name LIKE ?');
    expect(params.filter(p => p === '%deploy%')).toHaveLength(3);
  });

  test('mutates the params array (does not return a new one)', () => {
    const params = ['existing'];
    PortalTask._buildFilters({ status: 'done' }, params);

    expect(params[0]).toBe('existing');
    expect(params[1]).toBe('done');
  });

  test('can combine status, priority, and search at once', () => {
    const params = [];
    const where = PortalTask._buildFilters({ status: 'open', priority: 'low', search: 'fix' }, params);

    expect(where).toContain('t.status = ?');
    expect(where).toContain('t.priority = ?');
    expect(where).toContain('t.title LIKE ?');
    expect(params).toContain('open');
    expect(params).toContain('low');
  });
});

// ── create ────────────────────────────────────────────────────────────────────

describe('PortalTask.create', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 55 }]);

    const id = await PortalTask.create({ title: 'Deploy', assigned_by: 1, assigned_to: 2 });

    expect(id).toBe(55);
  });

  test('defaults priority to "medium" when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await PortalTask.create({ title: 'Task', assigned_by: 1, assigned_to: 2 });

    const [, params] = db.query.mock.calls[0];
    expect(params[2]).toBe('medium'); // 3rd param is priority
  });

  test('defaults due_date to null when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await PortalTask.create({ title: 'Task', assigned_by: 1, assigned_to: 2 });

    const [, params] = db.query.mock.calls[0];
    expect(params[5]).toBeNull(); // 6th param is due_date
  });

  test('defaults description to null when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await PortalTask.create({ title: 'Task', assigned_by: 1, assigned_to: 2 });

    const [, params] = db.query.mock.calls[0];
    expect(params[1]).toBeNull(); // 2nd param is description
  });

  test('uses provided priority when given', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await PortalTask.create({ title: 'T', assigned_by: 1, assigned_to: 2, priority: 'high' });

    const [, params] = db.query.mock.calls[0];
    expect(params[2]).toBe('high');
  });

  test('inserts into portal_tasks table', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await PortalTask.create({ title: 'T', assigned_by: 1, assigned_to: 2 });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('portal_tasks');
  });
});

// ── getById ───────────────────────────────────────────────────────────────────

describe('PortalTask.getById', () => {
  test('returns the task when found', async () => {
    const task = { id: 5, title: 'Deploy', assigned_by_name: 'Alice', assigned_to_name: 'Bob' };
    db.query.mockResolvedValue([[task]]);

    const result = await PortalTask.getById(5);

    expect(result).toEqual(task);
  });

  test('returns null when no task matches', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await PortalTask.getById(999);

    expect(result).toBeNull();
  });

  test('joins users and roles for creator and assignee', async () => {
    db.query.mockResolvedValue([[{ id: 1 }]]);

    await PortalTask.getById(1);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('JOIN users creator');
    expect(sql).toContain('JOIN users assignee');
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('PortalTask.update', () => {
  test('returns undefined (no-op) when no allowed fields are given', async () => {
    const result = await PortalTask.update(1, { hacker: 'evil' });

    expect(result).toBeUndefined();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns undefined when fields object is empty', async () => {
    const result = await PortalTask.update(1, {});

    expect(result).toBeUndefined();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('updates only allowed fields (title, description, priority, status, assigned_to, due_date)', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await PortalTask.update(1, { title: 'New Title', hacker: 'evil' });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('title = ?');
    expect(sql).not.toContain('hacker');
  });

  test('appends taskId as the last WHERE param', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalTask.update(42, { status: 'done' });

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(42);
  });

  test('can update multiple allowed fields at once', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalTask.update(1, { title: 'T', priority: 'high', status: 'in_progress' });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('title = ?');
    expect(sql).toContain('priority = ?');
    expect(sql).toContain('status = ?');
  });
});

// ── canAccess ─────────────────────────────────────────────────────────────────

describe('PortalTask.canAccess', () => {
  test('returns true immediately for CLIENT_ADMIN without hitting the DB', async () => {
    const result = await PortalTask.canAccess(5, 10, 'CLIENT_ADMIN');

    expect(result).toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns true immediately for CLIENT_TOP_MGMT without hitting the DB', async () => {
    const result = await PortalTask.canAccess(5, 10, 'CLIENT_TOP_MGMT');

    expect(result).toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns true when user is a creator or assignee of the task', async () => {
    db.query.mockResolvedValue([[{ id: 5 }]]); // found

    const result = await PortalTask.canAccess(5, 10, 'CLIENT_USER');

    expect(result).toBe(true);
  });

  test('returns false when user is neither creator nor assignee', async () => {
    db.query.mockResolvedValue([[]]); // not found

    const result = await PortalTask.canAccess(5, 10, 'CLIENT_USER');

    expect(result).toBe(false);
  });

  test('checks both assigned_by and assigned_to in the WHERE clause', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalTask.canAccess(5, 10, 'CLIENT_MANAGER');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('assigned_by = ?');
    expect(sql).toContain('assigned_to = ?');
    expect(params).toContain(10); // userId
  });
});

// ── getAssignableUsers ────────────────────────────────────────────────────────

describe('PortalTask.getAssignableUsers', () => {
  test('returns empty array without DB query for unknown role', async () => {
    const result = await PortalTask.getAssignableUsers(1, 'LOCAL_ADMIN');

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('CLIENT_USER role returns empty array (not in role map)', async () => {
    const result = await PortalTask.getAssignableUsers(1, 'CLIENT_USER');

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('CLIENT_ADMIN can see all portal roles', async () => {
    db.query.mockResolvedValue([[{ id: 2, name: 'Bob', role_name: 'CLIENT_USER' }]]);

    await PortalTask.getAssignableUsers(1, 'CLIENT_ADMIN');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('CLIENT_ADMIN');
    expect(sql).toContain('CLIENT_TOP_MGMT');
    expect(sql).toContain('CLIENT_USER');
  });

  test('CLIENT_SALES can only see CLIENT_SALES and CLIENT_USER', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalTask.getAssignableUsers(1, 'CLIENT_SALES');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('CLIENT_SALES');
    expect(sql).toContain('CLIENT_USER');
    expect(sql).not.toContain('CLIENT_ADMIN');
    expect(sql).not.toContain('CLIENT_TOP_MGMT');
  });

  test('CLIENT_TOP_MGMT excludes CLIENT_ADMIN from the filter', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalTask.getAssignableUsers(1, 'CLIENT_TOP_MGMT');

    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain('CLIENT_ADMIN');
    expect(sql).toContain('CLIENT_TOP_MGMT');
  });

  test('excludes the current user from results', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalTask.getAssignableUsers(7, 'CLIENT_ADMIN');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('u.id != ?');
    expect(params[0]).toBe(7);
  });

  test('excludes system account from results', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalTask.getAssignableUsers(1, 'CLIENT_MANAGER');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("system@taskflow.local");
  });

  test('returns query results for a valid role', async () => {
    const users = [{ id: 2, name: 'Alice', role_name: 'CLIENT_USER' }];
    db.query.mockResolvedValue([users]);

    const result = await PortalTask.getAssignableUsers(1, 'CLIENT_MANAGER');

    expect(result).toEqual(users);
  });
});
