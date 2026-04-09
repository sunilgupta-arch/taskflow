import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import { getUser, isAdminOrManager, hasRole } from '../../utils/auth.js';
import api from '../../api/index.js';

export function dashboardPage() {
  renderPage(layout(`
    <div class="space-y-6">
      <h2 class="text-2xl font-bold text-gray-900">Dashboard</h2>
      <div id="dashboard-content">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          ${[1,2,3,4].map(() => '<div class="bg-white rounded-lg shadow p-5 animate-pulse"><div class="h-16 bg-gray-200 rounded"></div></div>').join('')}
        </div>
      </div>
    </div>
  `, '/dashboard'));
  initLayout();
  loadDashboard();
}

async function loadDashboard() {
  try {
    const res = await api.get('/dashboard/overview');
    const d = res.data;
    const container = document.getElementById('dashboard-content');

    if (isAdminOrManager()) {
      container.innerHTML = renderAdminDashboard(d);
    } else {
      container.innerHTML = renderUserDashboard(d);
    }
  } catch (err) {
    document.getElementById('dashboard-content').innerHTML =
      `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}

function statCard(value, label, color, route = null) {
  const tag = route ? 'a' : 'div';
  const routeAttr = route ? `data-route="${route}" ` : '';
  return `
    <${tag} ${routeAttr}class="bg-white rounded-lg shadow p-5 border-l-4 cursor-pointer hover:shadow-md transition-shadow" style="border-left-color: ${color}">
      <div class="text-2xl font-bold" style="color: ${color}">${value}</div>
      <div class="text-sm text-gray-500 mt-1">${label}</div>
    </${tag}>
  `;
}

function renderAdminDashboard(d) {
  const ts = d.taskStats || {};
  const rs = d.rewardSummary || {};
  const as = d.attendanceSummary || {};
  const perUser = d.perUserStats || [];
  const perReward = d.perUserRewards || [];

  let html = `
    <!-- Task Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      ${statCard(ts.total || 0, 'Total Tasks', '#3b82f6', '/tasks')}
      ${statCard(ts.pending || 0, 'Pending', '#f59e0b', '/tasks')}
      ${statCard(ts.in_progress || 0, 'In Progress', '#06b6d4', '/tasks')}
      ${statCard(ts.completed || 0, 'Completed', '#10b981', '/tasks')}
    </div>

    <!-- Completion Timeline -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      ${statCard(ts.completed_today || 0, 'Completed Today', '#7c3aed')}
      ${statCard(ts.completed_this_week || 0, 'This Week', '#7c3aed')}
      ${statCard(ts.completed_this_month || 0, 'This Month', '#7c3aed')}
      ${statCard(ts.completed_this_year || 0, 'This Year', '#7c3aed')}
    </div>

    <!-- Task Types -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      ${statCard((ts.type_daily || 0) + (ts.type_weekly || 0) + (ts.type_monthly || 0), 'Recurring Tasks', '#06b6d4')}
      ${statCard(ts.type_once || 0, 'One Time Tasks', '#f97316')}
      ${statCard(ts.type_daily || 0, 'Daily', '#8b5cf6')}
      ${statCard((ts.type_weekly || 0) + (ts.type_monthly || 0), 'Weekly / Monthly', '#ec4899')}
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <!-- Rewards -->
      <div class="bg-white rounded-lg shadow p-5">
        <h3 class="text-sm font-semibold text-gray-500 uppercase mb-3">Rewards Overview</h3>
        ${summaryRow('Total Earned', `${parseFloat(rs.total || 0).toFixed(0)} pts`, '#06b6d4')}
        ${summaryRow('Pending', `${parseFloat(rs.pending || 0).toFixed(0)} pts`, '#f59e0b')}
        ${summaryRow('Paid Out', `${parseFloat(rs.paid || 0).toFixed(0)} pts`, '#10b981')}
      </div>
      <!-- Attendance -->
      <div class="bg-white rounded-lg shadow p-5">
        <h3 class="text-sm font-semibold text-gray-500 uppercase mb-3">Attendance Today</h3>
        ${summaryRow('Total Users', as.total_users || 0)}
        ${summaryRow('Logged In', as.logged_in_today || 0, '#10b981')}
        ${summaryRow('On Leave', as.on_leave || 0, '#f59e0b')}
        ${summaryRow('On Weekoff', as.on_weekoff || 0, '#6b7280')}
      </div>
      <!-- Quick Actions -->
      <div class="bg-white rounded-lg shadow p-5">
        <h3 class="text-sm font-semibold text-gray-500 uppercase mb-3">Quick Actions</h3>
        <div class="space-y-2">
          <a data-route="/tasks/create" class="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm cursor-pointer">+ Create Task</a>
          <a data-route="/tasks" class="block w-full text-center bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm cursor-pointer">View All Tasks</a>
          <a data-route="/rewards" class="block w-full text-center bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm cursor-pointer">Rewards Ledger</a>
          ${hasRole('LOCAL_ADMIN') ? '<a data-route="/users" class="block w-full text-center bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm cursor-pointer">Manage Users</a>' : ''}
        </div>
      </div>
    </div>
  `;

  // Team Performance Table
  if (perUser.length > 0) {
    html += `
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <div class="px-5 py-3 border-b border-gray-200">
        <h3 class="text-sm font-semibold text-gray-500 uppercase">Team Performance</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="text-left px-4 py-3 font-medium text-gray-500">User</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Total</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Done</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Active</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Pending</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Recurring</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Progress</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Rewards</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${perUser.map(u => {
              const progress = u.total_tasks > 0 ? Math.round((u.completed / u.total_tasks) * 100) : 0;
              const reward = perReward.find(r => r.id === u.id);
              return `
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-3">
                    <a data-route="/users/${u.id}/progress" class="cursor-pointer">
                      <div class="font-medium text-gray-900">${u.name}</div>
                      <div class="text-xs text-gray-400">${u.email}</div>
                    </a>
                  </td>
                  <td class="text-center px-3 py-3 font-mono">${u.total_tasks}</td>
                  <td class="text-center px-3 py-3 font-mono text-green-600">${u.completed}</td>
                  <td class="text-center px-3 py-3 font-mono text-cyan-600">${u.in_progress}</td>
                  <td class="text-center px-3 py-3 font-mono text-amber-600">${u.pending}</td>
                  <td class="text-center px-3 py-3 font-mono text-purple-600">${u.active_recurring || 0}</td>
                  <td class="px-3 py-3">
                    <div class="w-full bg-gray-200 rounded-full h-2">
                      <div class="bg-blue-600 h-2 rounded-full" style="width:${progress}%"></div>
                    </div>
                    <div class="text-xs text-gray-400 mt-1 text-center">${progress}%</div>
                  </td>
                  <td class="text-center px-3 py-3 font-mono text-amber-600">${parseFloat(reward?.total_earned || 0).toFixed(0)} pts</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    `;
  }

  return html;
}

function renderUserDashboard(d) {
  const ts = d.taskStats || {};
  const rs = d.rewardSummary || {};
  const dayTasks = d.dayTasks || [];
  const selectedDate = d.selectedDate || new Date().toISOString().split('T')[0];
  const isToday = d.isToday !== false;

  const dateObj = new Date(selectedDate + 'T12:00:00Z');
  const displayDate = dateObj.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const prevDate = new Date(dateObj); prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(dateObj); nextDate.setDate(nextDate.getDate() + 1);

  const priorityColors = {
    urgent: { bg: 'bg-red-100', text: 'text-red-600' },
    high: { bg: 'bg-amber-100', text: 'text-amber-600' },
    medium: { bg: 'bg-blue-100', text: 'text-blue-600' },
    low: { bg: 'bg-gray-100', text: 'text-gray-600' },
  };

  return `
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      ${statCard(ts.total || 0, 'Total Tasks', '#8b5cf6', '/tasks/my')}
      ${statCard(ts.in_progress || 0, 'Active Tasks', '#06b6d4', '/tasks')}
      ${statCard(ts.completed || 0, 'Completed', '#10b981', '/tasks')}
      ${statCard(parseFloat(rs.pending_amount || 0).toFixed(0) + ' pts', 'Pending Reward', '#f59e0b', '/rewards')}
      ${statCard(parseFloat(rs.paid_amount || 0).toFixed(0) + ' pts', 'Paid Out', '#10b981', '/rewards')}
    </div>

    <!-- Day Tasks -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-500 uppercase">
          My Tasks
          ${isToday ? '<span class="ml-2 text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded">TODAY</span>' : ''}
        </h3>
        <a data-route="/tasks/my" class="text-xs text-blue-600 cursor-pointer">View All →</a>
      </div>
      <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
        <button onclick="window.location.hash='/dashboard?date=${prevDate.toISOString().split('T')[0]}'" class="text-sm text-gray-600 hover:text-gray-900 px-3 py-1 bg-gray-100 rounded">← Prev</button>
        <span class="text-sm font-medium">${displayDate}</span>
        <button onclick="window.location.hash='/dashboard?date=${nextDate.toISOString().split('T')[0]}'" class="text-sm text-gray-600 hover:text-gray-900 px-3 py-1 bg-gray-100 rounded">Next →</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="text-left px-4 py-3 font-medium text-gray-500">Task</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Type</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Priority</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Status</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Reward</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${dayTasks.length > 0 ? dayTasks.map(t => {
              const pc = priorityColors[t.priority] || priorityColors.medium;
              const isDone = t.is_completed_for_date > 0;
              const isStarted = t.is_started_for_date > 0;
              let statusBadge;
              if (isDone) statusBadge = '<span class="bg-green-100 text-green-600 px-2 py-0.5 rounded text-xs">Done</span>';
              else if (isStarted) statusBadge = '<span class="bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-xs">In Progress</span>';
              else statusBadge = `<span class="bg-amber-100 text-amber-600 px-2 py-0.5 rounded text-xs">${t.status?.replace('_', ' ') || 'pending'}</span>`;

              return `
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-3"><a data-route="/tasks/${t.id}" class="font-medium text-gray-900 cursor-pointer hover:text-blue-600">${t.title}</a></td>
                  <td class="text-center px-3 py-3"><span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">${t.type === 'once' ? 'one time' : t.type}</span></td>
                  <td class="text-center px-3 py-3"><span class="${pc.bg} ${pc.text} px-2 py-0.5 rounded text-xs">${(t.priority || 'medium').toUpperCase()}</span></td>
                  <td class="text-center px-3 py-3">${statusBadge}</td>
                  <td class="text-center px-3 py-3 font-mono text-amber-600">${t.reward_amount ? parseFloat(t.reward_amount).toFixed(0) + ' pts' : '—'}</td>
                  <td class="text-center px-3 py-3"><a data-route="/tasks/${t.id}" class="text-blue-600 text-xs cursor-pointer">Open</a></td>
                </tr>
              `;
            }).join('') : '<tr><td colspan="6" class="text-center text-gray-400 py-8">No tasks for this date</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function summaryRow(label, value, color = null) {
  const colorStyle = color ? `color: ${color}` : '';
  return `
    <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
      <span class="text-sm text-gray-500">${label}</span>
      <span class="font-mono text-sm font-medium" style="${colorStyle}">${value}</span>
    </div>
  `;
}
