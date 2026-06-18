jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db           = require('../../config/db');
const LeaveRequest = require('../../models/LeaveRequest');

// ── findById ──────────────────────────────────────────────────────────────────

describe('LeaveRequest.findById', () => {
  test('returns the leave request row when found', async () => {
    const row = { id: 1, user_id: 5, status: 'pending', from_date: '2024-07-01', to_date: '2024-07-03' };
    db.query.mockResolvedValue([[row]]);

    const result = await LeaveRequest.findById(1);

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE lr.id = ?'), [1]);
  });

  test('returns null when no row matches', async () => {
    db.query.mockResolvedValue([[]]); // empty result set

    const result = await LeaveRequest.findById(999);

    expect(result).toBeNull();
  });

  test('joins users and reviewer in the query', async () => {
    db.query.mockResolvedValue([[{ id: 1 }]]);
    await LeaveRequest.findById(1);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('JOIN users u ON lr.user_id');
    expect(sql).toContain('LEFT JOIN users rv ON lr.reviewed_by');
  });
});

// ── create ────────────────────────────────────────────────────────────────────

describe('LeaveRequest.create', () => {
  const data = { user_id: 5, from_date: '2024-07-01', to_date: '2024-07-05', reason: 'Vacation' };

  test('returns the insertId from the DB', async () => {
    db.query.mockResolvedValue([{ insertId: 88 }]);

    const id = await LeaveRequest.create(data);

    expect(id).toBe(88);
  });

  test('passes all four fields as parameterised values', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await LeaveRequest.create(data);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO leave_requests');
    expect(params).toEqual([5, '2024-07-01', '2024-07-05', 'Vacation']);
  });

  test('accepts null reason without throwing', async () => {
    db.query.mockResolvedValue([{ insertId: 2 }]);

    await expect(
      LeaveRequest.create({ user_id: 5, from_date: '2024-07-01', to_date: '2024-07-02', reason: null })
    ).resolves.toBe(2);
  });
});

// ── createApproved ────────────────────────────────────────────────────────────

describe('LeaveRequest.createApproved', () => {
  const data = { user_id: 5, from_date: '2024-07-01', to_date: '2024-07-05', reason: 'Medical', reviewed_by: 10 };

  test('returns the insertId from the DB', async () => {
    db.query.mockResolvedValue([{ insertId: 33 }]);

    const id = await LeaveRequest.createApproved(data);

    expect(id).toBe(33);
  });

  test('sets status to "approved" directly in the insert', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await LeaveRequest.createApproved(data);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("'approved'");
  });

  test('includes reviewed_by in the inserted values', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await LeaveRequest.createApproved(data);

    const [, params] = db.query.mock.calls[0];
    expect(params).toContain(10); // reviewed_by
  });
});

// ── updateStatus ──────────────────────────────────────────────────────────────

describe('LeaveRequest.updateStatus', () => {
  test('returns true when the pending leave is successfully updated', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await LeaveRequest.updateStatus(1, {
      status: 'approved',
      reviewed_by: 10,
      review_remark: 'OK',
    });

    expect(result).toBe(true);
  });

  test('returns false when no row is affected (leave was not pending)', async () => {
    // affectedRows = 0 means the WHERE status = 'pending' clause found nothing
    db.query.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await LeaveRequest.updateStatus(1, {
      status: 'approved',
      reviewed_by: 10,
    });

    expect(result).toBe(false);
  });

  test('uses WHERE status = "pending" to prevent double-approvals', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await LeaveRequest.updateStatus(1, { status: 'approved', reviewed_by: 10 });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("status = 'pending'");
  });

  test('passes null for review_remark when not provided', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await LeaveRequest.updateStatus(1, { status: 'rejected', reviewed_by: 10 });

    const [, params] = db.query.mock.calls[0];
    expect(params).toContain(null); // review_remark defaults to null
  });

  test('passes the review_remark when provided', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await LeaveRequest.updateStatus(1, { status: 'rejected', reviewed_by: 10, review_remark: 'Too long' });

    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('Too long');
  });
});

// ── hasOverlapping ────────────────────────────────────────────────────────────

describe('LeaveRequest.hasOverlapping', () => {
  test('returns true when an overlapping non-rejected leave exists', async () => {
    db.query.mockResolvedValue([[{ count: 1 }]]);

    const result = await LeaveRequest.hasOverlapping(5, '2024-07-03', '2024-07-07');

    expect(result).toBe(true);
  });

  test('returns false when no overlapping leave exists', async () => {
    db.query.mockResolvedValue([[{ count: 0 }]]);

    const result = await LeaveRequest.hasOverlapping(5, '2024-07-03', '2024-07-07');

    expect(result).toBe(false);
  });

  test('excludes rejected leaves from the overlap check', async () => {
    db.query.mockResolvedValue([[{ count: 0 }]]);

    await LeaveRequest.hasOverlapping(5, '2024-07-01', '2024-07-05');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("status != 'rejected'");
  });

  test('uses the correct date overlap SQL (from_date <= toDate AND to_date >= fromDate)', async () => {
    db.query.mockResolvedValue([[{ count: 0 }]]);

    await LeaveRequest.hasOverlapping(5, '2024-07-01', '2024-07-10');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('from_date <=');
    expect(sql).toContain('to_date >=');
    // toDate comes first in params, then fromDate
    expect(params[1]).toBe('2024-07-10'); // from_date <= toDate
    expect(params[2]).toBe('2024-07-01'); // to_date   >= fromDate
  });

  test('filters by user_id', async () => {
    db.query.mockResolvedValue([[{ count: 0 }]]);

    await LeaveRequest.hasOverlapping(7, '2024-07-01', '2024-07-05');

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(7);
  });
});

// ── getForRange ───────────────────────────────────────────────────────────────

describe('LeaveRequest.getForRange', () => {
  const rows = [{ user_id: 5, from_date: '2024-07-02', to_date: '2024-07-04', status: 'approved' }];

  test('returns leave rows within the given date range', async () => {
    db.query.mockResolvedValue([rows]);

    const result = await LeaveRequest.getForRange('2024-07-01', '2024-07-31');

    expect(result).toEqual(rows);
  });

  test('defaults to approved + pending when no status filter is given', async () => {
    db.query.mockResolvedValue([[]]);

    await LeaveRequest.getForRange('2024-07-01', '2024-07-31');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("IN ('approved', 'pending')");
  });

  test('uses the exact status filter when provided', async () => {
    db.query.mockResolvedValue([[]]);

    await LeaveRequest.getForRange('2024-07-01', '2024-07-31', 'approved');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toContain("IN ('approved', 'pending')");
    expect(params).toContain('approved');
  });

  test('passes endDate and startDate as overlap params (endDate first)', async () => {
    db.query.mockResolvedValue([[]]);

    await LeaveRequest.getForRange('2024-07-01', '2024-07-31');

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe('2024-07-31'); // from_date <= endDate
    expect(params[1]).toBe('2024-07-01'); // to_date   >= startDate
  });
});

// ── getAll (pagination + filters) ────────────────────────────────────────────

describe('LeaveRequest.getAll', () => {
  const rowsResult = [{ id: 1 }, { id: 2 }];

  test('returns rows and total when called with no filters', async () => {
    db.query
      .mockResolvedValueOnce([rowsResult])          // main SELECT
      .mockResolvedValueOnce([[{ total: 2 }]]);      // COUNT

    const result = await LeaveRequest.getAll();

    expect(result.rows).toEqual(rowsResult);
    expect(result.total).toBe(2);
  });

  test('adds user_id filter when provided', async () => {
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]]);

    await LeaveRequest.getAll({ user_id: 5 });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('lr.user_id = ?');
  });

  test('adds status filter when provided', async () => {
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]]);

    await LeaveRequest.getAll({ status: 'pending' });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('lr.status = ?');
    expect(params).toContain('pending');
  });

  test('orders pending leaves first', async () => {
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]]);

    await LeaveRequest.getAll();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("FIELD(lr.status, 'pending'");
  });

  test('applies correct LIMIT and OFFSET for page 2', async () => {
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]]);

    await LeaveRequest.getAll({ page: 2, limit: 5 });

    const [, params] = db.query.mock.calls[0];
    // Last two params are LIMIT and OFFSET
    expect(params[params.length - 2]).toBe(5);  // limit
    expect(params[params.length - 1]).toBe(5);  // offset = (2-1)*5
  });
});
