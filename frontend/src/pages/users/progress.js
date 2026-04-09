import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import api from '../../api/index.js';

export function userProgressPage({ params }) {
  renderPage(layout(`
    <div class="space-y-4">
      <a data-route="/users" class="text-blue-600 hover:text-blue-800 text-sm cursor-pointer">&larr; Back to Users</a>
      <div id="progress-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/users'));
  initLayout();
  load(params.id);
}

async function load(userId) {
  try {
    const res = await api.get(`/users/${userId}/progress`);
    const d = res.data;
    const u = d.targetUser || d.user || {};
    const stats = d.taskStats || {};
    const container = document.getElementById('progress-content');

    container.innerHTML = `
      <div class="flex items-center gap-4 mb-6">
        <div class="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl font-bold">${(u.name || '?')[0]}</div>
        <div><h2 class="text-xl font-bold text-gray-900">${u.name || ''}</h2><p class="text-sm text-gray-500">${u.email || ''} · ${u.role_name || ''}</p></div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500"><div class="text-2xl font-bold">${stats.total || 0}</div><div class="text-sm text-gray-500">Total Tasks</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-green-500"><div class="text-2xl font-bold text-green-600">${stats.completed || 0}</div><div class="text-sm text-gray-500">Completed</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-cyan-500"><div class="text-2xl font-bold text-cyan-600">${stats.in_progress || 0}</div><div class="text-sm text-gray-500">In Progress</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-amber-500"><div class="text-2xl font-bold text-amber-600">${stats.pending || 0}</div><div class="text-sm text-gray-500">Pending</div></div>
      </div>
    `;
  } catch (err) {
    document.getElementById('progress-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}

export function myProgressPage() {
  renderPage(layout(`
    <div class="space-y-4">
      <h2 class="text-2xl font-bold text-gray-900">My Progress</h2>
      <div id="my-progress-content"><div class="bg-white rounded-lg shadow p-8 text-center text-gray-400">Loading...</div></div>
    </div>
  `, '/my-progress'));
  initLayout();
  loadMyProgress();
}

async function loadMyProgress() {
  try {
    const res = await api.get('/my-progress');
    const d = res.data;
    const stats = d.taskStats || {};
    const container = document.getElementById('my-progress-content');

    container.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500"><div class="text-2xl font-bold">${stats.total || 0}</div><div class="text-sm text-gray-500">Total Tasks</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-green-500"><div class="text-2xl font-bold text-green-600">${stats.completed || 0}</div><div class="text-sm text-gray-500">Completed</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-cyan-500"><div class="text-2xl font-bold text-cyan-600">${stats.in_progress || 0}</div><div class="text-sm text-gray-500">In Progress</div></div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-amber-500"><div class="text-2xl font-bold text-amber-600">${stats.pending || 0}</div><div class="text-sm text-gray-500">Pending</div></div>
      </div>
    `;
  } catch (err) {
    document.getElementById('my-progress-content').innerHTML = `<div class="bg-red-50 text-red-600 p-4 rounded-lg">${err.message}</div>`;
  }
}
