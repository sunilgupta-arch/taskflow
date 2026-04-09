import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function myTasksPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <h2 class="text-2xl font-bold text-gray-900">My Tasks</h2>
      <div id="my-tasks-content" class="bg-white rounded-lg shadow overflow-hidden">
        <div class="p-8 text-center text-gray-400">Loading...</div>
      </div>
    </div>
  `, '/tasks/my'));
  initLayout();
  loadMyTasks();
}

async function loadMyTasks() {
  try {
    const res = await api.get('/tasks/my');
    const d = res.data;
    const tasks = d.tasks || [];
    const container = document.getElementById('my-tasks-content');

    if (!tasks.length) {
      container.innerHTML = '<div class="p-8 text-center text-gray-400">No tasks assigned to you</div>';
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="text-left px-4 py-3 font-medium text-gray-500">Task</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Type</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Priority</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Status</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Reward</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${tasks.map(t => {
              const isDone = t.is_completed_today;
              const isStarted = t.is_started_today;
              let statusHtml;
              if (isDone) statusHtml = '<span class="bg-green-100 text-green-600 px-2 py-0.5 rounded text-xs">Done</span>';
              else if (isStarted) statusHtml = '<span class="bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-xs">In Progress</span>';
              else statusHtml = `<span class="bg-amber-100 text-amber-600 px-2 py-0.5 rounded text-xs">${(t.status || 'pending').replace('_', ' ')}</span>`;

              return `
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-3"><a data-route="/tasks/${t.id}" class="font-medium text-gray-900 cursor-pointer hover:text-blue-600">${t.title}</a></td>
                <td class="text-center px-3 py-3"><span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">${t.type}</span></td>
                <td class="text-center px-3 py-3"><span class="bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-xs">${(t.priority || 'medium').toUpperCase()}</span></td>
                <td class="text-center px-3 py-3">${statusHtml}</td>
                <td class="text-center px-3 py-3 font-mono text-amber-600 text-xs">${t.reward_amount ? parseFloat(t.reward_amount).toFixed(0) + ' pts' : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    document.getElementById('my-tasks-content').innerHTML =
      `<div class="p-4 text-red-500">${err.message}</div>`;
  }
}
