import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';

export function helpPage() {
  renderPage(layout(`
    <div class="space-y-6">
      <h2 class="text-2xl font-bold text-gray-900">Help & Support</h2>
      <div class="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <h3 class="font-semibold text-gray-900 mb-2">Getting Started</h3>
          <p class="text-gray-600 text-sm">TaskFlow is your team's task management and collaboration platform. Use the sidebar to navigate between features.</p>
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 mb-2">Features</h3>
          <ul class="text-gray-600 text-sm space-y-1 list-disc list-inside">
            <li>Task Board — manage and assign tasks</li>
            <li>Chat — real-time messaging with voice calls</li>
            <li>Drive — file storage via Google Drive</li>
            <li>Reports — completion, attendance, workload analytics</li>
            <li>Leaves — apply and manage leave requests</li>
            <li>Notes — personal note-taking</li>
          </ul>
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 mb-2">Keyboard Shortcuts</h3>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="text-gray-600"><kbd class="bg-gray-100 px-2 py-0.5 rounded text-xs">Ctrl+K</kbd> Quick search</div>
            <div class="text-gray-600"><kbd class="bg-gray-100 px-2 py-0.5 rounded text-xs">Ctrl+N</kbd> New task</div>
          </div>
        </div>
      </div>
    </div>
  `, '/help'));
  initLayout();
}
