jest.mock('../../config/db', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$hashed_password'),
  compare: jest.fn(),
}));
jest.mock('../../models/ShiftHistory', () => ({
  record: jest.fn().mockResolvedValue(undefined),
}));

const db          = require('../../config/db');
const bcrypt      = require('bcryptjs');
const ShiftHistory = require('../../models/ShiftHistory');
const UserModel   = require('../../models/User');

// ─── findById ─────────────────────────────────────────────────────────────────

describe('UserModel.findById', () => {
  test('returns the user row when found', async () => {
    const user = { id: 1, name: 'Alice', email: 'alice@test.com', role_name: 'LOCAL_USER' };
    db.query.mockResolvedValue([[user]]);

    const result = await UserModel.findById(1);

    expect(result).toEqual(user);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE u.id = ?'), [1]);
  });

  test('returns null when no user matches the id', async () => {
    db.query.mockResolvedValue([[]]); // no rows

    const result = await UserModel.findById(999);

    expect(result).toBeNull();
  });

  test('joins roles and organizations in the query', async () => {
    db.query.mockResolvedValue([[{ id: 1 }]]);
    await UserModel.findById(1);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('JOIN roles');
    expect(sql).toContain('JOIN organizations');
  });
});

// ─── findByEmail ──────────────────────────────────────────────────────────────

describe('UserModel.findByEmail', () => {
  test('returns the user when the email exists', async () => {
    const user = { id: 2, email: 'bob@test.com', role_name: 'LOCAL_ADMIN' };
    db.query.mockResolvedValue([[user]]);

    const result = await UserModel.findByEmail('bob@test.com');

    expect(result).toEqual(user);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE u.email = ?'),
      ['bob@test.com']
    );
  });

  test('returns null when email is not found', async () => {
    db.query.mockResolvedValue([[]]); // no rows

    const result = await UserModel.findByEmail('ghost@test.com');

    expect(result).toBeNull();
  });

  test('passes email as a parameterised value (no interpolation)', async () => {
    db.query.mockResolvedValue([[{ id: 3 }]]);
    await UserModel.findByEmail("'; DROP TABLE users; --");

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual(["'; DROP TABLE users; --"]);
  });
});

// ─── verifyPassword ───────────────────────────────────────────────────────────

describe('UserModel.verifyPassword', () => {
  test('returns true when plain text matches the hash', async () => {
    bcrypt.compare.mockResolvedValue(true);

    const result = await UserModel.verifyPassword('secret', '$2b$12$somehash');

    expect(result).toBe(true);
    expect(bcrypt.compare).toHaveBeenCalledWith('secret', '$2b$12$somehash');
  });

  test('returns false when the password does not match', async () => {
    bcrypt.compare.mockResolvedValue(false);

    const result = await UserModel.verifyPassword('wrong', '$2b$12$somehash');

    expect(result).toBe(false);
  });

  test('delegates entirely to bcrypt.compare (no custom logic)', async () => {
    bcrypt.compare.mockResolvedValue(true);
    await UserModel.verifyPassword('p', 'h');

    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('UserModel.create', () => {
  const userData = {
    organization_id: 1,
    role_id: 2,
    name: 'Charlie',
    email: 'charlie@test.com',
    password: 'plaintext',
  };

  test('returns the new user id (insertId)', async () => {
    db.query.mockResolvedValue([{ insertId: 55 }]);

    const id = await UserModel.create(userData);

    expect(id).toBe(55);
  });

  test('hashes the password before inserting', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await UserModel.create(userData);

    expect(bcrypt.hash).toHaveBeenCalledWith('plaintext', 12);
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('$2b$12$hashed_password');
    expect(params).not.toContain('plaintext');
  });

  test('uses default shift_start of 10:00:00 when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await UserModel.create(userData);

    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('10:00:00');
  });

  test('uses default shift_hours of 8.5 when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await UserModel.create(userData);

    const [, params] = db.query.mock.calls[0];
    expect(params).toContain(8.5);
  });

  test('uses provided shift_start and shift_hours when given', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await UserModel.create({ ...userData, shift_start: '22:00:00', shift_hours: 9 });

    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('22:00:00');
    expect(params).toContain(9);
  });

  test('records initial shift history after insert', async () => {
    db.query.mockResolvedValue([{ insertId: 77 }]);

    await UserModel.create(userData);

    expect(ShiftHistory.record).toHaveBeenCalledWith(expect.objectContaining({
      userId: 77,
    }));
  });

  test('uses Sunday as the default weekly_off_day', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await UserModel.create(userData);

    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('Sunday');
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('UserModel.update', () => {
  test('returns false when no allowed fields are provided', async () => {
    const result = await UserModel.update(1, { secret_field: 'hack' });

    expect(result).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns false when data is an empty object', async () => {
    const result = await UserModel.update(1, {});

    expect(result).toBe(false);
  });

  test('only includes fields from the allowlist in the SET clause', async () => {
    db.query.mockResolvedValue([[{ shift_start: '09:00', shift_hours: 8 }], [{ affectedRows: 1 }]]);

    await UserModel.update(1, { name: 'Dave', hacker_field: 'evil' });

    // The UPDATE query is the second db.query call (first is shift check)
    // But since no shift fields are in the data, there's only one query
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('name = ?');
    expect(sql).not.toContain('hacker_field');
  });

  test('returns true when a row was updated', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await UserModel.update(1, { name: 'Updated Name' });

    expect(result).toBe(true);
  });

  test('returns false when no rows were affected', async () => {
    db.query.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await UserModel.update(999, { name: 'Ghost' });

    expect(result).toBe(false);
  });

  test('hashes password when included in update data', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await UserModel.update(1, { password: 'newplaintext' });

    expect(bcrypt.hash).toHaveBeenCalledWith('newplaintext', 12);
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('$2b$12$hashed_password');
    expect(params).not.toContain('newplaintext');
  });

  test('appends the user id as last param in the WHERE clause', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await UserModel.update(42, { name: 'Test' });

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(42);
  });

  test('detects shift change and records shift history', async () => {
    // First query: fetch current shift for comparison
    db.query
      .mockResolvedValueOnce([[{ shift_start: '09:00', shift_hours: 8 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await UserModel.update(1, { shift_start: '22:00', shift_hours: 9 });

    expect(ShiftHistory.record).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      shiftStart: '22:00',
      shiftHours: 9,
    }));
  });

  test('does NOT record shift history when shift values are unchanged', async () => {
    db.query
      .mockResolvedValueOnce([[{ shift_start: '09:00', shift_hours: 8 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    // Same values → no history entry
    await UserModel.update(1, { shift_start: '09:00', shift_hours: 8 });

    expect(ShiftHistory.record).not.toHaveBeenCalled();
  });
});
