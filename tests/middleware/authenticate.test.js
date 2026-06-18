// Mock dependencies BEFORE requiring the module under test.
// Use factory form so the real modules are never evaluated (no DB connection attempt).
jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../config/db', () => ({ query: jest.fn() }));

// Provide a JWT secret so jwt.verify receives a real string, not undefined
process.env.JWT_SECRET = 'test-secret';

const jwt = require('jsonwebtoken');
const db  = require('../../config/db');
const authenticate = require('../../middleware/authenticate');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
  return {
    cookies: {},
    headers: {},
    xhr: false,
    path: '/admin',
    originalUrl: '/admin',
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  res.locals = {};
  return res;
}

// A fully-formed LOCAL_ADMIN user row (what the DB query returns)
const LOCAL_ADMIN_USER = {
  id: 1,
  name: 'Admin User',
  email: 'admin@test.com',
  role_name: 'LOCAL_ADMIN',
  organization_type: 'LOCAL',
  org_type: 'LOCAL',
  org_name: 'Test Org',
  org_timezone: 'America/New_York',
  is_active: 1,
};

const CLIENT_USER = {
  ...LOCAL_ADMIN_USER,
  id: 2,
  role_name: 'CLIENT_ADMIN',
  organization_type: 'CLIENT',
  org_type: 'CLIENT',
};

// Helper to set up the three DB calls authenticate makes:
// 1) user lookup → [[user]] or [[]]
// 2) other-org timezone → [[{ timezone: 'America/New_York' }]]
// 3) announcements → [[]]
function mockDbSuccess(user) {
  db.query
    .mockResolvedValueOnce([[user]])                          // user query
    .mockResolvedValueOnce([[{ timezone: 'America/New_York' }]]) // other org
    .mockResolvedValueOnce([[]])                              // announcements
}

// ─── No token ─────────────────────────────────────────────────────────────────

describe('authenticate — no token', () => {
  test('redirects to login for browser request', async () => {
    const req = mockReq(); // no cookies, no Authorization header
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('/auth/login');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 JSON for XHR request', async () => {
    const req = mockReq({ xhr: true });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Authentication required' });
  });

  test('returns 401 JSON for /api/ path', async () => {
    const req = mockReq({ path: '/api/tasks' });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ─── Invalid / expired token ──────────────────────────────────────────────────

describe('authenticate — invalid token', () => {
  test('redirects to login and clears cookie on JWT error (browser)', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid signature'); });

    const req = mockReq({ cookies: { token: 'bad.token.here' } });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith('token');
    expect(res.redirect).toHaveBeenCalledWith('/auth/login');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 JSON and clears cookie on JWT error (XHR)', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('jwt expired'); });

    const req = mockReq({ cookies: { token: 'expired.token' }, xhr: true });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Invalid or expired token' });
  });
});

// ─── Valid token — user not found ─────────────────────────────────────────────

describe('authenticate — valid token but user not found', () => {
  test('redirects to login and clears cookie (browser)', async () => {
    jwt.verify.mockReturnValue({ id: 99 });
    db.query.mockResolvedValueOnce([[]]); // no user found

    const req = mockReq({ cookies: { token: 'valid.token' } });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith('token');
    expect(res.redirect).toHaveBeenCalledWith('/auth/login');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 JSON for XHR when user not found', async () => {
    jwt.verify.mockReturnValue({ id: 99 });
    db.query.mockResolvedValueOnce([[]]); // no user

    const req = mockReq({ cookies: { token: 'valid.token' }, xhr: true });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'User not found or inactive' });
  });
});

// ─── Valid token — successful auth ────────────────────────────────────────────

describe('authenticate — successful authentication', () => {
  test('attaches user to req.user and res.locals.user', async () => {
    jwt.verify.mockReturnValue({ id: 1 });
    mockDbSuccess(LOCAL_ADMIN_USER);

    const req = mockReq({ cookies: { token: 'valid.token' } });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(req.user).toMatchObject({ id: 1, role_name: 'LOCAL_ADMIN' });
    expect(res.locals.user).toMatchObject({ id: 1, role_name: 'LOCAL_ADMIN' });
    expect(next).toHaveBeenCalled();
  });

  test('accepts token from Authorization Bearer header', async () => {
    jwt.verify.mockReturnValue({ id: 1 });
    mockDbSuccess(LOCAL_ADMIN_USER);

    const req = mockReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith('valid.token', expect.anything());
    expect(next).toHaveBeenCalled();
  });

  test('sets res.locals.announcements to array', async () => {
    jwt.verify.mockReturnValue({ id: 1 });
    mockDbSuccess(LOCAL_ADMIN_USER);

    const req = mockReq({ cookies: { token: 'valid.token' } });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(Array.isArray(res.locals.announcements)).toBe(true);
  });
});

// ─── CLIENT role — route gating ───────────────────────────────────────────────

describe('authenticate — CLIENT role blocked from LOCAL routes', () => {
  test('redirects CLIENT user to /portal when accessing /admin', async () => {
    jwt.verify.mockReturnValue({ id: 2 });
    db.query.mockResolvedValueOnce([[CLIENT_USER]]); // user query only — blocked before other queries

    const req = mockReq({
      cookies: { token: 'valid.token' },
      originalUrl: '/admin',
    });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('/portal');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 JSON when XHR CLIENT user hits a LOCAL route', async () => {
    jwt.verify.mockReturnValue({ id: 2 });
    db.query.mockResolvedValueOnce([[CLIENT_USER]]);

    const req = mockReq({
      cookies: { token: 'valid.token' },
      originalUrl: '/admin/tasks',
      xhr: true,
      headers: { 'x-requested-with': 'XMLHttpRequest' },
    });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Access denied' });
  });

  test('allows CLIENT user to access /portal route', async () => {
    jwt.verify.mockReturnValue({ id: 2 });
    // CLIENT accessing /portal — all 3 DB calls should run
    db.query
      .mockResolvedValueOnce([[CLIENT_USER]])
      .mockResolvedValueOnce([[{ timezone: 'America/New_York' }]])
      .mockResolvedValueOnce([[]]); // announcements — CLIENT_ADMIN gets banner

    const req = mockReq({
      cookies: { token: 'valid.token' },
      originalUrl: '/portal/tasks',
    });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('allows CLIENT user to access /auth route', async () => {
    jwt.verify.mockReturnValue({ id: 2 });
    db.query
      .mockResolvedValueOnce([[CLIENT_USER]])
      .mockResolvedValueOnce([[{ timezone: 'America/New_York' }]])
      .mockResolvedValueOnce([[]]); // CLIENT_ADMIN sees banner

    const req = mockReq({
      cookies: { token: 'valid.token' },
      originalUrl: '/auth/logout',
    });
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
