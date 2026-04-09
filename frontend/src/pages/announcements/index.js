import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import { isAdmin, hasRole } from '../../utils/auth.js';
import api from '../../api/index.js';

export function announcementsPage() {
  const canCreate = isAdmin() || hasRole('CLIENT_MANAGER');
  renderPage(layout(`
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">Announcements</h2>
        ${canCreate ? '<button id="add-ann-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">+ New Announcement</button>' : ''}
      </div>
      <div id="ann-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/announcements'));
  initLayout();
  load();
}

async function load() {
  try {
    const res = await api.get('/announcements');
    const d = res.data;
    const items = d.announcements || [];
    const container = document.getElementById('ann-content');

    if (!items.length) {
      container.innerHTML = '<div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">No announcements</div>';
      return;
    }

    container.innerHTML = `<div class="space-y-4">${items.map(a => `
      <div class="bg-white rounded-lg shadow p-5 ${a.is_pinned ? 'border-l-4 border-amber-400' : ''}">
        <div class="flex items-start justify-between">
          <div>
            ${a.is_pinned ? '<span class="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded mb-2 inline-block">Pinned</span>' : ''}
            <p class="text-gray-900">${a.content || a.message || ''}</p>
            <div class="text-xs text-gray-400 mt-2">
              ${a.author_name || ''} · ${a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}
              · <span class="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">${a.audience || 'all'}</span>
            </div>
          </div>
        </div>
      </div>
    `).join('')}</div>`;
  } catch (err) {
    document.getElementById('ann-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
