import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function taskShowPage({ params }) {
  renderPage(layout(`
    <div class="space-y-4">
      <a data-route="/tasks" class="text-blue-600 hover:text-blue-800 text-sm cursor-pointer">&larr; Back to Tasks</a>
      <div id="task-detail" class="bg-white rounded-lg shadow p-6">
        <div class="animate-pulse space-y-4"><div class="h-8 bg-gray-200 rounded w-1/2"></div><div class="h-4 bg-gray-200 rounded w-3/4"></div></div>
      </div>
    </div>
  `, '/tasks'));
  initLayout();
  loadTask(params.id);
}

async function loadTask(id) {
  try {
    const res = await api.get(`/tasks/${id}`);
    const d = res.data;
    const t = d.task;
    const comments = d.comments || [];
    const attachments = d.attachments || [];
    const container = document.getElementById('task-detail');

    const priorityStyle = { urgent: 'bg-red-100 text-red-600', high: 'bg-amber-100 text-amber-600', medium: 'bg-blue-100 text-blue-600', low: 'bg-gray-100 text-gray-500' };
    const ps = priorityStyle[t.priority] || priorityStyle.medium;

    container.innerHTML = `
      <div class="flex items-start justify-between mb-4">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">${t.title}</h2>
          <div class="flex items-center gap-2 mt-2">
            <span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">#${t.id}</span>
            <span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">${t.type === 'once' ? 'One time' : t.recurrence_pattern || 'Recurring'}</span>
            <span class="${ps} px-2 py-0.5 rounded text-xs">${(t.priority || 'medium').toUpperCase()}</span>
            <span class="bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-xs">${(t.status || '').replace('_', ' ')}</span>
          </div>
        </div>
        <a data-route="/tasks/${t.id}/edit" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm cursor-pointer">Edit</a>
      </div>

      ${t.description ? `<div class="prose text-sm text-gray-700 mb-4 whitespace-pre-wrap">${t.description}</div>` : ''}

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div><span class="text-xs text-gray-500 block">Assigned To</span><span class="text-sm font-medium">${t.assigned_to_name || '—'}</span></div>
        <div><span class="text-xs text-gray-500 block">Created By</span><span class="text-sm font-medium">${t.created_by_name || '—'}</span></div>
        <div><span class="text-xs text-gray-500 block">Due Date</span><span class="text-sm font-medium">${t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}</span></div>
        <div><span class="text-xs text-gray-500 block">Reward</span><span class="text-sm font-medium font-mono text-amber-600">${t.reward_amount ? parseFloat(t.reward_amount).toFixed(0) + ' pts' : '—'}</span></div>
      </div>

      ${attachments.length ? `
      <div class="mb-6">
        <h3 class="text-sm font-semibold text-gray-500 uppercase mb-2">Attachments</h3>
        <div class="flex flex-wrap gap-2">
          ${attachments.map(a => `<a href="/uploads/tasks/${a.filename}" target="_blank" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-xs">${a.original_name || a.filename}</a>`).join('')}
        </div>
      </div>` : ''}

      <div>
        <h3 class="text-sm font-semibold text-gray-500 uppercase mb-3">Comments (${comments.length})</h3>
        <div class="space-y-3 mb-4">
          ${comments.length ? comments.map(c => `
            <div class="bg-gray-50 rounded-lg p-3">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-medium">${c.user_name || 'User'}</span>
                <span class="text-xs text-gray-400">${c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
              </div>
              <p class="text-sm text-gray-700">${c.content}</p>
            </div>
          `).join('') : '<p class="text-sm text-gray-400">No comments yet</p>'}
        </div>
        <form id="comment-form" class="flex gap-2">
          <input type="text" name="content" placeholder="Add a comment..." class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
          <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">Post</button>
        </form>
      </div>
    `;

    // Comment form handler
    document.getElementById('comment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = e.target.content;
      if (!input.value.trim()) return;
      try {
        await api.post(`/tasks/${id}/comments`, { content: input.value.trim() });
        input.value = '';
        loadTask(id); // Reload
      } catch (err) {
        alert(err.message);
      }
    });
  } catch (err) {
    document.getElementById('task-detail').innerHTML =
      `<div class="text-red-500">${err.message}</div>`;
  }
}
