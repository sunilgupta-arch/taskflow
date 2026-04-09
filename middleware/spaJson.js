/**
 * SPA JSON Middleware
 * When the frontend sends X-SPA-Request header, override res.render()
 * to return the template data as JSON instead of rendering EJS.
 * This lets the Vite frontend consume ALL existing routes without
 * changing any controller code.
 */
function spaJson(req, res, next) {
  if (req.headers['x-spa-request']) {
    const originalRender = res.render.bind(res);
    res.render = function (view, data = {}) {
      // Strip non-serializable/internal fields
      const { layout, settings, _locals, cache, ...cleanData } = data;
      return res.json({ success: true, view, data: cleanData });
    };
  }
  next();
}

module.exports = spaJson;
