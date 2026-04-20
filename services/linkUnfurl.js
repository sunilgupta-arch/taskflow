// Lightweight OG/meta unfurler for Group Channel link previews.
// In-memory cache with 24h TTL. Basic SSRF guard for obvious internal hosts.

const cache = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 500 * 1024; // 500KB cap
const TIMEOUT_MS = 4000;

const PRIVATE_HOST_RE = /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.0\.0\.0$|::1$|fc|fd)/i;

function isSafeUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (PRIVATE_HOST_RE.test(host)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function extractMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp('<meta[^>]+(?:property|name)=["\\\']' + escaped + '["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\']', 'i'),
    new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+(?:property|name)=["\\\']' + escaped + '["\\\']', 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function decodeHtmlEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

async function unfurl(urlStr) {
  if (!isSafeUrl(urlStr)) return null;

  const cached = cache.get(urlStr);
  if (cached && (Date.now() - cached.at) < TTL_MS) return cached.data;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(urlStr, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'TaskFlow-LinkPreview/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!resp.ok) return null;
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null;

    // Read up to MAX_BYTES
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (received >= MAX_BYTES) break;
    }
    try { reader.cancel(); } catch (_) {}
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const html = decoder.decode(Buffer.concat(chunks.map(c => Buffer.from(c))));

    const title = decodeHtmlEntities(extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title') || extractTitle(html));
    const description = decodeHtmlEntities(extractMeta(html, 'og:description') || extractMeta(html, 'twitter:description') || extractMeta(html, 'description'));
    let image = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image');
    if (image) {
      try { image = new URL(image, urlStr).toString(); } catch (_) {}
    }
    const site_name = decodeHtmlEntities(extractMeta(html, 'og:site_name')) || new URL(urlStr).hostname;

    if (!title && !description && !image) { cache.set(urlStr, { at: Date.now(), data: null }); return null; }

    const data = {
      url: urlStr,
      title: (title || '').substring(0, 200),
      description: (description || '').substring(0, 300),
      image: (image || '').substring(0, 500),
      site_name: (site_name || '').substring(0, 100),
    };
    cache.set(urlStr, { at: Date.now(), data });
    return data;
  } catch (_) {
    cache.set(urlStr, { at: Date.now(), data: null });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { unfurl };
