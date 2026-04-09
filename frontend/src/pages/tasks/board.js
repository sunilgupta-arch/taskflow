import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function boardPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">Task Board</h2>
        <a data-route="/tasks/create" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm cursor-pointer">+ New Task</a>
      </div>
      <div id="board-content">
        <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          ${[1,2,3,4].map(() => '<div class="bg-white rounded-lg shadow p-5 animate-pulse"><div class="h-40 bg-gray-200 rounded"></div></div>').join('')}
        </div>
      </div>
    </div>
  `, '/tasks/board'));
  initLayout();
  loadBoard();
}

async function loadBoard() {
  try {
    const res = await api.get('/tasks/board');
    const d = res.data;
    const groups = d.groups || [];
    const container = document.getElementById('board-content');

    if (!groups.length) {
      container.innerHTML = '<div class="text-gray-400 text-center py-8">No tasks on board</div>';
      return;
    }

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        ${groups.map(g => `
          <div class="bg-white rounded-lg shadow">
            <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 class="font-semibold text-sm text-gray-700">${g.user_name || 'Unassigned'}</h3>
              <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">${(g.tasks || []).length}</span>
            </div>
            <div class="p-3 space-y-2 max-h-96 overflow-y-auto">
              ${(g.tasks || []).map(t => taskCard(t)).join('') || '<p class="text-xs text-gray-400 text-center py-4">No tasks</p>'}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    document.getElementById('board-content').innerHTML =
      `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}

function taskCard(t) {
  const priorityColor = { urgent: 'border-red-400', high: 'border-amber-400', medium: 'border-blue-400', low: 'border-gray-300' };
  const statusBadge = {
    pending: 'bg-amber-100 text-amber-600',
    in_progress: 'bg-blue-100 text-blue-600',
    completed: 'bg-green-100 text-green-600',
    active: 'bg-purple-100 text-purple-600',
  };
  const border = priorityColor[t.priority] || 'border-gray-300';
  const badge = statusBadge[t.status] || 'bg-gray-100 text-gray-500';

  return `
    <a data-route="/tasks/${t.id}" class="block p-3 rounded-lg border-l-4 ${border} bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors">
      <div class="font-medium text-sm text-gray-900 mb-1">${t.title}</div>
      <div class="flex items-center gap-2">
        <span class="${badge} px-1.5 py-0.5 rounded text-xs">${(t.status || '').replace('_', ' ')}</span>
        ${t.reward_amount ? `<span class="text-xs font-mono text-amber-600">${parseFloat(t.reward_amount).toFixed(0)} pts</span>` : ''}
        ${t.is_completed_today ? '<span class="text-green-500 text-xs">✓</span>' : ''}
      </div>
    </a>
  `;
}
