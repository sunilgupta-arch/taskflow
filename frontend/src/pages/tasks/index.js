import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import { isAdminOrManager } from '../../utils/auth.js';
import api from '../../api/index.js';

export function tasksPage({ query = {} } = {}) {
  renderPage(layout(`
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">All Tasks</h2>
        <a data-route="/tasks/create" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm cursor-pointer">+ New Task</a>
      </div>
      <div id="task-filters" class="bg-white rounded-lg shadow p-4">
        <form id="filter-form" class="flex flex-wrap gap-3 items-center">
          <input type="text" name="search" placeholder="Search tasks..." class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-48">
          <select name="status" class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="active">Active (Recurring)</option>
            <option value="deactivated">Deactivated</option>
          </select>
          <select name="type" class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">All Types</option>
            <option value="recurring">Recurring</option>
            <option value="once">One Time</option>
          </select>
          <button type="submit" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm">Filter</button>
        </form>
      </div>
      <div id="tasks-table" class="bg-white rounded-lg shadow overflow-hidden">
        <div class="p-8 text-center text-gray-400">Loading tasks...</div>
      </div>
    </div>
  `, '/tasks'));
  initLayout();

  document.getElementById('filter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    loadTasks();
  });

  loadTasks();
}

async function loadTasks() {
  const form = document.getElementById('filter-form');
  const params = new URLSearchParams(new FormData(form)).toString();
  try {
    const res = await api.get('/tasks' + (params ? '?' + params : ''));
    const d = res.data;
    renderTaskTable(d.tasks || [], d.pagination);
  } catch (err) {
    document.getElementById('tasks-table').innerHTML =
      `<div class="p-4 text-red-500">${err.message}</div>`;
  }
}

function renderTaskTable(tasks, pagination) {
  const container = document.getElementById('tasks-table');

  if (!tasks.length) {
    container.innerHTML = '<div class="p-8 text-center text-gray-400">No tasks found</div>';
    return;
  }

  const priorityStyle = {
    urgent: 'bg-red-100 text-red-600',
    high: 'bg-amber-100 text-amber-600',
    medium: 'bg-blue-100 text-blue-600',
    low: 'bg-gray-100 text-gray-500',
  };

  const statusStyle = {
    pending: 'bg-amber-100 text-amber-600',
    in_progress: 'bg-blue-100 text-blue-600',
    completed: 'bg-green-100 text-green-600',
    active: 'bg-purple-100 text-purple-600',
    deactivated: 'bg-gray-100 text-gray-500',
  };

  container.innerHTML = `
    <div class="px-5 py-3 border-b border-gray-200 text-sm text-gray-500">
      ${pagination ? `${pagination.total} tasks` : ''}
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-500">#</th>
            <th class="text-left px-4 py-3 font-medium text-gray-500">Task</th>
            <th class="text-center px-3 py-3 font-medium text-gray-500">Type</th>
            <th class="text-center px-3 py-3 font-medium text-gray-500">Priority</th>
            <th class="text-left px-3 py-3 font-medium text-gray-500">Assigned To</th>
            <th class="text-center px-3 py-3 font-medium text-gray-500">Status</th>
            <th class="text-center px-3 py-3 font-medium text-gray-500">Due</th>
            <th class="text-center px-3 py-3 font-medium text-gray-500">Reward</th>
            <th class="text-center px-3 py-3 font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${tasks.map(t => {
            const ps = priorityStyle[t.priority] || priorityStyle.medium;
            const ss = statusStyle[t.status] || statusStyle.pending;
            const dueDate = t.due_date ? new Date(t.due_date).toLocaleDateString() : (t.recurrence_end_date ? new Date(t.recurrence_end_date).toLocaleDateString() : '—');

            return `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3 font-mono text-xs text-gray-400">#${t.id}</td>
              <td class="px-4 py-3">
                <a data-route="/tasks/${t.id}" class="font-medium text-gray-900 cursor-pointer hover:text-blue-600">${t.title}</a>
                ${t.created_by_org === 'CLIENT' ? '<span class="ml-1 text-xs bg-orange-100 text-orange-600 px-1 rounded">Client</span>' : ''}
              </td>
              <td class="text-center px-3 py-3">
                <span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">${t.type === 'once' ? 'one time' : t.recurrence_pattern || t.type}</span>
              </td>
              <td class="text-center px-3 py-3">
                <span class="${ps} px-2 py-0.5 rounded text-xs">${(t.priority || 'medium').toUpperCase()}</span>
              </td>
              <td class="px-3 py-3 text-sm">${t.assigned_to_name || '—'}</td>
              <td class="text-center px-3 py-3">
                <span class="${ss} px-2 py-0.5 rounded text-xs">${(t.status || '').replace('_', ' ')}</span>
                ${t.is_completed_today ? '<span class="ml-1 text-green-500 text-xs">✓ today</span>' : ''}
              </td>
              <td class="text-center px-3 py-3 text-xs text-gray-500">${dueDate}</td>
              <td class="text-center px-3 py-3 font-mono text-amber-600 text-xs">${t.reward_amount ? parseFloat(t.reward_amount).toFixed(0) + ' pts' : '—'}</td>
              <td class="text-center px-3 py-3">
                <a data-route="/tasks/${t.id}" class="text-blue-600 text-xs cursor-pointer hover:underline">View</a>
                <a data-route="/tasks/${t.id}/edit" class="text-gray-500 text-xs cursor-pointer hover:underline ml-2">Edit</a>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}
