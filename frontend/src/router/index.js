/**
 * Simple hash-based SPA router for vanilla JS.
 * Usage:
 *   router.on('/tasks', taskPage)
 *   router.on('/tasks/:id', taskDetailPage)
 *   router.start()
 */

class Router {
  constructor() {
    this.routes = [];
    this.beforeEach = null;
    this.notFound = null;
  }

  on(path, handler, meta = {}) {
    const paramNames = [];
    const pattern = path.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this.routes.push({
      path,
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      handler,
      meta,
    });
    return this;
  }

  resolve() {
    const hash = window.location.hash.slice(1) || '/';
    const [fullPath, queryString] = hash.split('?');
    const query = Object.fromEntries(new URLSearchParams(queryString || ''));

    for (const route of this.routes) {
      const match = fullPath.match(route.pattern);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });

        if (this.beforeEach) {
          const allowed = this.beforeEach(route, params, query);
          if (allowed === false) return;
        }

        route.handler({ params, query, path: fullPath, meta: route.meta });
        return;
      }
    }

    if (this.notFound) this.notFound({ path: fullPath, query });
  }

  navigate(path) {
    window.location.hash = path;
  }

  start() {
    window.addEventListener('hashchange', () => this.resolve());
    // Handle link clicks with data-route attribute
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-route]');
      if (link) {
        e.preventDefault();
        this.navigate(link.getAttribute('data-route'));
      }
    });
    this.resolve();
  }
}

export const router = new Router();
export default router;
