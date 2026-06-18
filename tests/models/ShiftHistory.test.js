jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db           = require('../../config/db');
const ShiftHistory = require('../../models/ShiftHistory');

// ── getShiftForDate ───────────────────────────────────────────────────────────

describe('ShiftHistory.getShiftForDate', () => {
  test('returns the matching history row when one exists', async () => {
    const row = { shift_start: '09:00:00', shift_hours: 8 };
    db.query.mockResolvedValueOnce([[row]]);

    const result = await ShiftHistory.getShiftForDate(5, '2024-06-10');

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledTimes(1); // no fallback needed
  });

  test('falls back to users table when no history row exists', async () => {
    const userRow = { shift_start: '10:00:00', shift_hours: 8.5 };
    db.query
      .mockResolvedValueOnce([[]])       // no history
      .mockResolvedValueOnce([[userRow]]); // users table

    const result = await ShiftHistory.getShiftForDate(5, '2024-06-10');

    expect(result).toEqual(userRow);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('returns hardcoded default when neither history nor user row exists', async () => {
    db.query
      .mockResolvedValueOnce([[]])   // no history
      .mockResolvedValueOnce([[]]); // no user row

    const result = await ShiftHistory.getShiftForDate(5, '2024-06-10');

    expect(result).toEqual({ shift_start: '10:00:00', shift_hours: 8.5 });
  });

  test('queries history with effective_date <= the given date', async () => {
    db.query.mockResolvedValueOnce([[{ shift_start: '09:00:00', shift_hours: 8 }]]);

    await ShiftHistory.getShiftForDate(7, '2024-07-01');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('effective_date <= ?');
    expect(params).toEqual([7, '2024-07-01']);
  });

  test('orders by effective_date DESC, id DESC to pick the latest entry', async () => {
    db.query.mockResolvedValueOnce([[{ shift_start: '09:00:00', shift_hours: 8 }]]);

    await ShiftHistory.getShiftForDate(7, '2024-07-01');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY effective_date DESC, id DESC');
  });
});

// ── record ────────────────────────────────────────────────────────────────────

describe('ShiftHistory.record', () => {
  test('inserts a shift history row', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await ShiftHistory.record({
      userId: 5, shiftStart: '09:00:00', shiftHours: 8, effectiveDate: '2024-07-01', changedBy: 1,
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO shift_history');
    expect(params).toEqual([5, '09:00:00', 8, '2024-07-01', 1]);
  });

  test('accepts null for changedBy', async () => {
    db.query.mockResolvedValue([{}]);

    await ShiftHistory.record({ userId: 5, shiftStart: '10:00:00', shiftHours: 8.5, effectiveDate: '2024-07-01' });

    const [, params] = db.query.mock.calls[0];
    expect(params[4]).toBeNull();
  });
});

// ── getHistory ────────────────────────────────────────────────────────────────

describe('ShiftHistory.getHistory', () => {
  test('returns all shift history rows for a user', async () => {
    const rows = [
      { id: 2, shift_start: '09:00:00', effective_date: '2024-07-01', changed_by_name: 'Admin' },
      { id: 1, shift_start: '10:00:00', effective_date: '2024-01-01', changed_by_name: null },
    ];
    db.query.mockResolvedValue([rows]);

    const result = await ShiftHistory.getHistory(5);

    expect(result).toEqual(rows);
  });

  test('orders by effective_date DESC, id DESC', async () => {
    db.query.mockResolvedValue([[]]);

    await ShiftHistory.getHistory(5);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY sh.effective_date DESC, sh.id DESC');
  });

  test('joins users for the changed_by name', async () => {
    db.query.mockResolvedValue([[]]);

    await ShiftHistory.getHistory(5);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('LEFT JOIN users u ON sh.changed_by = u.id');
  });

  test('filters by userId', async () => {
    db.query.mockResolvedValue([[]]);

    await ShiftHistory.getHistory(7);

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(7);
  });
});
