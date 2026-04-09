import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import { isAdminOrManager } from '../../utils/auth.js';
import api from '../../api/index.js';

export function leavesPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">Leave Management</h2>
        <button id="apply-leave-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">Apply for Leave</button>
      </div>
      <div id="leaves-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/leaves'));
  initLayout();
  load();
}

async function load() {
  try {
    const res = await api.get('/leaves');
    const d = res.data;
    const requests = d.leaveRequests || d.requests || [];
    const container = document.getElementById('leaves-content');

    const statusStyle = { approved: 'bg-green-100 text-green-600', rejected: 'bg-red-100 text-red-600', pending: 'bg-amber-100 text-amber-600' };

    container.innerHTML = `
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50"><tr>
              ${isAdminOrManager() ? '<th class="text-left px-4 py-3 font-medium text-gray-500">User</th>' : ''}
              <th class="text-center px-3 py-3 font-medium text-gray-500">From</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">To</th>
              <th class="text-left px-3 py-3 font-medium text-gray-500">Reason</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Status</th>
              ${isAdminOrManager() ? '<th class="text-center px-3 py-3 font-medium text-gray-500">Actions</th>' : ''}
            </tr></thead>
            <tbody class="divide-y divide-gray-100">
              ${requests.length ? requests.map(r => {
                const ss = statusStyle[r.status] || statusStyle.pending;
                return `<tr class="hover:bg-gray-50">
                  ${isAdminOrManager() ? `<td class="px-4 py-3 font-medium">${r.user_name || ''}</td>` : ''}
                  <td class="text-center px-3 py-3 text-xs">${r.from_date ? new Date(r.from_date).toLocaleDateString() : ''}</td>
                  <td class="text-center px-3 py-3 text-xs">${r.to_date ? new Date(r.to_date).toLocaleDateString() : ''}</td>
                  <td class="px-3 py-3 text-sm text-gray-600">${r.reason || ''}</td>
                  <td class="text-center px-3 py-3"><span class="${ss} px-2 py-0.5 rounded text-xs">${r.status}</span></td>
                  ${isAdminOrManager() && r.status === 'pending' ? `
                    <td class="text-center px-3 py-3">
                      <button onclick="handleLeave(${r.id}, 'approve')" class="text-green-600 text-xs hover:underline mr-2">Approve</button>
                      <button onclick="handleLeave(${r.id}, 'reject')" class="text-red-600 text-xs hover:underline">Reject</button>
                    </td>` : (isAdminOrManager() ? '<td></td>' : '')}
                </tr>`;
              }).join('') : `<tr><td colspan="6" class="text-center text-gray-400 py-6">No leave requests</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('leaves-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
