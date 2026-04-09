import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function completionReportPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <a data-route="/reports" class="text-blue-600 hover:text-blue-800 text-sm cursor-pointer">&larr; Reports</a>
      <h2 class="text-2xl font-bold text-gray-900">Completion Report</h2>
      <div id="completion-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/reports'));
  initLayout();
  loadData();
}

async function loadData() {
  try {
    const res = await api.get('/reports/completion');
    const d = res.data;
    const stats = d.stats || {};
    const perUser = d.perUser || [];
    const container = document.getElementById('completion-content');

    container.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500"><div class="text-2xl font-bold text-blue-600">${stats.total || 0}</div><div class="text-sm text-gray-500">Total Tasks</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-green-500"><div class="text-2xl font-bold text-green-600">${stats.completed || 0}</div><div class="text-sm text-gray-500">Completed</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-amber-500"><div class="text-2xl font-bold text-amber-600">${stats.pending || 0}</div><div class="text-sm text-gray-500">Pending</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-cyan-500"><div class="text-2xl font-bold text-cyan-600">${stats.in_progress || 0}</div><div class="text-sm text-gray-500">In Progress</div></div>
      </div>
      ${perUser.length ? `
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-200"><h3 class="text-sm font-semibold text-gray-500 uppercase">Per User Completion</h3></div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50"><tr>
              <th class="text-left px-4 py-3 font-medium text-gray-500">User</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Total</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Completed</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Rate</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-100">
              ${perUser.map(u => {
                const rate = u.total_tasks > 0 ? Math.round((u.completed / u.total_tasks) * 100) : 0;
                return `<tr class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-medium">${u.name}</td>
                  <td class="text-center px-3 py-3 font-mono">${u.total_tasks}</td>
                  <td class="text-center px-3 py-3 font-mono text-green-600">${u.completed}</td>
                  <td class="px-3 py-3"><div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-blue-600 h-2 rounded-full" style="width:${rate}%"></div></div><div class="text-xs text-gray-400 text-center mt-1">${rate}%</div></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    `;
  } catch (err) {
    document.getElementById('completion-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
