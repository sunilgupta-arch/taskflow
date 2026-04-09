/**
 * Render helper — sets innerHTML of a target element.
 * Each page function returns an HTML string; this wires it into the DOM.
 */

export function renderPage(html) {
  const app = document.getElementById('app');
  app.innerHTML = html;
}

export function renderInto(selector, html) {
  const el = document.querySelector(selector);
  if (el) el.innerHTML = html;
}

/**
 * Mount a page: render layout + page content, then run an optional init function.
 */
export async function mount(pageModule, ctx) {
  const html = typeof pageModule.template === 'function'
    ? await pageModule.template(ctx)
    : pageModule.template;
  renderPage(html);
  if (pageModule.init) await pageModule.init(ctx);
}
