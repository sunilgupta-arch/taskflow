import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';
import router from '../../router/index.js';

export function taskCreatePage() {
  renderPage(layout(`
    <div class="space-y-6">
      <a data-route="/tasks" class="text-blue-600 hover:text-blue-800 text-sm cursor-pointer">&larr; Back to Tasks</a>
      <h2 class="text-2xl font-bold text-gray-900">Create Task</h2>
      <div class="bg-white rounded-lg shadow p-6">
        <form id="task-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input type="text" name="title" required
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea name="description" rows="4"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"></textarea>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select name="type" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="once">One-time</option>
                <option value="recurring">Recurring</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" name="due_date"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
          </div>
          <div id="task-form-error" class="text-red-600 text-sm hidden"></div>
          <div class="flex gap-3">
            <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm">Create</button>
            <a data-route="/tasks" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg text-sm cursor-pointer">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  `, '/tasks'));
  initLayout();

  document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const errEl = document.getElementById('task-form-error');
    errEl.classList.add('hidden');
    try {
      await api.post('/tasks/create', {
        title: form.title.value,
        description: form.description.value,
        type: form.type.value,
        due_date: form.due_date.value || null,
      });
      router.navigate('/tasks');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}
