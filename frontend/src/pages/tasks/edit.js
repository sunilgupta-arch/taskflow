import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';
import router from '../../router/index.js';

export function taskEditPage({ params }) {
  renderPage(layout(`
    <div class="space-y-6">
      <a data-route="/tasks/${params.id}" class="text-blue-600 hover:text-blue-800 text-sm cursor-pointer">&larr; Back to Task</a>
      <h2 class="text-2xl font-bold text-gray-900">Edit Task</h2>
      <div id="edit-form-container" class="bg-white rounded-lg shadow p-6">
        <div class="animate-pulse space-y-4">
          <div class="h-10 bg-gray-200 rounded"></div>
          <div class="h-24 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  `, '/tasks'));
  initLayout();
  loadTaskForEdit(params.id);
}

async function loadTaskForEdit(id) {
  try {
    const data = await api.get(`/tasks/${id}`);
    // TODO: Populate edit form with task data
  } catch (err) {
    document.getElementById('edit-form-container').innerHTML =
      `<p class="text-red-500">Failed to load task: ${err.message}</p>`;
  }
}
