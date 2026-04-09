import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function usersPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">User Management</h2>
        <button id="add-user-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">+ Add User</button>
      </div>
      <div id="users-content" class="bg-white rounded-lg shadow overflow-hidden">
        <div class="p-8 text-center text-gray-400">Loading users...</div>
      </div>
    </div>
  `, '/users'));
  initLayout();
  loadUsers();
}

async function loadUsers() {
  try {
    const res = await api.get('/users');
    const d = res.data;
    const users = d.users || [];
    const container = document.getElementById('users-content');

    if (!users.length) {
      container.innerHTML = '<div class="p-8 text-center text-gray-400">No users found</div>';
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50"><tr>
            <th class="text-left px-4 py-3 font-medium text-gray-500">Name</th>
            <th class="text-left px-3 py-3 font-medium text-gray-500">Email</th>
            <th class="text-center px-3 py-3 font-medium text-gray-500">Role</th>
            <th class="text-center px-3 py-3 font-medium text-gray-500">Shift</th>
            <th class="text-center px-3 py-3 font-medium text-gray-500">Off Day</th>
            <th class="text-center px-3 py-3 font-medium text-gray-500">Status</th>
            <th class="text-center px-3 py-3 font-medium text-gray-500">Actions</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-100">
            ${users.map(u => `
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-900">${u.name}</td>
                <td class="px-3 py-3 text-gray-600">${u.email}</td>
                <td class="text-center px-3 py-3"><span class="bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-xs">${u.role_name}</span></td>
                <td class="text-center px-3 py-3 text-xs font-mono">${u.shift_start ? u.shift_start.substring(0, 5) : '—'} (${u.shift_hours || 0}h)</td>
                <td class="text-center px-3 py-3 text-xs">${u.weekly_off_day || '—'}</td>
                <td class="text-center px-3 py-3">
                  <span class="${u.is_active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'} px-2 py-0.5 rounded text-xs">${u.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                <td class="text-center px-3 py-3">
                  <a data-route="/users/${u.id}/progress" class="text-blue-600 text-xs cursor-pointer hover:underline">Progress</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    document.getElementById('users-content').innerHTML = `<div class="p-4 text-red-500">${err.message}</div>`;
  }
}
