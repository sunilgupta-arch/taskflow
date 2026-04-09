import { renderPage } from '../../utils/render.js';
import { isLoggedIn } from '../../utils/auth.js';

export function notFoundPage({ path }) {
  renderPage(`
    <div class="min-h-screen bg-gray-50 flex items-center justify-center">
      <div class="text-center">
        <h1 class="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <p class="text-lg text-gray-600 mb-6">Page not found: ${path || ''}</p>
        <a data-route="${isLoggedIn() ? '/tasks/board' : '/login'}"
           class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg cursor-pointer inline-block">
          Go Home
        </a>
      </div>
    </div>
  `);
}
