import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function rewardsReportPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <a data-route="/reports" class="text-blue-600 hover:text-blue-800 text-sm cursor-pointer">&larr; Reports</a>
      <h2 class="text-2xl font-bold text-gray-900">Rewards Report</h2>
      <div id="rr-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/reports'));
  initLayout();
  load();
}

async function load() {
  try {
    const res = await api.get('/reports/rewards');
    const d = res.data;
    const summary = d.summary || {};
    const perUser = d.perUser || [];
    const container = document.getElementById('rr-content');

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-amber-500"><div class="text-2xl font-bold text-amber-600">${parseFloat(summary.total || 0).toFixed(0)}</div><div class="text-sm text-gray-500">Total Earned (pts)</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-yellow-500"><div class="text-2xl font-bold text-yellow-600">${parseFloat(summary.pending || 0).toFixed(0)}</div><div class="text-sm text-gray-500">Pending (pts)</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-green-500"><div class="text-2xl font-bold text-green-600">${parseFloat(summary.paid || 0).toFixed(0)}</div><div class="text-sm text-gray-500">Paid Out (pts)</div></div>
      </div>
      ${perUser.length ? `
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50"><tr>
              <th class="text-left px-4 py-3 font-medium text-gray-500">User</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Total Earned</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Pending</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Paid</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-100">
              ${perUser.map(u => `<tr class="hover:bg-gray-50">
                <td class="px-4 py-3 font-medium">${u.name}</td>
                <td class="text-center px-3 py-3 font-mono text-amber-600">${parseFloat(u.total_earned || 0).toFixed(0)}</td>
                <td class="text-center px-3 py-3 font-mono text-yellow-600">${parseFloat(u.pending || 0).toFixed(0)}</td>
                <td class="text-center px-3 py-3 font-mono text-green-600">${parseFloat(u.paid || 0).toFixed(0)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    `;
  } catch (err) {
    document.getElementById('rr-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
