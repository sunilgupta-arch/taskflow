jest.mock('../../../config/db', () => ({ query: jest.fn() }));

const db           = require('../../../config/db');
const PortalReport = require('../../../portal/models/Report');

// ── create ────────────────────────────────────────────────────────────────────

describe('PortalReport.create', () => {
  test('returns the insertId', async () => {
    db.query
      .mockResolvedValueOnce([[{ maxOrder: 2 }]])  // MAX sort_order
      .mockResolvedValueOnce([{ insertId: 10 }]);   // INSERT

    const id = await PortalReport.create({ user_id: 5, name: 'Sales', url: 'https://example.com', color: 'green' });

    expect(id).toBe(10);
  });

  test('sets sort_order to maxOrder + 1', async () => {
    db.query
      .mockResolvedValueOnce([[{ maxOrder: 4 }]])
      .mockResolvedValueOnce([{ insertId: 1 }]);

    await PortalReport.create({ user_id: 5, name: 'R', url: 'https://x.com' });

    const [, params] = db.query.mock.calls[1];
    expect(params[4]).toBe(5); // sort_order = 4 + 1
  });

  test('defaults color to "blue" when not provided', async () => {
    db.query
      .mockResolvedValueOnce([[{ maxOrder: 0 }]])
      .mockResolvedValueOnce([{ insertId: 1 }]);

    await PortalReport.create({ user_id: 5, name: 'R', url: 'https://x.com' });

    const [, params] = db.query.mock.calls[1];
    expect(params[3]).toBe('blue'); // color
  });

  test('uses provided color', async () => {
    db.query
      .mockResolvedValueOnce([[{ maxOrder: 0 }]])
      .mockResolvedValueOnce([{ insertId: 1 }]);

    await PortalReport.create({ user_id: 5, name: 'R', url: 'https://x.com', color: 'red' });

    const [, params] = db.query.mock.calls[1];
    expect(params[3]).toBe('red');
  });

  test('queries max sort_order scoped to user_id', async () => {
    db.query
      .mockResolvedValueOnce([[{ maxOrder: 0 }]])
      .mockResolvedValueOnce([{ insertId: 1 }]);

    await PortalReport.create({ user_id: 7, name: 'R', url: 'https://x.com' });

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([7]);
  });
});

// ── findById ──────────────────────────────────────────────────────────────────

describe('PortalReport.findById', () => {
  test('returns the report when found', async () => {
    const row = { id: 3, name: 'Sales', url: 'https://example.com' };
    db.query.mockResolvedValue([[row]]);

    const result = await PortalReport.findById(3);

    expect(result).toEqual(row);
  });

  test('returns null when no row matches', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await PortalReport.findById(999);

    expect(result).toBeNull();
  });
});

// ── getForUser ────────────────────────────────────────────────────────────────

describe('PortalReport.getForUser', () => {
  test('returns all reports for a user', async () => {
    const rows = [{ id: 1, name: 'Sales' }, { id: 2, name: 'Ops' }];
    db.query.mockResolvedValue([rows]);

    const result = await PortalReport.getForUser(5);

    expect(result).toEqual(rows);
  });

  test('filters by user_id', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalReport.getForUser(7);

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(7);
  });

  test('orders by sort_order ASC then created_at ASC', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalReport.getForUser(5);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY sort_order ASC, created_at ASC');
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('PortalReport.update', () => {
  test('returns undefined (no-op) when no allowed fields are given', async () => {
    const result = await PortalReport.update(1, { hacker: 'x' });

    expect(result).toBeUndefined();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns undefined when fields object is empty', async () => {
    const result = await PortalReport.update(1, {});

    expect(result).toBeUndefined();
  });

  test('updates only allowed fields (name, url, color, sort_order)', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalReport.update(1, { name: 'New Name', hacker: 'evil' });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('name = ?');
    expect(sql).not.toContain('hacker');
  });

  test('can update sort_order for reordering', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalReport.update(1, { sort_order: 3 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('sort_order = ?');
    expect(params).toContain(3);
  });

  test('appends id as the last WHERE param', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalReport.update(42, { color: 'purple' });

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(42);
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe('PortalReport.delete', () => {
  test('issues a hard DELETE by id', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalReport.delete(5);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql.trim().toUpperCase()).toMatch(/^DELETE/);
    expect(params).toEqual([5]);
  });
});
