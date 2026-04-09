import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function liveStatusPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">Live Status</h2>
        <div id="status-counts" class="flex gap-2 text-sm"></div>
      </div>
      <div id="ls-content" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        ${[1,2,3,4].map(() => '<div class="bg-white rounded-lg shadow p-5 animate-pulse"><div class="h-20 bg-gray-200 rounded"></div></div>').join('')}
      </div>
    </div>
  `, '/live-status'));
  initLayout();
  load();
}

async function load() {
  try {
    const res = await api.get('/live-status');
    const d = res.data;
    const employees = d.employees || [];
    const counts = d.counts || {};
    const container = document.getElementById('ls-content');
    const countsEl = document.getElementById('status-counts');

    countsEl.innerHTML = `
      <span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">${counts.working || 0} Working</span>
      <span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">${counts.extending || 0} Extending</span>
      <span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs">${counts.idle || 0} Idle</span>
      <span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">${counts.offOrLeave || 0} Off/Leave</span>
    `;

    if (!employees.length) {
      container.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">No employees found</div>';
      return;
    }

    const typeStyles = {
      working: { bg: 'bg-green-50 border-green-300', badge: 'bg-green-100 text-green-700' },
      extending: { bg: 'bg-blue-50 border-blue-300', badge: 'bg-blue-100 text-blue-700' },
      idle: { bg: 'bg-amber-50 border-amber-300', badge: 'bg-amber-100 text-amber-700' },
      absent: { bg: 'bg-red-50 border-red-300', badge: 'bg-red-100 text-red-700' },
      stale: { bg: 'bg-orange-50 border-orange-300', badge: 'bg-orange-100 text-orange-700' },
      off: { bg: 'bg-gray-50 border-gray-200', badge: 'bg-gray-100 text-gray-500' },
      leave: { bg: 'bg-purple-50 border-purple-200', badge: 'bg-purple-100 text-purple-600' },
    };

    container.innerHTML = employees.map(e => {
      const style = typeStyles[e.statusType] || typeStyles.off;
      return `
        <div class="rounded-lg shadow border p-4 ${style.bg}">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center text-sm font-bold text-gray-600 border">${(e.name || '?')[0]}</div>
            <div>
              <div class="font-medium text-gray-900 text-sm">${e.name}</div>
              <span class="${style.badge} px-2 py-0.5 rounded text-xs">${e.status}</span>
            </div>
          </div>
          ${e.taskName ? `<div class="text-xs text-gray-600 mt-1">Task: <a data-route="/tasks/${e.taskId}" class="text-blue-600 cursor-pointer">${e.taskName}</a></div>` : ''}
          <div class="text-xs text-gray-400 mt-1">Shift: ${e.shiftStart ? e.shiftStart.substring(0, 5) : '—'} (${e.shiftHours || 0}h)</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    document.getElementById('ls-content').innerHTML = `<div class="col-span-full bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
