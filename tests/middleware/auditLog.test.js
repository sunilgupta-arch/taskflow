jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db       = require('../../config/db');
const auditLog = require('../../middleware/auditLog');

function makeReq(overrides = {}) {
  return {
    user:   { id: 5 },
    params: {},
    body:   { name: 'test' },
    query:  { page: '1' },
    ip:     '127.0.0.1',
    ...overrides,
  };
}

function makeRes() {
  const res = {};
  res.json = jest.fn();
  return res;
}

// ── factory and middleware shape ───────────────────────────────────────────────

describe('auditLog factory', () => {
  test('returns a middleware function', () => {
    const middleware = auditLog('CREATE', 'task');
    expect(typeof middleware).toBe('function');
    expect(middleware.length).toBe(3); // (req, res, next)
  });

  test('middleware calls next()', () => {
    const middleware = auditLog('UPDATE', 'user');
    const next = jest.fn();

    middleware(makeReq(), makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('middleware replaces res.json with an override', () => {
    const middleware = auditLog('DELETE', 'task');
    const res = makeRes();
    const orig = res.json;

    middleware(makeReq(), res, jest.fn());

    expect(res.json).not.toBe(orig);
  });
});

// ── audit log insertion ───────────────────────────────────────────────────────

describe('auditLog — log insertion', () => {
  async function invoke(reqOverrides, body) {
    const middleware = auditLog('CREATE', 'task');
    const req = makeReq(reqOverrides);
    const res = makeRes();
    const originalJson = res.json;
    middleware(req, res, jest.fn());
    db.query.mockResolvedValue([{ insertId: 1 }]);
    await res.json(body);
    return { req, originalJson };
  }

  test('inserts to audit_logs when body.success is true and req.user exists', async () => {
    await invoke({}, { success: true, data: { id: 7 } });

    expect(db.query).toHaveBeenCalled();
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_logs');
  });

  test('does NOT insert when body.success is false', async () => {
    await invoke({}, { success: false, data: { id: 7 } });

    expect(db.query).not.toHaveBeenCalled();
  });

  test('does NOT insert when req.user is null', async () => {
    await invoke({ user: null }, { success: true, data: { id: 7 } });

    expect(db.query).not.toHaveBeenCalled();
  });

  test('does NOT insert when body.success is absent', async () => {
    await invoke({}, { data: { id: 7 } });

    expect(db.query).not.toHaveBeenCalled();
  });

  test('prefers body.data.id as the entityId', async () => {
    await invoke({ params: { id: '99' } }, { success: true, data: { id: 7 } });

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBe(7); // entityId = 7 from body.data.id, not 99 from params
  });

  test('falls back to req.params.id when body.data.id is absent', async () => {
    await invoke({ params: { id: '42' } }, { success: true, data: {} });

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBe(42);
  });

  test('entityId is null when neither body.data.id nor params.id are present', async () => {
    await invoke({ params: {} }, { success: true, data: {} });

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBeNull();
  });

  test('stores JSON-stringified req.body and req.query as metadata', async () => {
    await invoke(
      { body: { title: 'Task' }, query: { foo: 'bar' } },
      { success: true, data: {} }
    );

    const [, params] = db.query.mock.calls[0];
    const metadata = JSON.parse(params[4]);
    expect(metadata.body).toEqual({ title: 'Task' });
    expect(metadata.query).toEqual({ foo: 'bar' });
  });

  test('stores the correct action and entityType', async () => {
    const middleware = auditLog('DELETE', 'note');
    const req = makeReq();
    const res = makeRes();
    middleware(req, res, jest.fn());
    db.query.mockResolvedValue([{}]);
    await res.json({ success: true, data: {} });

    const [, params] = db.query.mock.calls[0];
    expect(params[1]).toBe('DELETE');
    expect(params[2]).toBe('note');
  });

  test('always calls originalJson with the body regardless of success', async () => {
    const middleware = auditLog('CREATE', 'task');
    const req = makeReq();
    const res = makeRes();
    const originalJson = res.json;
    middleware(req, res, jest.fn());

    const body = { success: false };
    await res.json(body);

    expect(originalJson).toHaveBeenCalledWith(body);
  });

  test('does not throw when db.query fails — swallows the error', async () => {
    const middleware = auditLog('CREATE', 'task');
    const req = makeReq();
    const res = makeRes();
    middleware(req, res, jest.fn());
    db.query.mockRejectedValue(new Error('DB down'));

    await expect(res.json({ success: true, data: { id: 1 } })).resolves.not.toThrow();
  });
});
