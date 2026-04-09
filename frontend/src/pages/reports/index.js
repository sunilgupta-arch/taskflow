import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';

export function reportsIndexPage() {
  renderPage(layout(`
    <div class="space-y-6">
      <h2 class="text-2xl font-bold text-gray-900">Reports</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${reportCard('/reports/completion', 'Completion Report', 'Task completion stats and trends', '📊')}
        ${reportCard('/reports/task-completion', 'Task Completion Calendar', 'Daily completion grid per user', '📅')}
        ${reportCard('/reports/overdue', 'Overdue Report', 'Tasks past their deadline', '⏰')}
        ${reportCard('/reports/rewards', 'Rewards Report', 'Reward earnings and payouts', '🏆')}
        ${reportCard('/reports/punctuality', 'Punctuality Report', 'Login time analysis', '🕐')}
        ${reportCard('/reports/workload', 'Workload Report', 'Task distribution across team', '⚖️')}
      </div>
    </div>
  `, '/reports'));
  initLayout();
}

function reportCard(route, title, desc, icon) {
  return `
    <a data-route="${route}" class="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer block">
      <div class="text-3xl mb-3">${icon}</div>
      <h3 class="font-semibold text-gray-900">${title}</h3>
      <p class="text-sm text-gray-500 mt-1">${desc}</p>
    </a>
  `;
}
