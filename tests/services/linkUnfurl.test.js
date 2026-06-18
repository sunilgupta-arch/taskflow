// linkUnfurl uses an in-memory cache; use distinct URLs per test to avoid cross-test contamination.
const { unfurl } = require('../../services/linkUnfurl');

function mockGlobalFetch({ ok = true, contentType = 'text/html; charset=utf-8', html = '' } = {}) {
  const buf = Buffer.from(html, 'utf-8');
  let readCalled = false;
  const reader = {
    read: jest.fn().mockImplementation(async () => {
      if (!readCalled) {
        readCalled = true;
        return { done: false, value: new Uint8Array(buf) };
      }
      return { done: true, value: undefined };
    }),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    headers: { get: jest.fn().mockReturnValue(contentType) },
    body: { getReader: jest.fn().mockReturnValue(reader) },
  });
}

// ── SSRF guard — no fetch should be called ────────────────────────────────────

describe('unfurl — SSRF guard', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test('blocks localhost', async () => {
    expect(await unfurl('http://localhost/page')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('blocks 127.x.x.x loopback', async () => {
    expect(await unfurl('http://127.0.0.1/')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('blocks 192.168.x.x private range', async () => {
    expect(await unfurl('http://192.168.1.100/path')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('blocks 10.x.x.x private range', async () => {
    expect(await unfurl('http://10.0.0.1/page')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('blocks ftp:// protocol', async () => {
    expect(await unfurl('ftp://example.com/file')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns null for a malformed URL', async () => {
    expect(await unfurl('not-a-url')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns null for an empty string', async () => {
    expect(await unfurl('')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── fetch failure paths ───────────────────────────────────────────────────────

describe('unfurl — fetch failures', () => {
  test('returns null when fetch response is not ok', async () => {
    mockGlobalFetch({ ok: false, html: '' });

    const result = await unfurl('http://example.com/u1-not-ok');

    expect(result).toBeNull();
  });

  test('returns null when content-type is JSON', async () => {
    mockGlobalFetch({ ok: true, contentType: 'application/json', html: '{}' });

    const result = await unfurl('http://example.com/u2-json');

    expect(result).toBeNull();
  });

  test('returns null when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await unfurl('http://example.com/u3-throws');

    expect(result).toBeNull();
  });

  test('returns null when HTML has no title, description, or image', async () => {
    mockGlobalFetch({ html: '<html><body>Hello</body></html>' });

    const result = await unfurl('http://example.com/u4-no-meta');

    expect(result).toBeNull();
  });
});

// ── successful extraction ─────────────────────────────────────────────────────

describe('unfurl — successful extraction', () => {
  test('extracts og:title', async () => {
    mockGlobalFetch({
      html: `<html><head>
        <meta property="og:title" content="My Article" />
        <meta property="og:description" content="A great read" />
      </head></html>`,
    });

    const result = await unfurl('http://example.com/u5-og-title');

    expect(result).not.toBeNull();
    expect(result.title).toBe('My Article');
    expect(result.description).toBe('A great read');
  });

  test('falls back to <title> tag when no og:title', async () => {
    mockGlobalFetch({
      html: `<html><head><title>Page Title</title>
        <meta name="description" content="Short desc" />
      </head></html>`,
    });

    const result = await unfurl('http://example.com/u6-title-tag');

    expect(result).not.toBeNull();
    expect(result.title).toBe('Page Title');
  });

  test('falls back to hostname for site_name when og:site_name is absent', async () => {
    mockGlobalFetch({
      html: '<html><head><title>Hello</title></head></html>',
    });

    const result = await unfurl('http://example.com/u7-site-name');

    expect(result.site_name).toBe('example.com');
  });

  test('uses og:site_name when present', async () => {
    mockGlobalFetch({
      html: `<html><head>
        <title>T</title>
        <meta property="og:site_name" content="My Site" />
      </head></html>`,
    });

    const result = await unfurl('http://example.com/u8-site-name-og');

    expect(result.site_name).toBe('My Site');
  });

  test('decodes HTML entities in title', async () => {
    mockGlobalFetch({
      html: `<html><head>
        <meta property="og:title" content="Rock &amp; Roll &lt;3&gt;" />
        <meta property="og:description" content="desc" />
      </head></html>`,
    });

    const result = await unfurl('http://example.com/u9-entities');

    expect(result.title).toBe('Rock & Roll <3>');
  });

  test('extracts og:image', async () => {
    mockGlobalFetch({
      html: `<html><head>
        <meta property="og:title" content="T" />
        <meta property="og:image" content="/img/banner.jpg" />
      </head></html>`,
    });

    const result = await unfurl('http://example.com/u10-image');

    expect(result.image).toContain('example.com');
  });

  test('returns object with url, title, description, image, site_name keys', async () => {
    mockGlobalFetch({
      html: `<html><head>
        <title>Home</title>
        <meta name="description" content="Welcome" />
      </head></html>`,
    });

    const result = await unfurl('http://example.com/u11-shape');

    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('image');
    expect(result).toHaveProperty('site_name');
    expect(result.url).toBe('http://example.com/u11-shape');
  });
});

// ── cache behaviour ───────────────────────────────────────────────────────────

describe('unfurl — cache', () => {
  test('second call to same URL returns cached data without re-fetching', async () => {
    mockGlobalFetch({ html: '<html><head><title>Cached</title><meta name="description" content="d" /></head></html>' });

    const first  = await unfurl('http://example.com/cache-hit-url');
    const second = await unfurl('http://example.com/cache-hit-url');

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('caches null results and does not re-fetch for no-meta pages', async () => {
    mockGlobalFetch({ html: '<html><body>nothing</body></html>' });

    const first  = await unfurl('http://example.com/cache-null-url');
    const second = await unfurl('http://example.com/cache-null-url');

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
