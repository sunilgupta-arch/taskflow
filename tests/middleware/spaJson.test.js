const spaJson = require('../../middleware/spaJson');

function makeReq(headers = {}) {
  return { headers };
}

function makeRes() {
  const res = {};
  res.render = jest.fn();
  res.json   = jest.fn();
  return res;
}

// ── without X-SPA-Request header ─────────────────────────────────────────────

describe('spaJson — header absent', () => {
  test('calls next()', () => {
    const req  = makeReq({});
    const res  = makeRes();
    const next = jest.fn();

    spaJson(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('does not replace res.render', () => {
    const req     = makeReq({});
    const res     = makeRes();
    const origRender = res.render;
    const next    = jest.fn();

    spaJson(req, res, next);

    expect(res.render).toBe(origRender);
  });
});

// ── with X-SPA-Request header ─────────────────────────────────────────────────

describe('spaJson — header present', () => {
  test('still calls next()', () => {
    const req  = makeReq({ 'x-spa-request': '1' });
    const res  = makeRes();
    const next = jest.fn();

    spaJson(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('replaces res.render with a JSON-returning function', () => {
    const req  = makeReq({ 'x-spa-request': '1' });
    const res  = makeRes();

    spaJson(req, res, jest.fn());

    expect(res.render).not.toBe(undefined);
    spaJson(req, res, jest.fn()); // idempotent check — still replaces
  });

  test('res.render sends { success, view, data } via res.json', () => {
    const req = makeReq({ 'x-spa-request': '1' });
    const res = makeRes();

    spaJson(req, res, jest.fn());
    res.render('admin/dashboard', { title: 'Hello', user: { id: 1 } });

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      view: 'admin/dashboard',
      data: { title: 'Hello', user: { id: 1 } },
    });
  });

  test('strips layout from data', () => {
    const req = makeReq({ 'x-spa-request': '1' });
    const res = makeRes();

    spaJson(req, res, jest.fn());
    res.render('view', { layout: 'main', title: 'Page' });

    const [{ data }] = res.json.mock.calls[0];
    expect(data).not.toHaveProperty('layout');
    expect(data.title).toBe('Page');
  });

  test('strips settings, _locals, and cache from data', () => {
    const req = makeReq({ 'x-spa-request': '1' });
    const res = makeRes();

    spaJson(req, res, jest.fn());
    res.render('view', { settings: {}, _locals: {}, cache: true, key: 'value' });

    const [{ data }] = res.json.mock.calls[0];
    expect(data).not.toHaveProperty('settings');
    expect(data).not.toHaveProperty('_locals');
    expect(data).not.toHaveProperty('cache');
    expect(data.key).toBe('value');
  });

  test('works with an empty data object', () => {
    const req = makeReq({ 'x-spa-request': '1' });
    const res = makeRes();

    spaJson(req, res, jest.fn());
    res.render('view');

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      view: 'view',
      data: {},
    });
  });

  test('passes the correct view name through', () => {
    const req = makeReq({ 'x-spa-request': '1' });
    const res = makeRes();

    spaJson(req, res, jest.fn());
    res.render('portal/tasks', {});

    const [payload] = res.json.mock.calls[0];
    expect(payload.view).toBe('portal/tasks');
  });
});
