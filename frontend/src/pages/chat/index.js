import { layout, initLayout } from '../../layouts/main.js';
import { renderPage } from '../../utils/render.js';
import { getUser } from '../../utils/auth.js';
import api from '../../api/index.js';

let activeConvId = null;

export function chatPage() {
  renderPage(layout(`
    <div class="flex h-[calc(100vh-8rem)] gap-4">
      <div class="w-80 bg-white rounded-lg shadow flex flex-col flex-shrink-0">
        <div class="p-4 border-b border-gray-200">
          <h3 class="font-semibold text-gray-900">Conversations</h3>
          <button id="new-chat-btn" class="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg">+ New Chat</button>
        </div>
        <div id="conv-list" class="flex-1 overflow-y-auto p-2 space-y-1">
          <div class="p-4 text-center text-gray-400 text-sm">Loading...</div>
        </div>
      </div>
      <div class="flex-1 bg-white rounded-lg shadow flex flex-col">
        <div id="chat-header" class="p-4 border-b border-gray-200"><p class="text-gray-400 text-sm">Select a conversation</p></div>
        <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3"></div>
        <div id="chat-input-area" class="p-4 border-t border-gray-200 hidden">
          <form id="chat-form" class="flex gap-2">
            <input type="text" name="message" placeholder="Type a message..." class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" autocomplete="off">
            <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">Send</button>
          </form>
        </div>
      </div>
    </div>
  `, '/chat'));
  initLayout();
  loadConversations();
}

async function loadConversations() {
  try {
    const res = await api.get('/chat/conversations');
    const convs = res.data?.conversations || res.data || [];
    const list = document.getElementById('conv-list');

    if (!Array.isArray(convs) || !convs.length) {
      list.innerHTML = '<p class="text-center text-gray-400 text-sm py-4">No conversations</p>';
      return;
    }

    list.innerHTML = convs.map(c => `
      <button data-conv-id="${c.id}" class="conv-item w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors ${c.id === activeConvId ? 'bg-blue-50' : ''}">
        <div class="font-medium text-sm text-gray-900">${c.other_user_name || c.name || 'Chat'}</div>
        <div class="text-xs text-gray-400 truncate">${c.last_message || ''}</div>
      </button>
    `).join('');

    list.querySelectorAll('.conv-item').forEach(btn => {
      btn.addEventListener('click', () => openConversation(btn.dataset.convId, btn.querySelector('.font-medium').textContent));
    });
  } catch (err) {
    document.getElementById('conv-list').innerHTML = `<p class="p-4 text-red-500 text-sm">${err.message}</p>`;
  }
}

async function openConversation(convId, name) {
  activeConvId = convId;
  document.getElementById('chat-header').innerHTML = `<h3 class="font-semibold text-gray-900">${name}</h3>`;
  document.getElementById('chat-input-area').classList.remove('hidden');
  const msgEl = document.getElementById('chat-messages');
  msgEl.innerHTML = '<p class="text-center text-gray-400 text-sm">Loading messages...</p>';

  try {
    const res = await api.get(`/chat/conversations/${convId}/messages`);
    const messages = res.data?.messages || res.data || [];
    const me = getUser();

    msgEl.innerHTML = messages.map(m => {
      const isMe = m.sender_id === me?.id;
      return `
        <div class="flex ${isMe ? 'justify-end' : 'justify-start'}">
          <div class="max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm ${isMe ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}">
            ${!isMe ? `<div class="text-xs font-medium mb-0.5 ${isMe ? 'text-blue-200' : 'text-gray-500'}">${m.sender_name || ''}</div>` : ''}
            <div>${m.content || m.message || ''}</div>
            <div class="text-xs mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}">${m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
          </div>
        </div>
      `;
    }).join('') || '<p class="text-center text-gray-400 text-sm">No messages yet</p>';

    msgEl.scrollTop = msgEl.scrollHeight;

    // Setup send form
    const form = document.getElementById('chat-form');
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    newForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = newForm.message;
      if (!input.value.trim()) return;
      try {
        await api.post(`/chat/conversations/${convId}/messages`, { content: input.value.trim() });
        input.value = '';
        openConversation(convId, name);
      } catch (err) { alert(err.message); }
    });
  } catch (err) {
    msgEl.innerHTML = `<p class="text-red-500 text-sm">${err.message}</p>`;
  }
}
