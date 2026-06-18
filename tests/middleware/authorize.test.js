const { authorize, requireRoles, requireOrgType } = require('../../middleware/authorize');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
  return {
    user: null,
    xhr: false,
    path: '/some/page',
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
}

// ─── authorize ────────────────────────────────────────────────────────────────

describe('authorize middleware', () => {
  test('redirects to login when user is not set (no session)', () => {
    const middleware = authorize('task:create');
    const req = mockReq({ user: null });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('/auth/login');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 JSON for XHR request when user is missing', () => {
    const middleware = authorize('task:create');
    const req = mockReq({ user: null, xhr: true });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Access denied' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 JSON for /api/ path when user is missing', () => {
    const middleware = authorize('task:create');
    const req = mockReq({ user: null, path: '/api/tasks' });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Access denied' });
  });

  test('calls next() when user has the required permission', () => {
    // LOCAL_ADMIN has 'task:create'
    const middleware = authorize('task:create');
    const req = mockReq({ user: { role_name: 'LOCAL_ADMIN' } });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('calls next() when user has any one of the listed permissions', () => {
    // LOCAL_USER has 'task:pick' but not 'task:create'
    const middleware = authorize('task:create', 'task:pick');
    const req = mockReq({ user: { role_name: 'LOCAL_USER' } });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('redirects LOCAL user to /admin when permission denied (non-XHR)', () => {
    // LOCAL_USER does not have 'user:manage'
    const middleware = authorize('user:manage');
    const req = mockReq({ user: { role_name: 'LOCAL_USER' } });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('/admin');
    expect(next).not.toHaveBeenCalled();
  });

  test('redirects CLIENT user to /portal when permission denied (non-XHR)', () => {
    // CLIENT_USER does not have 'user:manage'
    const middleware = authorize('user:manage');
    const req = mockReq({ user: { role_name: 'CLIENT_USER' } });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('/portal');
  });

  test('returns 403 JSON when permission denied and request is XHR', () => {
    const middleware = authorize('reward:mark_paid');
    const req = mockReq({ user: { role_name: 'LOCAL_USER' }, xhr: true });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Insufficient permissions' });
  });

  test('returns 403 JSON when permission denied and path is /api/', () => {
    const middleware = authorize('reward:mark_paid');
    const req = mockReq({ user: { role_name: 'LOCAL_USER' }, path: '/api/rewards' });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('treats unknown role as having no permissions', () => {
    const middleware = authorize('task:create');
    const req = mockReq({ user: { role_name: 'GHOST_ROLE' } });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});

// ─── requireRoles ─────────────────────────────────────────────────────────────

describe('requireRoles middleware', () => {
  test('calls next() when role matches', () => {
    const middleware = requireRoles('LOCAL_ADMIN');
    const req = mockReq({ user: { role_name: 'LOCAL_ADMIN' } });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('calls next() when role is one of many allowed roles', () => {
    const middleware = requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER');
    const req = mockReq({ user: { role_name: 'LOCAL_MANAGER' } });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('redirects LOCAL_USER to /admin when role not in allowed list (non-XHR)', () => {
    const middleware = requireRoles('LOCAL_ADMIN');
    const req = mockReq({ user: { role_name: 'LOCAL_USER' } });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('/admin');
    expect(next).not.toHaveBeenCalled();
  });

  test('redirects CLIENT_ADMIN to /portal when role not in allowed list (non-XHR)', () => {
    const middleware = requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER');
    const req = mockReq({ user: { role_name: 'CLIENT_ADMIN' } });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('/portal');
  });

  test('returns 403 JSON when role not in allowed list and request is XHR', () => {
    const middleware = requireRoles('LOCAL_ADMIN');
    const req = mockReq({ user: { role_name: 'LOCAL_USER' }, xhr: true });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Role not authorized' });
  });

  test('returns 403 JSON for /api/ path', () => {
    const middleware = requireRoles('LOCAL_ADMIN');
    const req = mockReq({ user: { role_name: 'LOCAL_USER' }, path: '/api/admin' });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('redirects to login when user has no role', () => {
    const middleware = requireRoles('LOCAL_ADMIN');
    const req = mockReq({ user: {} }); // role_name undefined
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    // undefined role falls through to safeHome(undefined) → /auth/login
    expect(res.redirect).toHaveBeenCalledWith('/auth/login');
  });
});

// ─── requireOrgType ───────────────────────────────────────────────────────────

describe('requireOrgType middleware', () => {
  test('calls next() when org type matches', () => {
    const middleware = requireOrgType('LOCAL');
    const req = mockReq({ user: { organization_type: 'LOCAL' } });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('calls next() when org type is one of many allowed types', () => {
    const middleware = requireOrgType('LOCAL', 'CLIENT');
    const req = mockReq({ user: { organization_type: 'CLIENT' } });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('returns 403 JSON when org type does not match', () => {
    const middleware = requireOrgType('LOCAL');
    const req = mockReq({ user: { organization_type: 'CLIENT' } });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Organization not authorized' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 JSON when org type is missing', () => {
    const middleware = requireOrgType('LOCAL');
    const req = mockReq({ user: {} });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
