/**
 * Loader for config/portalDefaultLinks.json — the developer-managed default
 * links shown on the CLIENT portal Links page.
 *
 * The file is re-read whenever its mtime changes, so editing the JSON takes
 * effect without a server restart. A broken or missing file is logged and
 * treated as empty; it never throws at the call site.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const FILE = path.join(__dirname, 'portalDefaultLinks.json');

// Matches the swatches offered in the Add Link modal (portal/views/portal/reports.ejs)
const VALID_COLORS = ['blue', 'green', 'red', 'amber', 'purple', 'pink', 'cyan'];

let cache = null;
let cachedMtime = 0;

function slug(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}

function normalize(raw) {
  const out = {};
  for (const [role, list] of Object.entries(raw || {})) {
    if (role.startsWith('_')) continue;          // _readme and friends
    if (!Array.isArray(list)) {
      logger.warn(`portalDefaultLinks: "${role}" is not an array — ignored`);
      continue;
    }
    out[role] = [];
    list.forEach((item, i) => {
      const name = ((item && item.name) || '').trim();
      const url = ((item && item.url) || '').trim();
      if (!name || !url) {
        logger.warn(`portalDefaultLinks: ${role}[${i}] skipped — name and url are both required`);
        return;
      }
      out[role].push({
        key: (item.key && String(item.key).trim()) || `${role}:${slug(name)}`,
        name,
        url,
        color: VALID_COLORS.includes(item.color) ? item.color : 'blue'
      });
    });
  }
  return out;
}

function load() {
  try {
    const mtime = fs.statSync(FILE).mtimeMs;
    if (cache && mtime === cachedMtime) return cache;
    cache = normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')));
    cachedMtime = mtime;
  } catch (err) {
    logger.error(`portalDefaultLinks: could not load ${FILE} — ${err.message}`);
    if (!cache) cache = {};
  }
  return cache;
}

/** Defaults for one role: the ALL bucket first, then the role's own. */
function getDefaultLinksForRole(roleName) {
  const all = load();
  return [...(all.ALL || []), ...(all[roleName] || [])];
}

module.exports = { getDefaultLinksForRole, slug };
