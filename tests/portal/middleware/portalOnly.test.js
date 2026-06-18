// Module-level cache state requires a fresh module per test
let db, portalOnly;

beforeEach(() => {
  jest.resetModules();
  jest.doMock('../../../config/db', () => ({ query: jest.fn() }));
  db = require('../../../config/db');
  portalOnly = require('../../../portal/middleware/portalOnly');
});

function makeReq(overrides = {}) {
  return {
    user: { role_name: 'CLIENT_USER' },
    xhr: false,
    path: '/portal/home',
    ...overrides,
  };
}

function makeRes() {
  return {
    locals: {},
    status: jest.fn().mockReturnThis(),
    json:   jest.fn(),
    render: jest.fn(),
  };
}

// ── access denied — non-CLIENT roles ─────────────────────────────────────────

describe('portalOnly — non-CLIENT role', () => {
  test('returns 403 render for LOCAL_ADMIN on a normal request', async () => {
    const req  = makeReq({ user: { role_name: 'LOCAL_ADMIN' } });
    const res  = makeRes();
    const next = jest.fn();

    await portalOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.render).toHaveBeenCalledWith('error', expect.objectContaining({ code: 403 }));
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 JSON for XHR request from a non-CLIENT role', async () => {
    const req  = makeReq({ user: { role_name: 'LOCAL_USER' }, xhr: true });
    const res  = makeRes();
    const next = jest.fn();

    await portalOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Access denied' });
    expect(res.render).not.toHaveBeenCalled();
  });

  test('returns 403 JSON for /api/ paths even without xhr flag', async () => {
    const req  = makeReq({ user: { role_name: 'LOCAL_USER' }, xhr: false, path: '/api/something' });
    const res  = makeRes();

    await portalOnly(req, res, jest.fn());

    expect(res.json).toHaveBeenCalled();
  });

  test('returns 403 for a user with no role', async () => {
    const req  = makeReq({ user: null });
    const res  = makeRes();
    const next = jest.fn();

    await portalOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when user is undefined entirely', async () => {
    const req  = makeReq({ user: undefined });
    const res  = makeRes();

    await portalOnly(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── CLIENT role — passes through ──────────────────────────────────────────────

describe('portalOnly — CLIENT role', () => {
  beforeEach(() => {
    // DB returns no localAdmin, no org delegate
    db.query
      .mockResolvedValueOnce([[]])          // localAdmin query
      .mockResolvedValueOnce([[null]])      // org query → undefined result
  });

  test('calls next() for CLIENT_USER', async () => {
    const req  = makeReq({ user: { role_name: 'CLIENT_USER' } });
    const res  = makeRes();
    const next = jest.fn();

    await portalOnly(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('calls next() for CLIENT_ADMIN', async () => {
    const req  = makeReq({ user: { role_name: 'CLIENT_ADMIN' } });
    const res  = makeRes();
    const next = jest.fn();

    await portalOnly(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('calls next() for any CLIENT_* sub-role', async () => {
    const req  = makeReq({ user: { role_name: 'CLIENT_SALES' } });
    const res  = makeRes();
    const next = jest.fn();

    await portalOnly(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ── res.locals population ─────────────────────────────────────────────────────

describe('portalOnly — res.locals', () => {
  test('sets res.locals.localAdmin to the queried admin', async () => {
    const admin = { id: 1, name: 'Super Admin' };
    db.query
      .mockResolvedValueOnce([[admin]])   // localAdmin
      .mockResolvedValueOnce([[null]]);   // org delegate (no result)

    const req = makeReq();
    const res = makeRes();

    await portalOnly(req, res, jest.fn());

    expect(res.locals.localAdmin).toEqual(admin);
  });

  test('sets res.locals.localAdmin to null when no admin exists', async () => {
    db.query
      .mockResolvedValueOnce([[]])         // no admin
      .mockResolvedValueOnce([[null]]);    // org

    const req = makeReq();
    const res = makeRes();

    await portalOnly(req, res, jest.fn());

    expect(res.locals.localAdmin).toBeNull();
  });

  test('sets res.locals.delegateSupport when a delegate exists', async () => {
    const delegate = { id: 5, name: 'Support User' };
    db.query
      .mockResolvedValueOnce([[]])                             // no admin
      .mockResolvedValueOnce([[{ delegated_support_id: 5 }]]) // org with delegate
      .mockResolvedValueOnce([[delegate]]);                    // delegate user

    const req = makeReq();
    const res = makeRes();

    await portalOnly(req, res, jest.fn());

    expect(res.locals.delegateSupport).toEqual(delegate);
  });
});

// ── clearDelegateCache ────────────────────────────────────────────────────────

describe('portalOnly.clearDelegateCache', () => {
  test('is exported as a function on the middleware', () => {
    expect(typeof portalOnly.clearDelegateCache).toBe('function');
  });

  test('resets delegate cache so next request re-queries DB', async () => {
    const delegate = { id: 5, name: 'Support' };

    // First request: populate the delegate cache
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ delegated_support_id: 5 }]])
      .mockResolvedValueOnce([[delegate]]);

    await portalOnly(makeReq(), makeRes(), jest.fn());

    // Clear the cache
    portalOnly.clearDelegateCache();

    // Second request: delegate cache is cleared → DB queried again
    db.query
      .mockResolvedValueOnce([[]])                              // localAdmin (still cached from 1st)
      .mockResolvedValueOnce([[{ delegated_support_id: 5 }]])  // org re-queried
      .mockResolvedValueOnce([[delegate]]);                     // delegate re-queried

    const res2 = makeRes();
    await portalOnly(makeReq(), res2, jest.fn());

    // 3rd and 4th db.query calls are for the re-queried delegate
    expect(db.query.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});
