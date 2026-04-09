import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function taskCompletionReportPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <a data-route="/reports" class="text-blue-600 hover:text-blue-800 text-sm cursor-pointer">&larr; Reports</a>
      <h2 class="text-2xl font-bold text-gray-900">Task Completion Calendar</h2>
      <div id="tc-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/reports'));
  initLayout();
  load();
}

async function load() {
  try {
    const res = await api.get('/reports/task-completion');
    const d = res.data;
    const users = d.users || [];
    const calData = d.calendarData || {};
    const month = d.month || '';
    const lastDay = d.lastDay || 30;
    const container = document.getElementById('tc-content');

    container.innerHTML = `
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <span class="text-sm font-semibold text-gray-500">${month}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-gray-50"><tr>
              <th class="text-left px-3 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50">User</th>
              ${Array.from({length: lastDay}, (_, i) => `<th class="text-center px-1 py-2 font-medium text-gray-400">${i + 1}</th>`).join('')}
            </tr></thead>
            <tbody class="divide-y divide-gray-100">
              ${users.map(u => `<tr class="hover:bg-gray-50">
                <td class="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white whitespace-nowrap">${u.name}</td>
                ${Array.from({length: lastDay}, (_, i) => {
                  const cell = calData[u.id]?.[i + 1];
                  const done = cell?.done || 0;
                  const total = cell?.total || 0;
                  let bg = '';
                  if (done > 0 && done >= total) bg = 'bg-green-200 text-green-800';
                  else if (done > 0) bg = 'bg-amber-100 text-amber-700';
                  return `<td class="text-center px-1 py-2 ${bg}">${total > 0 ? `${done}/${total}` : ''}</td>`;
                }).join('')}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('tc-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
