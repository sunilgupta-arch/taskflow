import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function workloadReportPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <a data-route="/reports" class="text-blue-600 hover:text-blue-800 text-sm cursor-pointer">&larr; Reports</a>
      <h2 class="text-2xl font-bold text-gray-900">Workload Report</h2>
      <div id="wl-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/reports'));
  initLayout();
  load();
}

async function load() {
  try {
    const res = await api.get('/reports/workload');
    const d = res.data;
    const users = d.workload || d.users || [];
    const container = document.getElementById('wl-content');

    if (!users.length) {
      container.innerHTML = '<div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">No data available</div>';
      return;
    }

    const maxTasks = Math.max(...users.map(u => u.total_tasks || 0), 1);

    container.innerHTML = `
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50"><tr>
              <th class="text-left px-4 py-3 font-medium text-gray-500">User</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Total</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Active</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Completed</th>
              <th class="px-3 py-3 font-medium text-gray-500">Load</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-100">
              ${users.map(u => {
                const pct = Math.round(((u.total_tasks || 0) / maxTasks) * 100);
                return `<tr class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-medium">${u.name}</td>
                  <td class="text-center px-3 py-3 font-mono">${u.total_tasks || 0}</td>
                  <td class="text-center px-3 py-3 font-mono text-blue-600">${u.active || u.in_progress || 0}</td>
                  <td class="text-center px-3 py-3 font-mono text-green-600">${u.completed || 0}</td>
                  <td class="px-3 py-3 w-48"><div class="w-full bg-gray-200 rounded-full h-3"><div class="bg-blue-500 h-3 rounded-full" style="width:${pct}%"></div></div></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('wl-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
