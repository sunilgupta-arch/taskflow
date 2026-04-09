import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function attendancePage() {
  renderPage(layout(`
    <div class="space-y-4">
      <h2 class="text-2xl font-bold text-gray-900">Attendance Dashboard</h2>
      <div id="att-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/attendance'));
  initLayout();
  load();
}

async function load() {
  try {
    const res = await api.get('/attendance');
    const d = res.data;
    const dailyLogs = d.dailyLogs || [];
    const calendarUsers = d.calendarUsers || [];
    const calendarData = d.calendarData || {};
    const container = document.getElementById('att-content');

    let html = '';

    // Daily logs table
    html += `
      <div class="bg-white rounded-lg shadow overflow-hidden mb-6">
        <div class="px-5 py-3 border-b border-gray-200"><h3 class="text-sm font-semibold text-gray-500 uppercase">Daily Log — ${d.selectedDate || d.today || ''}</h3></div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50"><tr>
              <th class="text-left px-4 py-3 font-medium text-gray-500">Name</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Login</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Logout</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500">Duration</th>
              <th class="text-left px-3 py-3 font-medium text-gray-500">Late Reason</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-100">
              ${dailyLogs.length ? dailyLogs.map(l => `
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-medium">${l.user_name}</td>
                  <td class="text-center px-3 py-3 text-xs font-mono">${l.loginFormatted || '—'}</td>
                  <td class="text-center px-3 py-3 text-xs font-mono">${l.logoutFormatted || '<span class="text-green-600">Active</span>'}</td>
                  <td class="text-center px-3 py-3 text-xs font-mono">${l.duration || '—'}</td>
                  <td class="px-3 py-3 text-xs text-gray-500">${l.late_login_reason || ''}</td>
                </tr>
              `).join('') : '<tr><td colspan="5" class="text-center text-gray-400 py-6">No logs for this date</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Calendar
    if (calendarUsers.length) {
      const lastDay = d.lastDay || 30;
      const statusColors = {
        present: 'bg-green-200', absent: 'bg-red-200', weekoff: 'bg-gray-200',
        holiday: 'bg-blue-200', approved_leave: 'bg-purple-200', pending_leave: 'bg-yellow-200', future: 'bg-gray-50'
      };

      html += `
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <span class="text-sm font-semibold text-gray-500 uppercase">Monthly Calendar — ${d.month || ''}</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-gray-50"><tr>
                <th class="text-left px-3 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50">User</th>
                ${Array.from({length: lastDay}, (_, i) => `<th class="text-center px-1 py-2 font-medium text-gray-400">${i + 1}</th>`).join('')}
              </tr></thead>
              <tbody class="divide-y divide-gray-100">
                ${calendarUsers.map(u => `<tr>
                  <td class="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white whitespace-nowrap">${u.name}</td>
                  ${Array.from({length: lastDay}, (_, i) => {
                    const status = calendarData[u.id]?.[i + 1] || 'future';
                    const color = statusColors[status] || 'bg-gray-50';
                    const label = status === 'present' ? 'P' : status === 'absent' ? 'A' : status === 'weekoff' ? 'W' : status === 'holiday' ? 'H' : status === 'approved_leave' ? 'L' : '';
                    return `<td class="text-center px-1 py-2 ${color} rounded">${label}</td>`;
                  }).join('')}
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="px-5 py-3 border-t border-gray-200 flex gap-4 text-xs text-gray-500">
            <span class="flex items-center gap-1"><span class="w-3 h-3 bg-green-200 rounded inline-block"></span> Present</span>
            <span class="flex items-center gap-1"><span class="w-3 h-3 bg-red-200 rounded inline-block"></span> Absent</span>
            <span class="flex items-center gap-1"><span class="w-3 h-3 bg-gray-200 rounded inline-block"></span> Week Off</span>
            <span class="flex items-center gap-1"><span class="w-3 h-3 bg-blue-200 rounded inline-block"></span> Holiday</span>
            <span class="flex items-center gap-1"><span class="w-3 h-3 bg-purple-200 rounded inline-block"></span> Leave</span>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  } catch (err) {
    document.getElementById('att-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}

export function myAttendancePage() {
  renderPage(layout(`
    <div class="space-y-4">
      <h2 class="text-2xl font-bold text-gray-900">My Attendance</h2>
      <div id="my-att-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/my-attendance'));
  initLayout();
  loadMyAtt();
}

async function loadMyAtt() {
  try {
    const res = await api.get('/my-attendance');
    const d = res.data;
    const shift = d.shift || {};
    const todaySessions = d.todaySessions || [];
    const calendarData = d.calendarData || {};
    const lastDay = d.lastDay || 30;
    const container = document.getElementById('my-att-content');

    let html = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow p-5"><div class="text-sm text-gray-500">Shift</div><div class="font-mono font-bold">${shift.start || '—'} (${shift.hours || 0}h)</div></div>
        <div class="bg-white rounded-lg shadow p-5"><div class="text-sm text-gray-500">Off Day</div><div class="font-bold">${shift.offDay || '—'}</div></div>
        <div class="bg-white rounded-lg shadow p-5"><div class="text-sm text-gray-500">Days Present (${d.month || ''})</div><div class="font-bold text-green-600">${d.totalPresent || 0}</div></div>
      </div>
    `;

    // Today's sessions
    if (todaySessions.length) {
      html += `
        <div class="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div class="px-5 py-3 border-b border-gray-200"><h3 class="text-sm font-semibold text-gray-500 uppercase">Today's Sessions</h3></div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50"><tr>
                <th class="text-center px-4 py-3 font-medium text-gray-500">Login</th>
                <th class="text-center px-3 py-3 font-medium text-gray-500">Logout</th>
                <th class="text-center px-3 py-3 font-medium text-gray-500">Duration</th>
              </tr></thead>
              <tbody class="divide-y divide-gray-100">
                ${todaySessions.map(s => `<tr>
                  <td class="text-center px-4 py-3 font-mono text-xs">${s.loginFormatted || '—'}</td>
                  <td class="text-center px-3 py-3 font-mono text-xs">${s.logoutFormatted || '<span class="text-green-600">Active</span>'}</td>
                  <td class="text-center px-3 py-3 font-mono text-xs">${s.duration || '—'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // Calendar
    const statusColors = { present: 'bg-green-200', absent: 'bg-red-200', off: 'bg-gray-200', holiday: 'bg-blue-200', leave: 'bg-purple-200', future: 'bg-gray-50' };
    html += `
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-200"><h3 class="text-sm font-semibold text-gray-500 uppercase">Monthly Calendar — ${d.month || ''}</h3></div>
        <div class="grid grid-cols-7 gap-1 p-4">
          ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `<div class="text-center text-xs font-medium text-gray-400 py-1">${d}</div>`).join('')}
          ${Array.from({length: lastDay}, (_, i) => {
            const day = i + 1;
            const cell = calendarData[day] || {};
            const status = cell.status || 'future';
            const color = statusColors[status] || 'bg-gray-50';
            return `<div class="text-center py-2 rounded ${color} text-xs">${day}</div>`;
          }).join('')}
        </div>
      </div>
    `;

    container.innerHTML = html;
  } catch (err) {
    document.getElementById('my-att-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
