import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function drivePage() {
  renderPage(layout(`
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">Drive</h2>
        <div class="flex gap-2">
          <button id="upload-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">Upload</button>
          <button id="new-folder-btn" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm">New Folder</button>
        </div>
      </div>
      <div id="drive-content" class="bg-white rounded-lg shadow overflow-hidden">
        <div class="p-8 text-center text-gray-400">Loading files...</div>
      </div>
    </div>
  `, '/drive'));
  initLayout();
  loadFiles();
}

async function loadFiles() {
  try {
    const res = await api.get('/drive');
    const d = res.data;
    const files = d.files || [];
    const container = document.getElementById('drive-content');

    if (!files.length) {
      container.innerHTML = '<div class="p-8 text-center text-gray-400">No files yet. Upload something!</div>';
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="text-left px-4 py-3 font-medium text-gray-500">Name</th>
              <th class="text-left px-3 py-3 font-medium text-gray-500">Type</th>
              <th class="text-right px-3 py-3 font-medium text-gray-500">Size</th>
              <th class="text-right px-4 py-3 font-medium text-gray-500">Modified</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${files.map(f => `
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <span>${f.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄'}</span>
                    <span class="font-medium text-gray-900">${f.name}</span>
                  </div>
                </td>
                <td class="px-3 py-3 text-gray-500 text-xs">${(f.mimeType || '').split('/').pop() || '—'}</td>
                <td class="px-3 py-3 text-right text-gray-500 text-xs">${f.size ? formatBytes(f.size) : '—'}</td>
                <td class="px-4 py-3 text-right text-gray-500 text-xs">${f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    document.getElementById('drive-content').innerHTML =
      `<div class="p-4 text-red-500">${err.message}</div>`;
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
