import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function rewardsPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <h2 class="text-2xl font-bold text-gray-900">Rewards</h2>
      <div id="rewards-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/rewards'));
  initLayout();
  load();
}

async function load() {
  try {
    const res = await api.get('/rewards');
    const d = res.data;
    const rewards = d.rewards || [];
    const summary = d.summary || {};
    const container = document.getElementById('rewards-content');

    let html = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-amber-500"><div class="text-2xl font-bold text-amber-600">${parseFloat(summary.total || 0).toFixed(0)}</div><div class="text-sm text-gray-500">Total Earned (pts)</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-yellow-500"><div class="text-2xl font-bold text-yellow-600">${parseFloat(summary.pending || 0).toFixed(0)}</div><div class="text-sm text-gray-500">Pending (pts)</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-green-500"><div class="text-2xl font-bold text-green-600">${parseFloat(summary.paid || 0).toFixed(0)}</div><div class="text-sm text-gray-500">Paid Out (pts)</div></div>
      </div>
    `;

    if (rewards.length) {
      html += `
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50"><tr>
                <th class="text-left px-4 py-3 font-medium text-gray-500">Task</th>
                <th class="text-center px-3 py-3 font-medium text-gray-500">Amount</th>
                <th class="text-center px-3 py-3 font-medium text-gray-500">Status</th>
                <th class="text-center px-3 py-3 font-medium text-gray-500">Date</th>
              </tr></thead>
              <tbody class="divide-y divide-gray-100">
                ${rewards.map(r => `<tr class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-medium">${r.task_title || 'Task #' + r.task_id}</td>
                  <td class="text-center px-3 py-3 font-mono text-amber-600">${parseFloat(r.amount || 0).toFixed(0)} pts</td>
                  <td class="text-center px-3 py-3"><span class="${r.is_paid ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'} px-2 py-0.5 rounded text-xs">${r.is_paid ? 'Paid' : 'Pending'}</span></td>
                  <td class="text-center px-3 py-3 text-xs text-gray-500">${r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    container.innerHTML = html || '<div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">No rewards yet</div>';
  } catch (err) {
    document.getElementById('rewards-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
