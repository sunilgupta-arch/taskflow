const logger = require('../utils/logger');

const BLOCKED_UA = [
  /python-requests/i,
  /python-urllib/i,
  /aiohttp/i,
  /httpx/i,
  /curl\//i,
  /wget\//i,
  /go-http-client/i,
  /java\/\d/i,
  /apache-httpclient/i,
  /httpie/i,
];

function botDetect(req, res, next) {
  const ua = req.headers['user-agent'] || '';
  const origin = req.headers['origin'];
  const secFetchSite = req.headers['sec-fetch-site'];
  const email = req.body?.email || '(unknown)';

  const block = (reason) => {
    logger.warn(`[SECURITY] Login blocked — ${reason}`, {
      ip: req.ip,
      email,
      ua: ua || '(none)',
      origin: origin || '(none)',
      secFetchSite: secFetchSite || '(none)',
    });
    return res.status(403).json({
      success: false,
      message: 'Automated login is not permitted. Please use the login page.'
    });
  };

  // Block known scripting library User-Agents
  if (BLOCKED_UA.some(p => p.test(ua))) return block('bot User-Agent');

  // Origin must match this server when present (axios always sends it for same-origin POSTs)
  if (origin) {
    const expected = `${req.protocol}://${req.get('host')}`;
    if (origin !== expected) return block(`origin mismatch: got ${origin}, expected ${expected}`);
  }

  // Sec-Fetch-Site is a browser-enforced header; if present it must be same-origin
  if (secFetchSite && secFetchSite !== 'same-origin') {
    return block(`Sec-Fetch-Site is "${secFetchSite}"`);
  }

  next();
}

module.exports = botDetect;
