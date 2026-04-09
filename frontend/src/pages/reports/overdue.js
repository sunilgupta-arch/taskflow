import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function overdueReportPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <a data-route="/reports" class="text-blue-600 hover:text-blue-800 text-sm cursor-pointer">&larr; Reports</a>
      <h2 class="text-2xl font-bold text-gray-900">Overdue Report</h2>
      <div id="overdue-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/reports'));
  initLayout();
  load();
}

async function load() {
  try {
    const res = await api.get('/reports/overdue');
    const d = res.data;
    const tasks = d.overdueTasks || d.tasks || [];
    const container = document.getElementById('overdue-content');

    if (!tasks.length) {
      container.innerHTML = '<div class="bg-white rounded-lg shadow p-8 text-center text-green-600">No overdue tasks!</div>';
      return;
    }

    container.innerHTML = `
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50"><tr>
              <th class="text-left px-4 py-3 font-medium text-gray-500">Task</th>
              <th class="text-left px-3 py-3 font-medium text-gray-500">Assigned To</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Due Date</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Days Overdue</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Priority</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-100">
              ${tasks.map(t => `
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-3"><a data-route="/tasks/${t.id}" class="font-medium text-gray-900 cursor-pointer hover:text-blue-600">${t.title}</a></td>
                  <td class="px-3 py-3 text-gray-600">${t.assigned_to_name || '—'}</td>
                  <td class="text-center px-3 py-3 text-red-600 text-xs">${t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}</td>
                  <td class="text-center px-3 py-3 font-mono text-red-600">${t.days_overdue || '—'}</td>
                  <td class="text-center px-3 py-3"><span class="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs">${(t.priority || '').toUpperCase()}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('overdue-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
