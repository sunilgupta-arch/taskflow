import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function punctualityReportPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <a data-route="/reports" class="text-blue-600 hover:text-blue-800 text-sm cursor-pointer">&larr; Reports</a>
      <h2 class="text-2xl font-bold text-gray-900">Punctuality Report</h2>
      <div id="punct-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/reports'));
  initLayout();
  load();
}

async function load() {
  try {
    const res = await api.get('/reports/punctuality');
    const d = res.data;
    const users = d.users || d.punctuality || [];
    const container = document.getElementById('punct-content');

    if (!users.length) {
      container.innerHTML = '<div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">No data available</div>';
      return;
    }

    container.innerHTML = `
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50"><tr>
              <th class="text-left px-4 py-3 font-medium text-gray-500">User</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Total Days</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">On Time</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Late</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Punctuality %</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-100">
              ${users.map(u => {
                const rate = u.total_days > 0 ? Math.round((u.on_time / u.total_days) * 100) : 0;
                return `<tr class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-medium">${u.name}</td>
                  <td class="text-center px-3 py-3 font-mono">${u.total_days || 0}</td>
                  <td class="text-center px-3 py-3 font-mono text-green-600">${u.on_time || 0}</td>
                  <td class="text-center px-3 py-3 font-mono text-red-600">${u.late || 0}</td>
                  <td class="px-3 py-3"><div class="w-full bg-gray-200 rounded-full h-2"><div class="${rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500'} h-2 rounded-full" style="width:${rate}%"></div></div><div class="text-xs text-gray-400 text-center mt-1">${rate}%</div></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('punct-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
