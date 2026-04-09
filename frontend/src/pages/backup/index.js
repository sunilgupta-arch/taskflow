import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function backupPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">Backups</h2>
        <button id="create-backup-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">Create Backup</button>
      </div>
      <div id="backup-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/backups'));
  initLayout();
  load();

  document.getElementById('create-backup-btn').addEventListener('click', async () => {
    try {
      await api.post('/backups/create');
      load();
    } catch (err) { alert(err.message); }
  });
}

async function load() {
  try {
    const res = await api.get('/backups');
    const d = res.data;
    const backups = d.backups || [];
    const container = document.getElementById('backup-content');

    if (!backups.length) {
      container.innerHTML = '<div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">No backups yet</div>';
      return;
    }

    container.innerHTML = `
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50"><tr>
              <th class="text-left px-4 py-3 font-medium text-gray-500">Filename</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Size</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Created</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Actions</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-100">
              ${backups.map(b => `<tr class="hover:bg-gray-50">
                <td class="px-4 py-3 font-mono text-sm">${b.filename}</td>
                <td class="text-center px-3 py-3 text-xs text-gray-500">${b.size || '—'}</td>
                <td class="text-center px-3 py-3 text-xs text-gray-500">${b.created_at ? new Date(b.created_at).toLocaleString() : ''}</td>
                <td class="text-center px-3 py-3">
                  <a href="/backups/download/${b.id}" class="text-blue-600 text-xs hover:underline">Download</a>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('backup-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
