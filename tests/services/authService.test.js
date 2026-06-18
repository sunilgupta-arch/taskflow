jest.mock('jsonwebtoken', () => ({ sign: jest.fn().mockReturnValue('mock.jwt.token') }));
jest.mock('../../config/db', () => ({ query: jest.fn() }));
jest.mock('../../models/User', () => ({
  findByEmail: jest.fn(),
  verifyPassword: jest.fn(),
}));
jest.mock('../../models/Chat', () => ({
  sendSystemMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../utils/timezone', () => ({
  getToday: jest.fn().mockReturnValue('2024-06-10'),
  getEffectiveWorkDate: jest.fn().mockReturnValue('2024-06-10'),
}));

process.env.JWT_SECRET     = 'test-secret';
process.env.JWT_EXPIRES_IN = '8h';

const jwt         = require('jsonwebtoken');
const db          = require('../../config/db');
const UserModel   = require('../../models/User');
const ChatModel   = require('../../models/Chat');
const AuthService = require('../../services/authService');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const LOCAL_USER = {
  id: 1,
  email: 'alice@test.com',
  password: '$hashed',
  name: 'Alice Smith',
  role_name: 'LOCAL_USER',
  organization_type: 'LOCAL',
  org_type: 'LOCAL',
  org_timezone: 'America/New_York',
  shift_start: '09:00',
  shift_hours: 8,
  is_active: 1,
  failed_login_attempts: 0,
  locked_until: null,
  google_id: null,
};

const CLIENT_USER = {
  ...LOCAL_USER,
  id: 2,
  email: 'bob@client.com',
  role_name: 'CLIENT_ADMIN',
  organization_type: 'CLIENT',
  org_type: 'CLIENT',
};

// ── generateToken ─────────────────────────────────────────────────────────────

describe('AuthService.generateToken', () => {
  test('calls jwt.sign with id, email, and role in the payload', () => {
    AuthService.generateToken(LOCAL_USER);

    expect(jwt.sign).toHaveBeenCalledWith(
      { id: 1, email: 'alice@test.com', role: 'LOCAL_USER' },
      'test-secret',
      expect.any(Object)
    );
  });

  test('uses JWT_EXPIRES_IN env var when no expiresIn is passed', () => {
    AuthService.generateToken(LOCAL_USER);

    const [, , opts] = jwt.sign.mock.calls[0];
    expect(opts.expiresIn).toBe('8h');
  });

  test('uses the provided expiresIn over the env var', () => {
    AuthService.generateToken(LOCAL_USER, '365d');

    const [, , opts] = jwt.sign.mock.calls[0];
    expect(opts.expiresIn).toBe('365d');
  });

  test('defaults to "12h" when no expiresIn and no env var', () => {
    const saved = process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_EXPIRES_IN;

    AuthService.generateToken(LOCAL_USER);

    const [, , opts] = jwt.sign.mock.calls[0];
    expect(opts.expiresIn).toBe('12h');

    process.env.JWT_EXPIRES_IN = saved;
  });

  test('returns whatever jwt.sign returns', () => {
    jwt.sign.mockReturnValueOnce('custom.token');

    const token = AuthService.generateToken(LOCAL_USER);

    expect(token).toBe('custom.token');
  });
});

// ── login — guard conditions ───────────────────────────────────────────────────

describe('AuthService.login — guards', () => {
  test('throws "Invalid credentials" when user is not found', async () => {
    UserModel.findByEmail.mockResolvedValue(null);

    await expect(AuthService.login('ghost@test.com', 'pass'))
      .rejects.toThrow('Invalid credentials');
  });

  test('throws "Account is deactivated" when user.is_active is 0', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER, is_active: 0 });

    await expect(AuthService.login('alice@test.com', 'pass'))
      .rejects.toThrow('Account is deactivated');
  });

  test('throws lock message when account is still locked', async () => {
    // Lock expires 1 hour from "now" (fake time)
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-10T10:00:00.000Z'));

    const lockedUser = {
      ...LOCAL_USER,
      locked_until: new Date('2024-06-10T11:00:00.000Z').toISOString(),
    };
    UserModel.findByEmail.mockResolvedValue(lockedUser);

    await expect(AuthService.login('alice@test.com', 'pass'))
      .rejects.toThrow(/Account locked/);

    jest.useRealTimers();
  });

  test('clears an expired lock and continues login', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-10T12:00:00.000Z'));

    // Lock expired 1 hour ago
    const expiredLockUser = {
      ...LOCAL_USER,
      locked_until: new Date('2024-06-10T11:00:00.000Z').toISOString(),
      failed_login_attempts: 5,
    };
    UserModel.findByEmail.mockResolvedValue(expiredLockUser);
    UserModel.verifyPassword.mockResolvedValue(true);
    db.query.mockResolvedValue([{ affectedRows: 1 }]); // clear lock + attendance INSERT

    // spy on recordAttendance to avoid full setup
    jest.spyOn(AuthService, 'recordAttendance').mockResolvedValue(undefined);

    const result = await AuthService.login('alice@test.com', 'pass');

    // Should have cleared the lock
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('failed_login_attempts = 0'),
      expect.arrayContaining([expiredLockUser.id])
    );
    expect(result).toHaveProperty('token');

    jest.useRealTimers();
    jest.restoreAllMocks();
  });
});

// ── login — wrong password ─────────────────────────────────────────────────────

describe('AuthService.login — wrong password', () => {
  test('throws "Invalid credentials" on wrong password', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER });
    UserModel.verifyPassword.mockResolvedValue(false);
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await expect(AuthService.login('alice@test.com', 'wrongpass'))
      .rejects.toThrow('Invalid credentials');
  });

  test('increments failed_login_attempts on wrong password', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER, failed_login_attempts: 3 });
    UserModel.verifyPassword.mockResolvedValue(false);
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await expect(AuthService.login('alice@test.com', 'wrongpass')).rejects.toThrow();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('failed_login_attempts = ?'),
      [4, LOCAL_USER.id]
    );
  });

  test('locks the account after the 10th failed attempt', async () => {
    // failed_login_attempts is currently 9, this attempt makes it 10
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER, failed_login_attempts: 9 });
    UserModel.verifyPassword.mockResolvedValue(false);
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await expect(AuthService.login('alice@test.com', 'wrongpass'))
      .rejects.toThrow('Account locked after 10 failed attempts');

    // Should use DATE_ADD for 30-minute lock
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DATE_ADD'),
      expect.arrayContaining([LOCAL_USER.id])
    );
  });
});

// ── login — successful ────────────────────────────────────────────────────────

describe('AuthService.login — success', () => {
  beforeEach(() => {
    jest.spyOn(AuthService, 'recordAttendance').mockResolvedValue(undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns { token, user } on success', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER });
    UserModel.verifyPassword.mockResolvedValue(true);

    const result = await AuthService.login('alice@test.com', 'correctpass');

    expect(result).toHaveProperty('token', 'mock.jwt.token');
    expect(result).toHaveProperty('user');
  });

  test('strips password from the returned user object', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER, password: '$secret' });
    UserModel.verifyPassword.mockResolvedValue(true);

    const { user } = await AuthService.login('alice@test.com', 'pass');

    expect(user).not.toHaveProperty('password');
  });

  test('resets failed_login_attempts counter after successful login', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER, failed_login_attempts: 3 });
    UserModel.verifyPassword.mockResolvedValue(true);
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await AuthService.login('alice@test.com', 'pass');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('failed_login_attempts = 0'),
      [LOCAL_USER.id]
    );
  });

  test('does NOT reset counter when it is already 0', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER, failed_login_attempts: 0 });
    UserModel.verifyPassword.mockResolvedValue(true);

    await AuthService.login('alice@test.com', 'pass');

    // No db.query call should reset the counter
    const resetCalls = db.query.mock.calls.filter(
      c => c[0].includes('failed_login_attempts = 0')
    );
    expect(resetCalls).toHaveLength(0);
  });

  test('calls recordAttendance for LOCAL users', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER });
    UserModel.verifyPassword.mockResolvedValue(true);

    await AuthService.login('alice@test.com', 'pass');

    expect(AuthService.recordAttendance).toHaveBeenCalledWith(
      LOCAL_USER.id,
      LOCAL_USER.org_timezone,
      LOCAL_USER.shift_start,
      LOCAL_USER.shift_hours
    );
  });

  test('skips recordAttendance for CLIENT roles', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...CLIENT_USER });
    UserModel.verifyPassword.mockResolvedValue(true);

    await AuthService.login('bob@client.com', 'pass');

    expect(AuthService.recordAttendance).not.toHaveBeenCalled();
  });
});

// ── loginWithGoogle ───────────────────────────────────────────────────────────

describe('AuthService.loginWithGoogle', () => {
  beforeEach(() => {
    jest.spyOn(AuthService, 'recordAttendance').mockResolvedValue(undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('throws "not_registered" when the email is not in the system', async () => {
    UserModel.findByEmail.mockResolvedValue(null);

    await expect(AuthService.loginWithGoogle('ghost@test.com', 'gid123'))
      .rejects.toThrow('not_registered');
  });

  test('throws "inactive" when the account is deactivated', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER, is_active: 0 });

    await expect(AuthService.loginWithGoogle('alice@test.com', 'gid123'))
      .rejects.toThrow('inactive');
  });

  test('saves google_id when the user does not have one yet', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER, google_id: null });
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await AuthService.loginWithGoogle('alice@test.com', 'gid-new');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET google_id'),
      ['gid-new', LOCAL_USER.id]
    );
  });

  test('does NOT overwrite an existing google_id', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER, google_id: 'gid-existing' });

    await AuthService.loginWithGoogle('alice@test.com', 'gid-new');

    const updateCalls = db.query.mock.calls.filter(c => String(c[0]).includes('google_id'));
    expect(updateCalls).toHaveLength(0);
  });

  test('returns persistent=false for LOCAL users', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER });

    const result = await AuthService.loginWithGoogle('alice@test.com', null);

    expect(result.persistent).toBe(false);
  });

  test('returns persistent=true for CLIENT roles', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...CLIENT_USER });

    const result = await AuthService.loginWithGoogle('bob@client.com', null);

    expect(result.persistent).toBe(true);
  });

  test('uses 365d token expiry for CLIENT users', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...CLIENT_USER });

    await AuthService.loginWithGoogle('bob@client.com', null);

    const [, , opts] = jwt.sign.mock.calls[0];
    expect(opts.expiresIn).toBe('365d');
  });

  test('strips password from returned user', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...LOCAL_USER, password: '$secret' });

    const { user } = await AuthService.loginWithGoogle('alice@test.com', null);

    expect(user).not.toHaveProperty('password');
  });

  test('skips attendance for CLIENT roles', async () => {
    UserModel.findByEmail.mockResolvedValue({ ...CLIENT_USER });

    await AuthService.loginWithGoogle('bob@client.com', null);

    expect(AuthService.recordAttendance).not.toHaveBeenCalled();
  });
});

// ── recordAttendance ──────────────────────────────────────────────────────────

describe('AuthService.recordAttendance', () => {
  test('creates an attendance log when no session exists today', async () => {
    db.query
      .mockResolvedValueOnce([[]])   // no existing sessions
      .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT
      .mockResolvedValueOnce([[{ name: 'Alice Smith' }]]); // welcome msg fetch

    await AuthService.recordAttendance(1, 'America/New_York', '09:00', 8);

    const insertCall = db.query.mock.calls[1];
    expect(insertCall[0]).toContain('INSERT INTO attendance_logs');
  });

  test('does NOT create a new log when an open session already exists', async () => {
    // One session exists with no logout_time (open)
    db.query.mockResolvedValueOnce([[{ id: 10, logout_time: null }]]);

    await AuthService.recordAttendance(1, 'America/New_York', '09:00', 8);

    // Only one db.query call (the SELECT) — no INSERT
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('sends a welcome message on the first login of the day', async () => {
    db.query
      .mockResolvedValueOnce([[]])    // isFirstLogin = true
      .mockResolvedValueOnce([{ affectedRows: 1 }])   // INSERT attendance
      .mockResolvedValueOnce([[{ name: 'Alice Smith' }]]); // fetch name for greeting

    await AuthService.recordAttendance(1, 'America/New_York', '09:00', 8);

    expect(ChatModel.sendSystemMessage).toHaveBeenCalledWith(
      1,
      expect.stringContaining('Alice')
    );
  });

  test('does NOT send a welcome message on subsequent logins', async () => {
    // A previous session exists (logged out), but is not the first login
    db.query.mockResolvedValueOnce([[{ id: 5, logout_time: '10:00:00' }]]);

    await AuthService.recordAttendance(1, 'America/New_York', '09:00', 8);

    expect(ChatModel.sendSystemMessage).not.toHaveBeenCalled();
  });

  test('creates a new session even when previous sessions are all logged out', async () => {
    // Previous sessions all have logout_time (closed), so hasOpenSession = false
    db.query
      .mockResolvedValueOnce([[{ id: 5, logout_time: '10:00:00' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT new session

    await AuthService.recordAttendance(1, 'America/New_York', '09:00', 8);

    const insertCall = db.query.mock.calls[1];
    expect(insertCall[0]).toContain('INSERT INTO attendance_logs');
  });
});

// ── recordLogout ──────────────────────────────────────────────────────────────

describe('AuthService.recordLogout', () => {
  test('sets logout_time for the user\'s open session today', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await AuthService.recordLogout(1, 'America/New_York', 'manual');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('logout_time = NOW()');
    expect(sql).toContain('logout_time IS NULL'); // only closes open sessions
    expect(params).toContain('manual'); // logout reason
    expect(params).toContain(1);        // userId
  });

  test('uses the effective work date from timezone utility', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);
    const { getEffectiveWorkDate } = require('../../utils/timezone');

    await AuthService.recordLogout(1, 'America/New_York', null, '22:00', 9);

    expect(getEffectiveWorkDate).toHaveBeenCalledWith('America/New_York', '22:00', 9);
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('2024-06-10'); // date returned by mock
  });

  test('passes null as reason when not provided', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await AuthService.recordLogout(1);

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBeNull(); // reason is first param
  });
});
