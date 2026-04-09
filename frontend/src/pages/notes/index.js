import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function notesPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">Notes</h2>
        <button id="add-note-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">+ New Note</button>
      </div>
      <div id="notes-content" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="bg-white rounded-lg shadow p-5 animate-pulse"><div class="h-24 bg-gray-200 rounded"></div></div>
      </div>
    </div>
  `, '/notes'));
  initLayout();
  loadNotes();
}

async function loadNotes() {
  try {
    const res = await api.get('/notes');
    const notes = res.data?.notes || [];
    const container = document.getElementById('notes-content');

    if (!notes.length) {
      container.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">No notes yet</div>';
      return;
    }

    container.innerHTML = notes.map(n => `
      <div class="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow">
        <h3 class="font-semibold text-gray-900 mb-2">${n.title || 'Untitled'}</h3>
        <p class="text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">${n.content || ''}</p>
        <div class="text-xs text-gray-400 mt-3">${n.updated_at ? new Date(n.updated_at).toLocaleDateString() : ''}</div>
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('notes-content').innerHTML =
      `<div class="col-span-full text-red-500">${err.message}</div>`;
  }
}
