/**
 * API service — wraps fetch with auth token handling, JSON parsing, and error handling.
 * Sends X-SPA-Request header so backend returns JSON instead of rendered EJS.
 */

async function request(url, options = {}) {
  const opts = {
    headers: {
      'Content-Type': 'application/json',
      'X-SPA-Request': '1',
      ...options.headers,
    },
    credentials: 'include',
    ...options,
  };

  // Don't set Content-Type for FormData (browser sets boundary)
  if (opts.body instanceof FormData) {
    delete opts.headers['Content-Type'];
  }

  const res = await fetch(url, opts);

  // Handle auth redirects — backend may redirect to /auth/login
  if (res.redirected && res.url.includes('/auth/login')) {
    window.location.hash = '/login';
    throw new Error('Unauthorized');
  }

  if (res.status === 401) {
    window.location.hash = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Request failed');
  }

  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json();
  }
  return res;
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
  put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (url, body) => request(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (url) => request(url, { method: 'DELETE' }),
  upload: (url, formData) => request(url, { method: 'POST', body: formData }),
};

export default api;
