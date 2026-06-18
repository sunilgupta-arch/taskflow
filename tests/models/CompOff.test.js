jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db      = require('../../config/db');
const CompOff = require('../../models/CompOff');

// Fix "today" to 2024-06-10 for all date comparison tests
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2024-06-10T12:00:00.000Z'));
});
afterEach(() => {
  jest.useRealTimers();
});

// ── earn ──────────────────────────────────────────────────────────────────────

describe('CompOff.earn', () => {
  test('returns the insertId from the DB', async () => {
    db.query.mockResolvedValue([{ insertId: 42 }]);

    const id = await CompOff.earn(5, '2024-06-09');

    expect(id).toBe(42);
  });

  test('passes userId and earnedDate as parameterised values', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await CompOff.earn(7, '2024-06-09');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO comp_off_credits');
    expect(params).toEqual([7, '2024-06-09']);
  });
});

// ── getBalance ────────────────────────────────────────────────────────────────

describe('CompOff.getBalance', () => {
  test('returns the available credit count for a user', async () => {
    db.query.mockResolvedValue([[{ cnt: 3 }]]);

    const balance = await CompOff.getBalance(5);

    expect(balance).toBe(3);
  });

  test('returns 0 when user has no available credits', async () => {
    db.query.mockResolvedValue([[{ cnt: 0 }]]);

    const balance = await CompOff.getBalance(5);

    expect(balance).toBe(0);
  });

  test('filters by status = "available"', async () => {
    db.query.mockResolvedValue([[{ cnt: 2 }]]);

    await CompOff.getBalance(5);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('"available"');
  });
});

// ── getHistory ────────────────────────────────────────────────────────────────

describe('CompOff.getHistory', () => {
  test('returns all credit rows for a user ordered by created_at DESC', async () => {
    const rows = [{ id: 2 }, { id: 1 }];
    db.query.mockResolvedValue([rows]);

    const result = await CompOff.getHistory(5);

    expect(result).toEqual(rows);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at DESC');
  });
});

// ── applyCredits ──────────────────────────────────────────────────────────────

describe('CompOff.applyCredits', () => {
  test('throws when balance is less than the number of dates requested', async () => {
    // getBalance → 1 available
    db.query.mockResolvedValueOnce([[{ cnt: 1 }]]);

    await expect(CompOff.applyCredits(5, ['2024-07-01', '2024-07-02']))
      .rejects.toThrow('Insufficient comp-off balance');
  });

  test('fetches oldest available credits (LIMIT = dates.length)', async () => {
    db.query
      .mockResolvedValueOnce([[{ cnt: 2 }]])              // getBalance → 2
      .mockResolvedValueOnce([[{ id: 10 }, { id: 11 }]]) // SELECT credits
      .mockResolvedValue([{ affectedRows: 1 }]);          // UPDATE + INSERT × 2

    await CompOff.applyCredits(5, ['2024-07-01', '2024-07-02']);

    const selectCall = db.query.mock.calls[1];
    expect(selectCall[0]).toContain('ORDER BY earned_date ASC LIMIT ?');
    expect(selectCall[1]).toContain(2); // limit = dates.length
  });

  test('marks each credit as "used" with the corresponding applied date', async () => {
    db.query
      .mockResolvedValueOnce([[{ cnt: 2 }]])
      .mockResolvedValueOnce([[{ id: 10 }, { id: 11 }]])
      .mockResolvedValue([{ affectedRows: 1 }]);

    await CompOff.applyCredits(5, ['2024-07-01', '2024-07-02']);

    // UPDATE calls are at index 2 and 4 (interleaved with INSERT)
    const updateCall1 = db.query.mock.calls[2];
    const updateCall2 = db.query.mock.calls[4];
    expect(updateCall1[1]).toContain('2024-07-01');
    expect(updateCall1[1]).toContain(10);
    expect(updateCall2[1]).toContain('2024-07-02');
    expect(updateCall2[1]).toContain(11);
  });

  test('inserts an attendance_logs comp_off entry for each applied date', async () => {
    db.query
      .mockResolvedValueOnce([[{ cnt: 1 }]])
      .mockResolvedValueOnce([[{ id: 10 }]])
      .mockResolvedValue([{ affectedRows: 1 }]);

    await CompOff.applyCredits(5, ['2024-07-01']);

    const insertCall = db.query.mock.calls[3];
    expect(insertCall[0]).toContain("manual_status = 'comp_off'");
    expect(insertCall[1]).toContain('2024-07-01');
  });
});

// ── revokeCredit ──────────────────────────────────────────────────────────────

describe('CompOff.revokeCredit', () => {
  // today is '2024-06-10' (fixed by fake timers)

  test('throws when credit is not found', async () => {
    db.query.mockResolvedValueOnce([[]]); // no credit row

    await expect(CompOff.revokeCredit(99))
      .rejects.toThrow('Credit not found');
  });

  test('throws when credit is already revoked', async () => {
    db.query.mockResolvedValueOnce([[{ id: 1, user_id: 5, status: 'revoked', earned_date: '2024-05-01', applied_to_date: null }]]);

    await expect(CompOff.revokeCredit(1))
      .rejects.toThrow('Credit is already revoked');
  });

  test('removes the attendance entry when credit was applied to a future date', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 1, user_id: 5, status: 'used', earned_date: '2024-05-01', applied_to_date: '2024-06-15' }]])
      // future date (>= today '2024-06-10') → delete applied attendance
      .mockResolvedValue([{ affectedRows: 1 }]);

    await CompOff.revokeCredit(1);

    // First delete should be for applied_to_date
    const firstDelete = db.query.mock.calls[1];
    expect(firstDelete[0]).toContain('DELETE FROM attendance_logs');
    expect(firstDelete[1]).toContain('2024-06-15');
  });

  test('does NOT delete applied attendance when credit applied to a past date', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 1, user_id: 5, status: 'used', earned_date: '2024-05-01', applied_to_date: '2024-05-10' }]])
      // past date → skip first delete, but still delete earned_date entry
      .mockResolvedValue([{ affectedRows: 1 }]);

    await CompOff.revokeCredit(1);

    // No call should be DELETE with '2024-05-10' (the past applied date)
    const deleteCalls = db.query.mock.calls.filter(c => c[0].includes('DELETE'));
    const deletedDates = deleteCalls.flatMap(c => c[1] || []);
    expect(deletedDates).not.toContain('2024-05-10');
  });

  test('always deletes the earned_date attendance entry', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 1, user_id: 5, status: 'available', earned_date: '2024-05-01', applied_to_date: null }]])
      .mockResolvedValue([{ affectedRows: 1 }]);

    await CompOff.revokeCredit(1);

    const deleteCalls = db.query.mock.calls.filter(c => c[0].includes('DELETE'));
    const deletedDates = deleteCalls.flatMap(c => c[1] || []);
    expect(deletedDates).toContain('2024-05-01');
  });

  test('sets credit status to "revoked" and clears applied_to_date', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 1, user_id: 5, status: 'available', earned_date: '2024-05-01', applied_to_date: null }]])
      .mockResolvedValue([{ affectedRows: 1 }]);

    await CompOff.revokeCredit(1);

    const updateCall = db.query.mock.calls[db.query.mock.calls.length - 1];
    expect(updateCall[0]).toContain('"revoked"');
    expect(updateCall[1]).toContain(1);
  });

  test('returns the credit object on success', async () => {
    const credit = { id: 1, user_id: 5, status: 'available', earned_date: '2024-05-01', applied_to_date: null };
    db.query
      .mockResolvedValueOnce([[credit]])
      .mockResolvedValue([{ affectedRows: 1 }]);

    const result = await CompOff.revokeCredit(1);

    expect(result).toBe(credit);
  });
});

// ── cancelCredit ──────────────────────────────────────────────────────────────

describe('CompOff.cancelCredit', () => {
  // today is '2024-06-10'

  test('throws when credit is not found for this user', async () => {
    db.query.mockResolvedValueOnce([[]]); // no row

    await expect(CompOff.cancelCredit(99, 5))
      .rejects.toThrow('Credit not found');
  });

  test('throws when credit status is not "used"', async () => {
    db.query.mockResolvedValueOnce([[{ id: 1, status: 'available', applied_to_date: '2024-07-01' }]]);

    await expect(CompOff.cancelCredit(1, 5))
      .rejects.toThrow('Only applied comp-offs can be cancelled');
  });

  test('throws when credit has no applied_to_date', async () => {
    db.query.mockResolvedValueOnce([[{ id: 1, status: 'used', applied_to_date: null }]]);

    await expect(CompOff.cancelCredit(1, 5))
      .rejects.toThrow('No applied date on this credit');
  });

  test('throws when applied_to_date is in the past', async () => {
    // applied_to_date '2024-06-09' < today '2024-06-10'
    db.query.mockResolvedValueOnce([[{ id: 1, status: 'used', applied_to_date: '2024-06-09' }]]);

    await expect(CompOff.cancelCredit(1, 5))
      .rejects.toThrow('Cannot cancel a comp-off that has already passed');
  });

  test('resets credit to "available" for a future applied date', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 1, status: 'used', applied_to_date: '2024-06-15' }]]) // fetch
      .mockResolvedValue([{ affectedRows: 1 }]); // UPDATE + DELETE

    await CompOff.cancelCredit(1, 5);

    const updateCall = db.query.mock.calls[1];
    expect(updateCall[0]).toContain('"available"');
  });

  test('deletes the attendance_logs entry for the cancelled date', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 1, status: 'used', applied_to_date: '2024-06-15' }]])
      .mockResolvedValue([{ affectedRows: 1 }]);

    await CompOff.cancelCredit(1, 5);

    const deleteCalls = db.query.mock.calls.filter(c => String(c[0]).includes('DELETE'));
    expect(deleteCalls.length).toBeGreaterThan(0);
    const deletedDates = deleteCalls.flatMap(c => c[1] || []);
    expect(deletedDates).toContain('2024-06-15');
  });

  test('returns the applied_to_date on success', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 1, status: 'used', applied_to_date: '2024-06-20' }]])
      .mockResolvedValue([{ affectedRows: 1 }]);

    const result = await CompOff.cancelCredit(1, 5);

    expect(result).toBe('2024-06-20');
  });

  test('also allows cancellation when applied_to_date equals today', async () => {
    // applied_to_date '2024-06-10' === today '2024-06-10' → NOT in the past
    db.query
      .mockResolvedValueOnce([[{ id: 1, status: 'used', applied_to_date: '2024-06-10' }]])
      .mockResolvedValue([{ affectedRows: 1 }]);

    await expect(CompOff.cancelCredit(1, 5)).resolves.toBe('2024-06-10');
  });
});

// ── hasActionToday ────────────────────────────────────────────────────────────

describe('CompOff.hasActionToday', () => {
  test('returns true when user has earned a comp-off on that date', async () => {
    db.query.mockResolvedValueOnce([[{ cnt: 1 }]]);

    const result = await CompOff.hasActionToday(5, '2024-06-10');

    expect(result).toBe(true);
  });

  test('checks attendance_logs when no comp-off earned on that date', async () => {
    db.query
      .mockResolvedValueOnce([[{ cnt: 0 }]])  // no comp-off earned
      .mockResolvedValueOnce([[{ cnt: 1 }]]); // but has check_in/half_day log

    const result = await CompOff.hasActionToday(5, '2024-06-10');

    expect(result).toBe(true);
  });

  test('returns false when neither condition is met', async () => {
    db.query
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]]);

    const result = await CompOff.hasActionToday(5, '2024-06-10');

    expect(result).toBe(false);
  });

  test('does not query attendance_logs when comp-off was already found', async () => {
    db.query.mockResolvedValueOnce([[{ cnt: 1 }]]);

    await CompOff.hasActionToday(5, '2024-06-10');

    // Only one DB call because we return early
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
