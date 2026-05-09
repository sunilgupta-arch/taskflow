// ═══════════════════════════════════════════════════════════
// Portal Frontend — Chat & Tasks
// ═══════════════════════════════════════════════════════════

let currentConversationId = null;
let currentConvIsBridge = false;
let currentTaskId = null;
let typingTimeout = null;
let onlineUserIds = new Set();

// ── CHAT ───────────────────────────────────────────────────

function loadConversations() {
  const safeGet = url => fetch(url).then(r => r.json()).catch(() => ({ success: false }));
  Promise.all([safeGet('/portal/chat/conversations'), safeGet('/portal/bridge/conversations')])
  .then(([chatRes, bridgeRes]) => {
    const portalConvs = chatRes.success ? chatRes.data.conversations.map(c => ({ ...c, _isBridge: false })) : [];
    const bridgeConvs = bridgeRes.success ? bridgeRes.data.conversations.map(c => ({ ...c, _isBridge: true })) : [];
    const all = [...portalConvs, ...bridgeConvs].sort((a, b) =>
      new Date(b.last_message_at || b.updated_at || 0) - new Date(a.last_message_at || a.updated_at || 0)
    );
    renderConversations(all);
  });
}

function renderConversations(conversations) {
  const list = document.getElementById('conversationList');
  if (!list) return;

  if (!conversations.length) {
    list.innerHTML = '<div class="text-center text-muted p-4 small">No conversations yet.<br>Start a new chat!</div>';
    return;
  }

  list.innerHTML = conversations.map(c => {
    if (c._isBridge) {
      const name = c.local_user_name || 'Support';
      const lastMsg = c.last_message || '';
      const time = c.last_message_at ? timeAgo(c.last_message_at) : '';
      const unread = c.unread_count > 0 ? `<span class="conv-unread">${c.unread_count}</span>` : '';
      const activeClass = (currentConvIsBridge && c.id === currentConversationId) ? 'active' : '';
      return `<div class="conv-item ${activeClass}" onclick="openBridgeConversation(${c.id}, '${name.replace(/'/g, "\\'")}')">
        <div class="conv-avatar-wrap">
          <div class="conv-avatar support-conv-avatar"><i class="bi bi-headset" style="font-size:0.85rem"></i></div>
        </div>
        <div class="conv-info">
          <span class="conv-name">${name} <span class="conv-support-badge">Support</span></span>
          <span class="conv-last-msg">${lastMsg}</span>
        </div>
        <div class="conv-meta">
          <span class="conv-time">${time}</span>
          ${unread}
        </div>
      </div>`;
    }

    const name = c.type === 'direct' ? (c.other_user?.name || 'Unknown') : c.name;
    const initial = name.charAt(0).toUpperCase();
    const lastMsg = c.last_message || '';
    const time = c.last_message_at ? timeAgo(c.last_message_at) : '';
    const unread = c.unread_count > 0 ? `<span class="conv-unread">${c.unread_count}</span>` : '';
    const activeClass = (!currentConvIsBridge && c.id === currentConversationId) ? 'active' : '';
    const isDirect = c.type === 'direct' && c.other_user;
    const isOnline = isDirect && onlineUserIds.has(c.other_user.id);
    const statusDot = isDirect ? '<span class="' + (isOnline ? 'online-dot' : 'offline-dot') + '"></span>' : '';

    return `<div class="conv-item ${activeClass}" onclick="openConversation(${c.id}, '${name.replace(/'/g, "\\'")}', '${c.type}', ${c.type === 'direct' && c.other_user ? c.other_user.id : 'null'})">
      <div class="conv-avatar-wrap">
        <div class="conv-avatar">${c.type === 'group' ? '<i class="bi bi-people-fill" style="font-size:0.8rem"></i>' : initial}</div>
        ${statusDot}
      </div>
      <div class="conv-info">
        <span class="conv-name">${name}</span>
        <span class="conv-last-msg">${lastMsg}</span>
      </div>
      <div class="conv-meta">
        <span class="conv-time">${time}</span>
        ${unread}
      </div>
    </div>`;
  }).join('');
}

function showContacts() {
  document.getElementById('conversationList').style.display = 'none';
  document.getElementById('contactsList').style.display = 'block';
  // Clear search when switching views
  var searchInput = document.getElementById('contactSearch');
  if (searchInput) { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); }
}

function showConversations() {
  document.getElementById('conversationList').style.display = 'block';
  document.getElementById('contactsList').style.display = 'none';
  var searchInput = document.getElementById('contactSearch');
  if (searchInput) { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); }
}

function startDirectChat(userId, userName) {
  fetch('/portal/chat/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'direct', participant_ids: [userId] })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        showConversations();
        openConversation(res.data.conversation_id, userName, 'direct');
        loadConversations();
      }
    });
}

function showNewGroupModal() {
  new bootstrap.Modal(document.getElementById('newGroupModal')).show();
}

function createGroup() {
  const name = document.getElementById('groupName').value.trim();
  const checks = document.querySelectorAll('.group-member-check:checked');
  const ids = Array.from(checks).map(c => parseInt(c.value));

  if (!name) return alert('Please enter a group name');
  if (!ids.length) return alert('Select at least one member');

  fetch('/portal/chat/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'group', name, participant_ids: ids })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        bootstrap.Modal.getInstance(document.getElementById('newGroupModal')).hide();
        document.getElementById('groupName').value = '';
        checks.forEach(c => c.checked = false);
        openConversation(res.data.conversation_id, name, 'group');
        loadConversations();
      }
    });
}

let currentChatPeerId = null;

function startBridgeChat(localUserId, localUserName) {
  fetch('/portal/bridge/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ local_user_id: localUserId })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        showConversations();
        openBridgeConversation(res.data.conversation.id, localUserName);
        loadConversations();
      }
    });
}

function openBridgeConversation(convId, name) {
  currentConversationId = convId;
  currentConvIsBridge = true;
  currentChatPeerId = null;
  currentConvType = 'bridge';

  document.getElementById('chatPlaceholder').style.display = 'none';
  document.getElementById('chatWindow').style.display = 'flex';
  document.getElementById('chatHeaderName').textContent = name;
  document.getElementById('chatHeaderStatus').innerHTML = '<span class="chat-support-label"><i class="bi bi-headset me-1"></i>Support</span>';
  document.getElementById('chatHeaderStatus').className = 'chat-header-status';
  document.getElementById('groupInfoBtn').style.display = 'none';

  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
  document.getElementById('chatSidebar').classList.add('hidden');

  loadMessages(convId);
  fetch(`/portal/bridge/conversations/${convId}/read`, { method: 'POST' });
}

function openConversation(convId, name, type, peerId) {
  currentConversationId = convId;
  currentConvIsBridge = false;
  currentChatPeerId = peerId || null;

  // Update UI
  document.getElementById('chatPlaceholder').style.display = 'none';
  document.getElementById('chatWindow').style.display = 'flex';
  document.getElementById('chatHeaderName').textContent = name;

  currentConvType = type;
  document.getElementById('groupInfoBtn').style.display = type === 'group' ? '' : 'none';

  if (type === 'group') {
    document.getElementById('chatHeaderStatus').textContent = 'Group';
    document.getElementById('chatHeaderStatus').className = 'chat-header-status';
  } else if (peerId && onlineUserIds.has(peerId)) {
    document.getElementById('chatHeaderStatus').innerHTML = '<span class="online-dot-sm"></span> Online';
    document.getElementById('chatHeaderStatus').className = 'chat-header-status online';
  } else {
    document.getElementById('chatHeaderStatus').textContent = 'Offline';
    document.getElementById('chatHeaderStatus').className = 'chat-header-status';
  }

  // Highlight active conversation
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));

  // On mobile, hide sidebar
  document.getElementById('chatSidebar').classList.add('hidden');

  // Join socket room
  portalSocket.emit('portal:conv:join', convId);

  // Load messages
  loadMessages(convId);

  // Mark as read and emit read receipt
  fetch(`/portal/chat/conversations/${convId}/read`, { method: 'POST' })
    .then(r => r.json())
    .then(res => {
      if (res.success && res.data.last_read_message_id) {
        portalSocket.emit('portal:read', {
          conversation_id: convId,
          last_read_message_id: res.data.last_read_message_id
        });
      }
    });
}

let loadingOlderMessages = false;
let noMoreMessages = false;

function loadMessages(convId, beforeId) {
  const base = currentConvIsBridge
    ? `/portal/bridge/conversations/${convId}/messages`
    : `/portal/chat/conversations/${convId}/messages`;
  let url = beforeId ? `${base}?before=${beforeId}` : base;

  if (!beforeId) {
    noMoreMessages = false;
    loadingOlderMessages = false;
  } else {
    loadingOlderMessages = true;
  }

  fetch(url)
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      if (beforeId && res.data.messages.length === 0) {
        noMoreMessages = true;
      }
      const msgs = currentConvIsBridge ? normalizeBridgeMessages(res.data.messages) : res.data.messages;
      renderMessages(msgs, beforeId ? 'prepend' : 'replace');
      loadingOlderMessages = false;
    });
}

function normalizeBridgeMessages(messages) {
  return messages.map(m => ({
    ...m,
    read_status: m.is_read ? 'read' : 'sent',
    is_edited: false
  }));
}

// mode: 'replace' (full load), 'append' (new message), 'prepend' (older messages)
function renderMessages(messages, replaceOrMode = true) {
  const mode = replaceOrMode === true ? 'replace' : replaceOrMode === false ? 'append' : replaceOrMode;
  const container = document.getElementById('chatMessages');

  let lastDateLabel = '';
  // For append mode, get the last date already in container
  if (mode === 'append') {
    const dividers = container.querySelectorAll('.msg-date-divider');
    if (dividers.length) lastDateLabel = dividers[dividers.length - 1].textContent.trim();
  }

  const html = messages.map(m => {
    const msgDate = formatDateLabel(m.created_at);
    let dateDivider = '';
    if (msgDate !== lastDateLabel) {
      dateDivider = `<div class="msg-date-divider" data-date="${msgDate}"><span>${msgDate}</span></div>`;
      lastDateLabel = msgDate;
    }
    const isSent = m.sender_id === PORTAL_USER.id;
    const bubbleClass = isSent ? 'sent' : 'received';
    const time = parseServerDate(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let content = '';
    if (m.type === 'file' && m.attachment) {
      const attachBase = currentConvIsBridge ? '/portal/bridge/attachment' : '/portal/chat/attachment';
      content = renderFileContent(m.attachment, m.id, attachBase);
    } else if (m.type === 'system') {
      return `<div class="text-center small text-muted my-2">${m.content}</div>`;
    } else if (m.is_deleted) {
      content = '<i class="bi bi-ban me-1"></i>This message was deleted';
    } else {
      content = linkify(escapeHtml(m.content));
    }

    const sender = !isSent ? `<div class="msg-sender">${m.sender_name}</div>` : '';
    const editedLabel = m.is_edited && !m.is_deleted ? '<span class="msg-edited">edited</span>' : '';

    // Tick marks for sent messages
    let ticks = '';
    if (isSent && !m.is_deleted) {
      if (m.read_status === 'read') {
        ticks = '<span class="msg-ticks read" title="Read"><i class="bi bi-check-all"></i></span>';
      } else {
        ticks = '<span class="msg-ticks" title="Sent"><i class="bi bi-check"></i></span>';
      }
    }

    // Action menu trigger for own non-deleted text messages
    const actionBtn = isSent && !m.is_deleted
      ? `<span class="msg-action-trigger" onclick="event.stopPropagation(); showMsgActions(${m.id})"><i class="bi bi-three-dots-vertical"></i></span>`
      : '';

    return `${dateDivider}<div class="msg-bubble ${bubbleClass}${m.is_deleted ? ' deleted' : ''}" data-msg-id="${m.id}">
      ${actionBtn}
      ${sender}
      <div class="msg-content">${content}</div>
      <div class="msg-footer">
        ${editedLabel}
        <span class="msg-time">${time}</span>
        ${ticks}
      </div>
    </div>`;
  }).join('');

  if (mode === 'replace') {
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  } else if (mode === 'prepend') {
    const oldHeight = container.scrollHeight;
    container.insertAdjacentHTML('afterbegin', html);
    container.scrollTop = container.scrollHeight - oldHeight;
  } else {
    container.insertAdjacentHTML('beforeend', html);
    container.scrollTop = container.scrollHeight;
  }
}

function sendMessage() {
  const input = document.getElementById('messageInput');
  const content = input.value.trim();
  if (!content || !currentConversationId) return;

  const msgUrl = currentConvIsBridge
    ? `/portal/bridge/conversations/${currentConversationId}/messages`
    : `/portal/chat/conversations/${currentConversationId}/messages`;

  fetch(msgUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        input.value = '';
        input.style.height = 'auto';
      }
    });
}

function showChatUploadPlaceholder(filename) {
  const container = document.getElementById('chatMessages');
  if (!container) return null;
  const id = 'chat-upload-' + Date.now();
  const html = `<div class="msg-bubble sent chat-uploading" id="${id}">
    <div class="msg-content"><span class="gc-upload-spinner"></span><i class="bi bi-paperclip me-1"></i><span>${escapeHtml(filename)}</span></div>
    <div class="msg-footer"><span class="msg-time">Uploading…</span></div>
  </div>`;
  container.insertAdjacentHTML('beforeend', html);
  container.scrollTop = container.scrollHeight;
  return id;
}
function markChatUploadFailed(id, reason) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('chat-upload-failed');
  const footer = el.querySelector('.msg-time');
  if (footer) footer.innerHTML = '<i class="bi bi-exclamation-circle me-1"></i>' + escapeHtml(reason || 'Upload failed');
  const spinner = el.querySelector('.gc-upload-spinner');
  if (spinner) spinner.remove();
}

function uploadChatFileDirect(file) {
  if (!currentConversationId) return;
  if (file.size > 10 * 1024 * 1024) { alert('File too large. Max 10 MB.'); return; }
  const placeholderId = showChatUploadPlaceholder(file.name || 'pasted-image.png');
  const formData = new FormData();
  formData.append('file', file, file.name || ('pasted-' + Date.now() + '.png'));
  const fileUrl = currentConvIsBridge
    ? `/portal/bridge/conversations/${currentConversationId}/file`
    : `/portal/chat/conversations/${currentConversationId}/file`;
  fetch(fileUrl, {
    method: 'POST',
    body: formData
  })
    .then(r => r.json().then(j => ({ ok: r.ok, body: j })))
    .then(res => {
      if (res.ok && res.body.success) {
        const el = document.getElementById(placeholderId);
        if (el) el.remove();
      } else {
        markChatUploadFailed(placeholderId, (res.body && res.body.message) || 'Upload failed');
      }
    })
    .catch(() => markChatUploadFailed(placeholderId, 'Upload failed'));
}

function sendFile() {
  const fileInput = document.getElementById('fileInput');
  if (!fileInput.files.length || !currentConversationId) return;
  const file = fileInput.files[0];
  fileInput.value = '';
  uploadChatFileDirect(file);
}

// Paste screenshot/image directly into chat
document.addEventListener('DOMContentLoaded', function() {
  const input = document.getElementById('messageInput');
  if (!input) return;
  input.addEventListener('paste', function(e) {
    const items = (e.clipboardData || window.clipboardData)?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) { e.preventDefault(); uploadChatFileDirect(file); return; }
      }
    }
  });
});

function showSidebar() {
  document.getElementById('chatSidebar').classList.remove('hidden');
}

// ── TASKS ──────────────────────────────────────────────────

var _allTasks = [];
var _showArchived = false;
var _archivePage = 1;
var _archiveSearch = '';
var _archiveSearchTimer = null;

function loadTasks() {
  if (_showArchived) {
    loadArchivedTasks();
    return;
  }

  var status = document.getElementById('filterStatus')?.value || '';
  var priority = document.getElementById('filterPriority')?.value || '';

  var url = '/portal/tasks/list?';
  if (status) url += 'status=' + status + '&';
  if (priority) url += 'priority=' + priority + '&';

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (!res.success) return;
      _allTasks = res.data.tasks;
      populateUserFilter(_allTasks);
      applyUserFilter();
    });
}

function loadArchivedTasks() {
  var url = '/portal/tasks/list?archived=1&limit=100&page=' + _archivePage;
  if (_archiveSearch) url += '&search=' + encodeURIComponent(_archiveSearch);

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (!res.success) return;
      renderArchivedTable(res.data.tasks, res.data.total, res.data.page, res.data.totalPages);
    });
}

function toggleArchiveView() {
  _showArchived = !_showArchived;
  _archivePage = 1;
  _archiveSearch = '';

  var btn = document.getElementById('archiveToggleBtn');
  var filtersRow = document.querySelectorAll('#filterStatus, #filterPriority, #filterUser');
  if (btn) {
    if (_showArchived) {
      btn.classList.remove('btn-outline-secondary');
      btn.classList.add('btn-secondary');
      btn.querySelector('span').textContent = 'Active Tasks';
      btn.querySelector('i').className = 'bi bi-list-task me-1';
      filtersRow.forEach(function(el) { el.style.display = 'none'; });
    } else {
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-outline-secondary');
      btn.querySelector('span').textContent = 'Archived';
      btn.querySelector('i').className = 'bi bi-archive me-1';
      filtersRow.forEach(function(el) { el.style.display = ''; });
    }
  }
  closeTaskDetail();
  loadTasks();
}

function renderArchivedTable(tasks, total, page, totalPages) {
  var list = document.getElementById('tasksList');
  if (!list) return;

  // Search bar
  var html = '<div class="archived-header">';
  html += '<div class="archived-search-wrap"><i class="bi bi-search"></i><input type="text" class="form-control form-control-sm" id="archiveSearchInput" placeholder="Search archived tasks..." value="' + escapeHtml(_archiveSearch) + '"></div>';
  html += '<span class="archived-count">' + total + ' archived task' + (total !== 1 ? 's' : '') + '</span>';
  html += '</div>';

  if (!tasks.length) {
    html += '<div class="text-center text-muted p-4">No archived tasks found</div>';
    list.innerHTML = html;
    setupArchiveSearch();
    return;
  }

  // Table
  html += '<div class="archived-table-wrap"><table class="archived-table">';
  html += '<thead><tr><th>Title</th><th>Status</th><th>Priority</th><th>Assigned To</th><th>Created By</th><th>Created</th><th>Due Date</th><th>Archived</th><th></th></tr></thead>';
  html += '<tbody>';
  tasks.forEach(function(t) {
    var createdStr = t.created_at ? new Date(t.created_at).toLocaleDateString() : '--';
    var dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString() : '';
    var archivedDate = t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '--';
    html += '<tr onclick="openTask(' + t.id + ')" style="cursor:pointer">';
    html += '<td class="archived-title">' + escapeHtml(t.title) + '</td>';
    html += '<td><span class="status-badge status-' + t.status + '">' + (t.status === 'completed' ? 'Done' : t.status.replace('_', ' ')) + '</span></td>';
    html += '<td><span class="priority-badge priority-' + t.priority + '">' + t.priority + '</span></td>';
    html += '<td>' + escapeHtml(t.assigned_to_name) + '</td>';
    html += '<td>' + escapeHtml(t.assigned_by_name) + '</td>';
    html += '<td>' + createdStr + '</td>';
    html += '<td>' + dueStr + '</td>';
    html += '<td>' + archivedDate + '</td>';
    html += '<td><button class="task-archive-btn unarchive" onclick="event.stopPropagation(); archiveTask(' + t.id + ')" title="Unarchive"><i class="bi bi-arrow-counterclockwise"></i></button></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // Pagination
  if (totalPages > 1) {
    html += '<div class="archived-pagination">';
    html += '<button class="btn btn-sm btn-outline-secondary" ' + (page <= 1 ? 'disabled' : '') + ' onclick="goArchivePage(' + (page - 1) + ')"><i class="bi bi-chevron-left"></i></button>';
    html += '<span class="archived-page-info">Page ' + page + ' of ' + totalPages + '</span>';
    html += '<button class="btn btn-sm btn-outline-secondary" ' + (page >= totalPages ? 'disabled' : '') + ' onclick="goArchivePage(' + (page + 1) + ')"><i class="bi bi-chevron-right"></i></button>';
    html += '</div>';
  }

  list.innerHTML = html;
  setupArchiveSearch();
}

function setupArchiveSearch() {
  var input = document.getElementById('archiveSearchInput');
  if (!input) return;
  input.addEventListener('input', function() {
    clearTimeout(_archiveSearchTimer);
    var val = input.value.trim();
    _archiveSearchTimer = setTimeout(function() {
      _archiveSearch = val;
      _archivePage = 1;
      loadArchivedTasks();
    }, 400);
  });
  input.focus();
}

function goArchivePage(page) {
  _archivePage = page;
  loadArchivedTasks();
}

function archiveTask(taskId) {
  fetch('/portal/tasks/' + taskId + '/archive', { method: 'PATCH' })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (!res.success) return;
      closeTaskDetail();
      loadTasks();
    });
}

function populateUserFilter(tasks) {
  var select = document.getElementById('filterUser');
  if (!select) return;
  var prev = select.value;
  var users = {};
  tasks.forEach(function(t) {
    if (t.assigned_to && t.assigned_to_name) users[t.assigned_to] = t.assigned_to_name;
    if (t.assigned_by && t.assigned_by_name) users[t.assigned_by] = t.assigned_by_name;
  });
  var sorted = Object.entries(users).sort(function(a, b) { return a[1].localeCompare(b[1]); });
  var html = '<option value="">All Users</option>';
  sorted.forEach(function(pair) {
    html += '<option value="' + pair[0] + '">' + escapeHtml(pair[1]) + '</option>';
  });
  select.innerHTML = html;
  if (prev) select.value = prev;
}

function applyUserFilter() {
  var userId = document.getElementById('filterUser')?.value || '';
  var filtered = _allTasks;
  if (userId) {
    filtered = _allTasks.filter(function(t) {
      return String(t.assigned_to) === userId || String(t.assigned_by) === userId;
    });
  }
  renderTasks(filtered);
}

function renderTasks(tasks) {
  var list = document.getElementById('tasksList');
  if (!list) return;

  if (!tasks.length) {
    list.innerHTML = '<div class="text-center text-muted p-4" style="grid-column:1/-1">No tasks found</div>';
    return;
  }

  list.innerHTML = tasks.map(function(t) {
    var dueStr = t.due_date ? '<i class="bi bi-calendar-event"></i> Due: ' + new Date(t.due_date).toLocaleDateString() : '';
    var createdStr = t.created_at ? new Date(t.created_at).toLocaleDateString() : '';
    var isOverdue = t.due_date && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.due_date) < new Date(new Date().toDateString());
    var overdueClass = isOverdue ? ' task-overdue' : '';
    var overdueIcon = isOverdue ? '<span class="overdue-badge"><i class="bi bi-exclamation-triangle-fill me-1"></i>OVERDUE</span>' : '';
    var archiveBtn = '';
    if (!_showArchived && (t.status === 'completed' || t.status === 'cancelled')) {
      archiveBtn = '<button class="task-archive-btn" onclick="event.stopPropagation(); archiveTask(' + t.id + ')" title="Archive"><i class="bi bi-archive"></i></button>';
    }
    if (_showArchived) {
      archiveBtn = '<button class="task-archive-btn unarchive" onclick="event.stopPropagation(); archiveTask(' + t.id + ')" title="Unarchive"><i class="bi bi-arrow-counterclockwise"></i></button>';
    }
    var archivedBadge = t.is_archived ? '<span class="status-badge status-archived"><i class="bi bi-archive me-1"></i>Archived</span>' : '';
    return '<div class="task-card' + overdueClass + (t.is_archived ? ' task-archived' : '') + '" onclick="openTask(' + t.id + ')">' +
      '<div class="task-card-header">' +
        '<span class="task-title">' + escapeHtml(t.title) + '</span>' +
        '<div class="d-flex align-items-center gap-1">' +
          '<span class="priority-badge priority-' + t.priority + '">' + t.priority + '</span>' +
          archiveBtn +
        '</div>' +
      '</div>' +
      '<div class="task-meta">' +
        '<span class="status-badge status-' + t.status + '">' + (t.status === 'completed' ? '<i class="bi bi-check-circle-fill me-1"></i>DONE' : t.status.replace('_', ' ')) + '</span>' +
        archivedBadge +
        overdueIcon +
        '<span><i class="bi bi-person"></i> ' + t.assigned_to_name + '</span>' +
        (dueStr ? '<span>' + dueStr + '</span>' : '') +
        '<span><i class="bi bi-chat-dots"></i> ' + (t.comment_count || 0) + '</span>' +
        '<span><i class="bi bi-person-up"></i> ' + t.assigned_by_name + '</span>' +
        '<span><i class="bi bi-clock"></i> ' + createdStr + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function showCreateTaskModal() {
  new bootstrap.Modal(document.getElementById('createTaskModal')).show();
}

function createTask() {
  const title = document.getElementById('taskTitle').value.trim();
  const description = document.getElementById('taskDescription').value.trim();
  const priority = document.getElementById('taskPriority').value;
  const due_date = document.getElementById('taskDueDate').value;
  const assigned_to = document.getElementById('taskAssignTo').value;

  if (!title) return alert('Title is required');
  if (!assigned_to) return alert('Please select an assignee');

  fetch('/portal/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description, priority, due_date, assigned_to })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        bootstrap.Modal.getInstance(document.getElementById('createTaskModal')).hide();
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDescription').value = '';
        document.getElementById('taskPriority').value = 'medium';
        document.getElementById('taskDueDate').value = '';
        document.getElementById('taskAssignTo').value = '';
        loadTasks();
      } else {
        alert(res.message);
      }
    });
}

function openTask(taskId) {
  currentTaskId = taskId;

  fetch(`/portal/tasks/${taskId}`)
    .then(r => r.json())
    .then(res => {
      if (!res.success) return alert(res.message);
      renderTaskDetail(res.data.task, res.data.comments);
    });
}

function renderTaskDetail(task, comments) {
  const panel = document.getElementById('taskDetailPanel');
  const body = document.getElementById('taskDetailBody');
  const commentsEl = document.getElementById('taskComments');
  const actionsEl = document.getElementById('taskDetailActions');

  // Status change dropdown for assignee/creator/admin
  let statusHtml = '';
  if (task.assigned_to === PORTAL_USER.id || task.assigned_by === PORTAL_USER.id || ['CLIENT_ADMIN', 'CLIENT_TOP_MGMT'].includes(PORTAL_USER.role)) {
    statusHtml = `<select class="form-select form-select-sm" style="width:auto" onchange="updateTaskStatus(${task.id}, this.value)">
      <option value="open" ${task.status === 'open' ? 'selected' : ''}>Open</option>
      <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
      <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>Completed</option>
      <option value="cancelled" ${task.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
    </select>`;
  }
  var archiveBtnHtml = '';
  if (task.is_archived) {
    archiveBtnHtml = '<button class="btn btn-sm btn-outline-secondary" onclick="archiveTask(' + task.id + ')"><i class="bi bi-arrow-counterclockwise me-1"></i>Unarchive</button>';
  } else if (task.status === 'completed' || task.status === 'cancelled') {
    archiveBtnHtml = '<button class="btn btn-sm btn-outline-secondary" onclick="archiveTask(' + task.id + ')"><i class="bi bi-archive me-1"></i>Archive</button>';
  }
  actionsEl.innerHTML = statusHtml + archiveBtnHtml;

  var createdDate = task.created_at ? new Date(task.created_at).toLocaleDateString() : '';
  var dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString() : '';

  body.innerHTML = `
    <div class="task-detail-compact">
      <div class="task-detail-title">${escapeHtml(task.title)}</div>
      ${task.description ? `<div class="task-detail-desc">${escapeHtml(task.description)}</div>` : ''}
      <div class="task-detail-tags">
        <span class="priority-badge priority-${task.priority}">${task.priority}</span>
        <span class="status-badge status-${task.status}">${task.status === 'completed' ? '<i class="bi bi-check-circle-fill me-1"></i>DONE' : task.status.replace('_', ' ')}</span>
        <span class="task-detail-info"><i class="bi bi-person-up"></i> ${task.assigned_by_name}</span>
        <span class="task-detail-info"><i class="bi bi-person"></i> ${task.assigned_to_name}</span>
        <span class="task-detail-info"><i class="bi bi-clock"></i> Created: ${createdDate}</span>
        ${dueDate ? `<span class="task-detail-info"><i class="bi bi-calendar-event"></i> Due: ${dueDate}</span>` : ''}
      </div>
    </div>
  `;

  // Comments
  commentsEl.innerHTML = '<h6 class="mt-3 mb-2 small fw-bold">Correspondence</h6>' +
    (comments.length ? comments.map(c => {
      let attachHtml = '';
      if (c.attachments && c.attachments.length) {
        attachHtml = c.attachments.map(a => {
          const ext = a.file_name.split('.').pop().toLowerCase();
          const meta = getFileIconMeta(ext);
          const size = a.file_size ? formatFileSize(a.file_size) : '';
          return `<a href="/portal/tasks/attachment/${a.id}" target="_blank" class="comment-attachment">
            <i class="bi ${meta.i}" style="color:${meta.c};font-size:1.1rem;"></i> ${escapeHtml(a.file_name)} ${size ? `<span class="text-muted">(${size})</span>` : ''}
          </a>`;
        }).join('');
      }
      const isOwn = c.user_id === PORTAL_USER.id;
      const editBtn = isOwn ? `<button class="comment-edit-btn" onclick="startEditPortalComment(${c.id}, this)" title="Edit"><i class="bi bi-pencil"></i></button>` : '';
      return `<div class="comment-item" data-comment-id="${c.id}">
        <div class="comment-header">
          <span class="comment-author">${c.user_name}</span>
          <div>${editBtn}<span class="comment-time">${timeAgo(c.created_at)}</span></div>
        </div>
        <div class="comment-body" id="portalCommentBody-${c.id}">${escapeHtml(c.content)}</div>
        <div class="comment-edit-form" id="portalCommentEdit-${c.id}" style="display:none">
          <textarea class="form-control form-control-sm" id="portalCommentEditInput-${c.id}" rows="2">${escapeHtml(c.content)}</textarea>
          <div class="d-flex gap-1 mt-1">
            <button class="btn btn-sm btn-primary" style="font-size:0.7rem;padding:2px 10px;" onclick="saveEditPortalComment(${c.id})">Save</button>
            <button class="btn btn-sm btn-outline-secondary" style="font-size:0.7rem;padding:2px 10px;" onclick="cancelEditPortalComment(${c.id})">Cancel</button>
          </div>
        </div>
        ${attachHtml}
      </div>`;
    }).join('') : '<div class="text-muted small py-2">No comments yet</div>');

  panel.style.display = 'flex';
}

function closeTaskDetail() {
  document.getElementById('taskDetailPanel').style.display = 'none';
  currentTaskId = null;
}

function updateTaskStatus(taskId, status) {
  fetch(`/portal/tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) loadTasks();
    });
}

function addTaskComment() {
  if (!currentTaskId) return;
  const input = document.getElementById('taskCommentInput');
  const fileInput = document.getElementById('taskFileInput');
  const content = input.value.trim();
  const hasFile = fileInput && fileInput.files.length > 0;

  if (!content && !hasFile) return;

  const formData = new FormData();
  if (content) formData.append('content', content);
  if (hasFile) formData.append('file', fileInput.files[0]);

  fetch(`/portal/tasks/${currentTaskId}/comments`, {
    method: 'POST',
    body: formData
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        input.value = '';
        clearTaskFile();
        openTask(currentTaskId);
      } else {
        alert(res.message);
      }
    });
}

function previewTaskFile() {
  const fileInput = document.getElementById('taskFileInput');
  const preview = document.getElementById('taskFilePreview');
  const nameEl = document.getElementById('taskFileName');
  if (fileInput.files.length) {
    nameEl.textContent = fileInput.files[0].name;
    preview.style.display = '';
  }
}

function clearTaskFile() {
  const fileInput = document.getElementById('taskFileInput');
  if (fileInput) fileInput.value = '';
  const preview = document.getElementById('taskFilePreview');
  if (preview) preview.style.display = 'none';
}

// ── USERS (Admin only) ─────────────────────────────────────

function loadUsers() {
  fetch('/portal/users/list')
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      renderUsers(res.data.users);
    });
}

function renderUsers(users) {
  const list = document.getElementById('usersList');
  if (!list) return;

  if (!users.length) {
    list.innerHTML = '<div class="text-center text-muted p-4">No team members found</div>';
    return;
  }

  // Group users by role
  const roleOrder = ['CLIENT_ADMIN', 'CLIENT_TOP_MGMT', 'CLIENT_MGMT', 'CLIENT_MANAGER', 'CLIENT_SALES', 'CLIENT_USER'];
  const roleLabels = {
    CLIENT_ADMIN: { title: 'Admin', icon: 'bi-shield-lock-fill', color: '#a78bfa' },
    CLIENT_TOP_MGMT: { title: 'Top Management', icon: 'bi-star-fill', color: '#3b82f6' },
    CLIENT_MGMT: { title: 'Management', icon: 'bi-briefcase-fill', color: '#22c55e' },
    CLIENT_MANAGER: { title: 'Managers', icon: 'bi-person-badge-fill', color: '#eab308' },
    CLIENT_SALES: { title: 'Sales', icon: 'bi-cart-fill', color: '#f97316' },
    CLIENT_USER: { title: 'Users', icon: 'bi-person-fill', color: '#94a3b8' }
  };

  const grouped = {};
  roleOrder.forEach(r => { grouped[r] = []; });
  users.forEach(u => {
    if (grouped[u.role_name]) grouped[u.role_name].push(u);
  });

  var html = '';
  roleOrder.forEach(role => {
    var group = grouped[role];
    if (!group.length) return;
    var info = roleLabels[role];

    html += '<div class="user-role-section">';
    html += '<div class="user-role-header">';
    html += '<div class="user-role-header-left">';
    html += '<i class="bi ' + info.icon + '" style="color:' + info.color + ';font-size:1rem"></i>';
    html += '<span class="user-role-title">' + info.title + '</span>';
    html += '<span class="user-role-count">' + group.length + '</span>';
    html += '</div></div>';

    html += '<div class="user-role-grid">';
    group.forEach(function(u) {
      var initial = u.name.charAt(0).toUpperCase();
      var isAdmin = u.role_name === 'CLIENT_ADMIN';
      var activeClass = u.is_active ? 'active' : 'inactive';
      var activeText = u.is_active ? 'Active' : 'Inactive';
      var safeName = escapeHtml(u.name).replace(/'/g, "\\'");
      var safeEmail = escapeHtml(u.email).replace(/'/g, "\\'");

      html += '<div class="user-card ' + (u.is_active ? '' : 'user-card-inactive') + '">';
      html += '<div class="user-card-avatar" style="background:linear-gradient(135deg, ' + info.color + ', ' + info.color + '99)">' + initial + '</div>';
      html += '<div class="user-card-info">';
      html += '<div class="user-card-name">' + escapeHtml(u.name) + '</div>';
      html += '<div class="user-card-email">' + escapeHtml(u.email) + '</div>';
      html += '<div class="user-card-meta"><span class="active-badge ' + activeClass + '">' + activeText + '</span></div>';
      html += '</div>';
      html += '<div class="user-card-actions">';
      if (!isAdmin) {
        html += '<button class="btn btn-outline-secondary" title="Edit" onclick="showEditUserModal(' + u.id + ', \'' + safeName + '\', \'' + safeEmail + '\', ' + u.role_id + ')"><i class="bi bi-pencil"></i></button>';
        html += '<button class="btn btn-outline-secondary" title="Reset Password" onclick="showResetPwModal(' + u.id + ', \'' + safeName + '\')"><i class="bi bi-key"></i></button>';
        html += '<button class="btn ' + (u.is_active ? 'btn-outline-danger' : 'btn-outline-success') + '" title="' + (u.is_active ? 'Deactivate' : 'Activate') + '" onclick="toggleUserActive(' + u.id + ')"><i class="bi ' + (u.is_active ? 'bi-person-slash' : 'bi-person-check') + '"></i></button>';
      }
      html += '</div></div>';
    });
    html += '</div></div>';
  });

  list.innerHTML = html;
}

function showCreateUserModal() {
  document.getElementById('editUserId').value = '';
  document.getElementById('userModalTitle').textContent = 'Add Member';
  document.getElementById('userModalSaveBtn').textContent = 'Add Member';
  document.getElementById('userName').value = '';
  document.getElementById('userEmail').value = '';
  document.getElementById('userPassword').value = '';
  document.getElementById('passwordField').style.display = '';
  document.getElementById('userRole').value = document.getElementById('userRole').options[0]?.value || '';
  new bootstrap.Modal(document.getElementById('userModal')).show();
}

function showEditUserModal(id, name, email, roleId) {
  document.getElementById('editUserId').value = id;
  document.getElementById('userModalTitle').textContent = 'Edit Member';
  document.getElementById('userModalSaveBtn').textContent = 'Save Changes';
  document.getElementById('userName').value = name;
  document.getElementById('userEmail').value = email;
  document.getElementById('userPassword').value = '';
  document.getElementById('passwordField').style.display = 'none';
  document.getElementById('userRole').value = roleId;
  new bootstrap.Modal(document.getElementById('userModal')).show();
}

function saveUser() {
  const id = document.getElementById('editUserId').value;
  const name = document.getElementById('userName').value.trim();
  const email = document.getElementById('userEmail').value.trim();
  const password = document.getElementById('userPassword').value;
  const role_id = parseInt(document.getElementById('userRole').value);

  if (!name || !email) return alert('Name and email are required');

  if (id) {
    // Update
    fetch(`/portal/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role_id })
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
          loadUsers();
        } else {
          alert(res.message);
        }
      });
  } else {
    // Create
    if (!password || password.length < 6) return alert('Password must be at least 6 characters');
    fetch('/portal/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role_id })
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
          loadUsers();
        } else {
          alert(res.message);
        }
      });
  }
}

function showResetPwModal(id, name) {
  document.getElementById('resetPwUserId').value = id;
  document.getElementById('resetPwUserName').textContent = name;
  document.getElementById('resetPwInput').value = '';
  new bootstrap.Modal(document.getElementById('resetPwModal')).show();
}

function resetPassword() {
  const id = document.getElementById('resetPwUserId').value;
  const password = document.getElementById('resetPwInput').value;
  if (!password || password.length < 6) return alert('Password must be at least 6 characters');

  fetch(`/portal/users/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        bootstrap.Modal.getInstance(document.getElementById('resetPwModal')).hide();
        alert('Password reset successfully');
      } else {
        alert(res.message);
      }
    });
}

function toggleUserActive(id) {
  if (!confirm('Are you sure you want to change this user\'s status?')) return;
  fetch(`/portal/users/${id}/toggle`, { method: 'PATCH' })
    .then(r => r.json())
    .then(res => {
      if (res.success) loadUsers();
      else alert(res.message);
    });
}

// ── SOCKET.IO EVENTS ───────────────────────────────────────

portalSocket.on('portal:message', (msg) => {
  if (msg.conversation_id === currentConversationId) {
    renderMessages([msg], false);
    const container = document.getElementById('chatMessages');
    container.scrollTop = container.scrollHeight;

    // Mark as read and emit read receipt
    fetch(`/portal/chat/conversations/${currentConversationId}/read`, { method: 'POST' })
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data.last_read_message_id) {
          portalSocket.emit('portal:read', {
            conversation_id: currentConversationId,
            last_read_message_id: res.data.last_read_message_id
          });
        }
      });
  }

  if (msg.sender_id !== PORTAL_USER.id) {
    _lastNotifiedMsgId = msg.id;
    playNotificationSound();
  }

  loadConversations();
  updateUnreadBadge();
});

// Notification for messages (arrives even if conv is not open)
var _lastNotifiedMsgId = null;
portalSocket.on('portal:notify', (msg) => {
  if (msg.sender_id === PORTAL_USER.id) return;
  // Don't show toast if user is already viewing this conversation
  if (msg.conversation_id === currentConversationId) return;
  // Prevent duplicate if portal:message already handled this msg
  if (msg.id && msg.id === _lastNotifiedMsgId) return;
  _lastNotifiedMsgId = msg.id;

  playNotificationSound();
  loadConversations();
  updateUnreadBadge();

  var senderName = msg.sender_name || 'Someone';
  var preview = msg.type === 'file' ? 'Sent a file' : (msg.content || '').substring(0, 80);
  var convName = msg.conversation_name || senderName;

  showChatToast({
    senderName: senderName,
    preview: preview,
    conversationName: convName,
    conversationId: msg.conversation_id,
    isGroup: !!msg.conversation_name
  });
});

// Edit/delete message live updates
portalSocket.on('portal:message:edit', (data) => {
  if (data.conversation_id === currentConversationId) {
    const bubble = document.querySelector(`[data-msg-id="${data.id}"]`);
    if (bubble) {
      const contentEl = bubble.querySelector('.msg-content');
      if (contentEl) contentEl.textContent = data.content;
      // Add edited label
      if (!bubble.querySelector('.msg-edited')) {
        const footer = bubble.querySelector('.msg-footer');
        if (footer) {
          const edited = document.createElement('span');
          edited.className = 'msg-edited';
          edited.textContent = 'edited';
          footer.insertBefore(edited, footer.firstChild);
        }
      }
    }
  }
});

portalSocket.on('portal:message:delete', (data) => {
  if (data.conversation_id === currentConversationId) {
    const bubble = document.querySelector(`[data-msg-id="${data.id}"]`);
    if (bubble) {
      bubble.classList.add('deleted');
      const contentEl = bubble.querySelector('.msg-content');
      if (contentEl) contentEl.innerHTML = '<i class="bi bi-ban me-1"></i>This message was deleted';
      // Remove action menu and ticks
      const menu = bubble.querySelector('.msg-action-menu');
      if (menu) menu.remove();
      const footer = bubble.querySelector('.msg-footer .msg-ticks');
      if (footer) footer.remove();
    }
  }
  loadConversations();
});

// Read receipt — update ticks to blue for messages that have been read
portalSocket.on('portal:read', (data) => {
  if (data.conversation_id === currentConversationId && data.user_id !== PORTAL_USER.id) {
    // Update all sent messages up to last_read_message_id to blue ticks
    document.querySelectorAll('.msg-bubble.sent').forEach(el => {
      const msgId = parseInt(el.getAttribute('data-msg-id'));
      if (msgId && msgId <= data.last_read_message_id) {
        const tickEl = el.querySelector('.msg-ticks');
        if (tickEl) {
          tickEl.classList.add('read');
          tickEl.title = 'Read';
          tickEl.innerHTML = '<i class="bi bi-check-all"></i>';
        }
      }
    });
  }
});

// Bridge message handler — renders inline when support conv is open in the chat window
if (typeof mainSocket !== 'undefined') {
  mainSocket.on('bridge:message', (msg) => {
    if (currentConvIsBridge && msg.conversation_id === currentConversationId) {
      const normalized = normalizeBridgeMessages([msg]);
      renderMessages(normalized, 'append');
      fetch(`/portal/bridge/conversations/${currentConversationId}/read`, { method: 'POST' });
      loadConversations();
      return;
    }
    // Conv not open — just refresh list so unread badge updates
    loadConversations();
    updateUnreadBadge();
  });

  mainSocket.on('bridge:read', (data) => {
    if (currentConvIsBridge && data.conversation_id === currentConversationId) {
      document.querySelectorAll('.msg-bubble.sent').forEach(el => {
        const tickEl = el.querySelector('.msg-ticks');
        if (tickEl) { tickEl.classList.add('read'); tickEl.innerHTML = '<i class="bi bi-check-all"></i>'; }
      });
    }
  });

  mainSocket.on('bridge:message:delete', (data) => {
    if (currentConvIsBridge && data.conversation_id === currentConversationId) {
      const bubble = document.querySelector(`[data-msg-id="${data.id}"]`);
      if (bubble) {
        bubble.classList.add('deleted');
        const contentEl = bubble.querySelector('.msg-content');
        if (contentEl) contentEl.innerHTML = '<i class="bi bi-ban me-1"></i>This message was deleted';
      }
    }
    loadConversations();
  });
}

// Typing indicators
let typingUsers = {};

portalSocket.on('portal:typing', (data) => {
  if (data.conversation_id === currentConversationId && data.user_id !== PORTAL_USER.id) {
    typingUsers[data.user_id] = data.user_name;
    updateTypingIndicator();

    // Auto-clear after 3 seconds
    clearTimeout(typingUsers[data.user_id + '_timer']);
    typingUsers[data.user_id + '_timer'] = setTimeout(() => {
      delete typingUsers[data.user_id];
      delete typingUsers[data.user_id + '_timer'];
      updateTypingIndicator();
    }, 3000);
  }
});

portalSocket.on('portal:stop-typing', (data) => {
  if (data.conversation_id === currentConversationId) {
    delete typingUsers[data.user_id];
    delete typingUsers[data.user_id + '_timer'];
    updateTypingIndicator();
  }
});

function updateTypingIndicator() {
  const el = document.getElementById('chatTyping');
  const names = Object.entries(typingUsers)
    .filter(([k]) => !k.includes('_timer'))
    .map(([, v]) => v);

  if (names.length === 0) {
    el.style.display = 'none';
    return;
  }

  let text;
  if (names.length === 1) {
    text = `${names[0]} is typing`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing`;
  } else {
    text = `${names.length} people are typing`;
  }

  document.getElementById('typingText').innerHTML = `
    <span class="typing-dots"><span></span><span></span><span></span></span> ${text}
  `;
  el.style.display = 'block';
}

// Online/offline presence
portalSocket.on('portal:online-users', (userIds) => {
  onlineUserIds = new Set(userIds);
  if (document.getElementById('conversationList')) loadConversations();
  updateContactOnlineStatus();
  updateChatHeaderStatus();
});

portalSocket.on('portal:presence', (data) => {
  if (data.status === 'online') {
    onlineUserIds.add(data.user_id);
  } else {
    onlineUserIds.delete(data.user_id);
  }
  if (document.getElementById('conversationList')) loadConversations();
  updateContactOnlineStatus();
  updateChatHeaderStatus();
});

function updateContactOnlineStatus() {
  document.querySelectorAll('.contact-item').forEach(el => {
    var userId = parseInt(el.getAttribute('data-user-id'));
    if (!userId) return;
    var isOnline = onlineUserIds.has(userId);
    var dotClass = isOnline ? 'online-dot' : 'offline-dot';
    var wrap = el.querySelector('.conv-avatar-wrap');
    if (wrap) {
      var existingDot = wrap.querySelector('.online-dot, .offline-dot');
      if (existingDot) {
        existingDot.className = dotClass;
      } else {
        var dotEl = document.createElement('span');
        dotEl.className = dotClass;
        wrap.appendChild(dotEl);
      }
    } else {
      var avatar = el.querySelector('.contact-avatar');
      if (avatar) {
        var parent = avatar.parentElement;
        avatar.remove();
        var wrapDiv = document.createElement('div');
        wrapDiv.className = 'conv-avatar-wrap';
        wrapDiv.appendChild(avatar);
        var dotEl = document.createElement('span');
        dotEl.className = dotClass;
        wrapDiv.appendChild(dotEl);
        parent.insertBefore(wrapDiv, parent.firstChild);
      }
    }
  });
}

function updateChatHeaderStatus() {
  if (currentChatPeerId) {
    const statusEl = document.getElementById('chatHeaderStatus');
    if (onlineUserIds.has(currentChatPeerId)) {
      statusEl.innerHTML = '<span class="online-dot-sm"></span> Online';
      statusEl.className = 'chat-header-status online';
    } else {
      statusEl.textContent = 'Offline';
      statusEl.className = 'chat-header-status';
    }
  }
}

// Unread badge on Chat tab
function updateUnreadBadge() {
  fetch('/portal/chat/unread-count')
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      const badge = document.querySelector('.chat-unread-badge');
      if (badge) {
        if (res.data.total > 0) {
          badge.textContent = res.data.total > 99 ? '99+' : res.data.total;
          badge.style.display = '';
        } else {
          badge.style.display = 'none';
        }
      }
    });
}

portalSocket.on('portal:task:new', (task) => {
  if (document.getElementById('tasksList')) loadTasks();

  // Show toast notification + sound
  if (task && task.assigned_to === PORTAL_USER.id) {
    playNotificationSound();
    showPortalToast({
      title: task.title,
      sender: task.assigned_by_name,
      priority: task.priority,
      taskId: task.id
    });
  }
});

portalSocket.on('portal:task:status', (data) => {
  if (document.getElementById('tasksList')) loadTasks();
  if (data.task_id === currentTaskId) openTask(currentTaskId);
  playNotificationSound();

  // Show toast
  const statusLabels = { completed: 'DONE', in_progress: 'In Progress', open: 'Open', cancelled: 'Cancelled' };
  const statusLabel = statusLabels[data.status] || data.status;
  const isCompleted = data.status === 'completed';

  showPortalToast({
    title: data.title,
    sender: data.changed_by_name,
    priority: isCompleted ? 'completed' : data.priority,
    taskId: data.task_id,
    customText: `Marked <strong>${statusLabel}</strong> by <strong>${escapeHtml(data.changed_by_name)}</strong>`,
    customIcon: isCompleted ? 'bi-check-circle-fill' : 'bi-arrow-repeat'
  });
});

portalSocket.on('portal:task:comment', (data) => {
  if (data.task_id === currentTaskId) openTask(currentTaskId);

  playNotificationSound();
  showPortalToast({
    title: data.task_title || 'Task',
    sender: data.commenter_name,
    priority: data.task_priority || 'medium',
    taskId: data.task_id,
    customText: `New comment from <strong>${escapeHtml(data.commenter_name || '')}</strong>`,
    customIcon: 'bi-chat-left-text-fill'
  });
});

// ── INIT ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Chat page init
  if (document.getElementById('conversationList')) {
    loadConversations();

    // Message input: Enter to send, Shift+Enter for newline
    const msgInput = document.getElementById('messageInput');
    if (msgInput) {
      msgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      // Typing indicator with stop-typing
      let stopTypingTimer = null;
      msgInput.addEventListener('input', () => {
        if (currentConversationId) {
          portalSocket.emit('portal:typing', { conversation_id: currentConversationId });
          clearTimeout(stopTypingTimer);
          stopTypingTimer = setTimeout(() => {
            portalSocket.emit('portal:stop-typing', { conversation_id: currentConversationId });
          }, 2000);
        }
        // Auto-resize
        msgInput.style.height = 'auto';
        msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
      });
    }

    // Scroll to load older messages + floating date pill
    const chatMsgs = document.getElementById('chatMessages');
    const datePill = document.getElementById('chatDatePill');
    let datePillTimer = null;

    if (chatMsgs) {
      chatMsgs.addEventListener('scroll', () => {
        // Load older messages
        if (chatMsgs.scrollTop < 50 && !loadingOlderMessages && !noMoreMessages && currentConversationId) {
          const firstMsg = chatMsgs.querySelector('[data-msg-id]');
          if (firstMsg) {
            const oldestId = parseInt(firstMsg.getAttribute('data-msg-id'));
            loadMessages(currentConversationId, oldestId);
          }
        }

        // Floating date pill
        if (datePill) {
          const dividers = chatMsgs.querySelectorAll('.msg-date-divider');
          let currentDate = '';
          dividers.forEach(div => {
            if (div.offsetTop <= chatMsgs.scrollTop + 40) {
              currentDate = div.textContent.trim();
            }
          });
          if (currentDate && chatMsgs.scrollTop > 20) {
            datePill.textContent = currentDate;
            datePill.classList.add('visible');
            clearTimeout(datePillTimer);
            datePillTimer = setTimeout(() => datePill.classList.remove('visible'), 1500);
          } else {
            datePill.classList.remove('visible');
          }
        }
      });
    }

    // Contact search
    const searchInput = document.getElementById('contactSearch');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        // Filter conversations
        document.querySelectorAll('.conv-item').forEach(el => {
          const name = el.querySelector('.conv-name')?.textContent.toLowerCase() || '';
          el.style.display = name.includes(q) ? '' : 'none';
        });
        // Filter contacts (if contacts list is visible)
        document.querySelectorAll('.contact-item').forEach(el => {
          const name = el.querySelector('.contact-name')?.textContent.toLowerCase() || '';
          el.style.display = name.includes(q) ? '' : 'none';
        });
      });
    }
  }

  // Tasks page init
  if (document.getElementById('tasksList')) {
    // Pre-set filter if ?status= is in the URL
    var urlParams = new URLSearchParams(window.location.search);
    var urlStatus = urlParams.get('status');
    if (urlStatus && document.getElementById('filterStatus')) {
      document.getElementById('filterStatus').value = urlStatus;
    }
    loadTasks();
    checkDueTodayReminders();
    // Auto-open task if ?task=ID is in the URL
    var urlTaskId = urlParams.get('task');
    if (urlTaskId) {
      setTimeout(function() { openTask(parseInt(urlTaskId)); }, 400);
    }
    // Clean up the URL without reload
    if (urlTaskId || urlStatus) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  // Users page init
  if (document.getElementById('usersList')) {
    loadUsers();
  }

  // Team Status page init
  if (document.getElementById('statusTableBody')) {
    loadTeamStatus();
    teamStatusInterval = setInterval(loadTeamStatus, 30000);

    // Bridge chat Enter to send
    const bridgeInput = document.getElementById('bridgeMessageInput');
    if (bridgeInput) {
      bridgeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendBridgeMessage();
        }
      });
    }
  }

  // Notes page init
  if (document.getElementById('notesList')) {
    loadNotes();
    if (typeof initQuillEditor === 'function') initQuillEditor();

    var noteTitle = document.getElementById('noteTitle');
    if (noteTitle) {
      noteTitle.addEventListener('input', () => {
        clearTimeout(noteAutoSaveTimer);
        noteAutoSaveTimer = setTimeout(saveNoteQuiet, 2000);
      });
    }

    // Save on page leave
    window.addEventListener('beforeunload', () => {
      if (currentNoteId) saveNoteQuiet();
    });
  }

  // Always update unread badge
  updateUnreadBadge();
  setInterval(updateUnreadBadge, 30000);
});

// ── UTILS ──────────────────────────────────────────────────

function showPortalToast({ title, sender, priority, taskId, customText, customIcon, href, onClickOverride }) {
  const container = document.getElementById('portalToastContainer');
  if (!container) return;

  const toastPriority = priority === 'completed' ? 'completed' : priority;
  const toast = document.createElement('div');
  toast.className = `portal-toast priority-${toastPriority}`;

  const icon = customIcon || 'bi-kanban-fill';
  const bodyText = customText || `New task from <strong>${escapeHtml(sender)}</strong>`;
  const badgeText = priority === 'completed' ? 'DONE' : priority;

  toast.innerHTML = `
    <div class="toast-icon"><i class="bi ${icon}"></i></div>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-text">${bodyText}</div>
      <span class="toast-priority">${badgeText}</span>
    </div>
    <button class="toast-close" onclick="event.stopPropagation(); this.parentElement.classList.add('removing'); setTimeout(() => this.parentElement.remove(), 250);">&times;</button>
  `;

  // Click toast to navigate
  toast.addEventListener('click', () => {
    if (onClickOverride) {
      onClickOverride();
    } else if (href) {
      window.location.href = href;
    } else if (window.location.pathname !== '/portal/tasks') {
      window.location.href = '/portal/tasks';
    } else if (taskId) {
      openTask(taskId);
    }
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 250);
  });

  container.appendChild(toast);
}

// ── Chat Toast Notification (WhatsApp-style) ──────────────

function showChatToast({ senderName, preview, conversationName, conversationId, isGroup }) {
  var container = document.getElementById('portalToastContainer');
  if (!container) return;

  var toast = document.createElement('div');
  toast.className = 'portal-toast chat-toast';

  var initial = senderName.charAt(0).toUpperCase();
  var titleText = isGroup ? conversationName : senderName;
  var subText = isGroup ? ('<strong>' + escapeHtml(senderName) + ':</strong> ' + escapeHtml(preview)) : escapeHtml(preview);

  toast.innerHTML =
    '<div class="chat-toast-avatar">' + initial + '</div>' +
    '<div class="toast-body">' +
      '<div class="toast-title">' + escapeHtml(titleText) + '</div>' +
      '<div class="toast-text">' + subText + '</div>' +
    '</div>' +
    '<button class="toast-close" onclick="event.stopPropagation(); this.parentElement.classList.add(\'removing\'); setTimeout(function(){ this.parentElement.remove(); }.bind(this), 250);">&times;</button>';

  toast.addEventListener('click', function() {
    if (window.location.pathname !== '/portal/chat') {
      window.location.href = '/portal/chat';
    } else {
      // Open the conversation directly
      openConversationById(conversationId);
    }
    toast.classList.add('removing');
    setTimeout(function() { toast.remove(); }, 250);
  });

  container.appendChild(toast);

  // Auto-dismiss after 5 seconds
  setTimeout(function() {
    if (toast.parentElement) {
      toast.classList.add('removing');
      setTimeout(function() { toast.remove(); }, 250);
    }
  }, 5000);
}

function openConversationById(convId) {
  // Fetch conversation details then open it
  fetch('/portal/chat/conversations')
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (!res.success) return;
      var conv = res.data.conversations.find(function(c) { return c.id === convId; });
      if (conv) {
        var name = conv.type === 'direct' ? (conv.other_user?.name || 'Unknown') : conv.name;
        var peerId = conv.type === 'direct' && conv.other_user ? conv.other_user.id : null;
        openConversation(convId, name, conv.type, peerId);
      }
    });
}

// ── TEAM STATUS ────────────────────────────────────────────

let teamStatusInterval = null;

function loadTeamStatus() {
  tsAccordionCache = {};
  fetch('/portal/team-status/data')
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      renderTeamStatus(res.data.employees, res.data.counts);
    });
}

let selectedEmployee = null;
let bridgeConvId = null;

// Track accordion state
var tsAccordionCache = {};
var tsAllExpanded = false;

function renderTeamStatus(employees, counts) {
  // Counts
  var countsEl = document.getElementById('statusCounts');
  if (countsEl) {
    countsEl.innerHTML =
      '<span class="status-count-pill working"><i class="bi bi-circle-fill"></i> ' + counts.working + ' Working</span>' +
      '<span class="status-count-pill idle"><i class="bi bi-circle-fill"></i> ' + counts.idle + ' Idle</span>' +
      '<span class="status-count-pill absent"><i class="bi bi-circle-fill"></i> ' + counts.absent + ' Absent</span>' +
      '<span class="status-count-pill off"><i class="bi bi-circle-fill"></i> ' + counts.off + ' Off</span>';
  }

  // Table
  var tbody = document.getElementById('statusTableBody');
  if (!tbody) return;

  if (!employees.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No employees found</td></tr>';
    return;
  }

  // Remember which rows were expanded
  var prevExpanded = {};
  document.querySelectorAll('.ts-accordion-row.open').forEach(function(r) {
    prevExpanded[r.dataset.userId] = true;
  });

  var html = '';
  employees.forEach(function(e) {
    var shiftStr = e.shiftStart ? e.shiftStart.substring(0, 5) : '--';
    var statusClass = 'ts-' + e.statusType;
    var elapsed = '--';
    if (e.startedAt) {
      var started = parseServerDate(e.startedAt);
      var diffSec = Math.floor((new Date() - started) / 1000);
      if (diffSec >= 0) {
        var h = Math.floor(diffSec / 3600);
        var m = Math.floor((diffSec % 3600) / 60);
        elapsed = h > 0 ? h + 'h ' + m + 'm' : m + 'm';
      }
    }
    var startedStr = e.startedAt ? parseServerDate(e.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
    var safeName = escapeHtml(e.name).replace(/'/g, "\\'");
    var wasOpen = prevExpanded[e.id] || false;

    // Main row
    html += '<tr class="ts-main-row ' + statusClass + (wasOpen ? ' expanded' : '') + '" data-user-id="' + e.id + '">';
    html += '<td class="ts-chevron-cell" onclick="toggleAccordion(' + e.id + ', event)"><i class="bi bi-chevron-right ts-chevron' + (wasOpen ? ' open' : '') + '"></i></td>';
    html += '<td class="ts-name" style="cursor:pointer" onclick="openEmployeePanel(' + e.id + ', \'' + safeName + '\', \'' + e.status + '\', \'' + e.statusType + '\')">' + escapeHtml(e.name) + '</td>';
    html += '<td><code>' + shiftStr + '</code></td>';
    html += '<td><span class="ts-badge ' + statusClass + '">' + e.status + '</span></td>';
    html += '<td class="ts-task">' + (e.taskName ? escapeHtml(e.taskName) : '--') + '</td>';
    html += '<td>' + startedStr + '</td>';
    html += '<td>' + elapsed + '</td>';
    html += '</tr>';

    // Accordion detail row
    html += '<tr class="ts-accordion-row' + (wasOpen ? ' open' : '') + '" data-user-id="' + e.id + '">';
    html += '<td colspan="7" class="ts-accordion-cell"><div class="ts-accordion-body" id="tsAccordion_' + e.id + '">';
    if (wasOpen && tsAccordionCache[e.id]) {
      html += tsAccordionCache[e.id];
    } else if (wasOpen) {
      html += '<div class="text-center text-muted py-2 small">Loading tasks...</div>';
    }
    html += '</div></td></tr>';
  });

  tbody.innerHTML = html;

  // Re-fetch tasks for rows that were open
  Object.keys(prevExpanded).forEach(function(uid) {
    fetchAccordionTasks(parseInt(uid));
  });
}

function toggleAccordion(userId, event) {
  if (event) event.stopPropagation();
  var mainRow = document.querySelector('.ts-main-row[data-user-id="' + userId + '"]');
  var detailRow = document.querySelector('.ts-accordion-row[data-user-id="' + userId + '"]');
  if (!mainRow || !detailRow) return;

  var isOpen = detailRow.classList.contains('open');
  if (isOpen) {
    mainRow.classList.remove('expanded');
    detailRow.classList.remove('open');
    mainRow.querySelector('.ts-chevron').classList.remove('open');
  } else {
    mainRow.classList.add('expanded');
    detailRow.classList.add('open');
    mainRow.querySelector('.ts-chevron').classList.add('open');
    // Fetch tasks if not cached
    if (!tsAccordionCache[userId]) {
      document.getElementById('tsAccordion_' + userId).innerHTML = '<div class="text-center text-muted py-2 small">Loading tasks...</div>';
      fetchAccordionTasks(userId);
    } else {
      document.getElementById('tsAccordion_' + userId).innerHTML = tsAccordionCache[userId];
    }
  }
  updateExpandAllBtn();
}

function fetchAccordionTasks(userId) {
  fetch('/portal/team-status/employee-tasks/' + userId)
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (!res.success) return;
      var tasks = res.data.tasks;
      var container = document.getElementById('tsAccordion_' + userId);
      if (!container) return;

      if (!tasks.length) {
        var empty = '<div class="text-center text-muted py-2 small">No tasks for today</div>';
        tsAccordionCache[userId] = empty;
        container.innerHTML = empty;
        return;
      }

      var html = '<div class="ts-inline-tasks">';
      tasks.forEach(function(t) {
        var sc, st, si;
        if (t.status === 'completed') { sc = 'done'; st = 'Done'; si = 'bi-check-circle-fill'; }
        else if (t.status === 'in_progress') { sc = 'working'; st = 'In Progress'; si = 'bi-play-circle-fill'; }
        else { sc = 'pending'; st = 'Pending'; si = 'bi-clock'; }
        html += '<div class="ts-inline-task ts-itask-' + sc + '">';
        html += '<i class="bi ' + si + ' ts-itask-icon"></i>';
        html += '<span class="ts-itask-title">' + escapeHtml(t.title) + '</span>';
        html += '<span class="ts-itask-badge ts-itask-' + sc + '">' + st + '</span>';
        html += '<span class="ts-itask-type">' + (t.type === 'recurring' ? 'Recurring' : 'Ad-hoc') + '</span>';
        html += '</div>';
      });
      html += '</div>';
      tsAccordionCache[userId] = html;
      container.innerHTML = html;
    });
}

function toggleAllAccordions() {
  var allRows = document.querySelectorAll('.ts-accordion-row');
  if (!allRows.length) return;

  // Check if any are open
  var anyOpen = document.querySelector('.ts-accordion-row.open');
  tsAllExpanded = !anyOpen;

  allRows.forEach(function(row) {
    var uid = row.dataset.userId;
    var mainRow = document.querySelector('.ts-main-row[data-user-id="' + uid + '"]');
    if (tsAllExpanded) {
      row.classList.add('open');
      if (mainRow) {
        mainRow.classList.add('expanded');
        mainRow.querySelector('.ts-chevron').classList.add('open');
      }
      if (!tsAccordionCache[uid]) {
        var container = document.getElementById('tsAccordion_' + uid);
        if (container) container.innerHTML = '<div class="text-center text-muted py-2 small">Loading tasks...</div>';
        fetchAccordionTasks(parseInt(uid));
      } else {
        var container = document.getElementById('tsAccordion_' + uid);
        if (container) container.innerHTML = tsAccordionCache[uid];
      }
    } else {
      row.classList.remove('open');
      if (mainRow) {
        mainRow.classList.remove('expanded');
        mainRow.querySelector('.ts-chevron').classList.remove('open');
      }
    }
  });
  updateExpandAllBtn();
}

function updateExpandAllBtn() {
  var btn = document.getElementById('tsExpandAllBtn');
  if (!btn) return;
  var anyOpen = document.querySelector('.ts-accordion-row.open');
  if (anyOpen) {
    btn.querySelector('i').className = 'bi bi-chevron-contract me-1';
    btn.querySelector('span').textContent = 'Collapse All';
  } else {
    btn.querySelector('i').className = 'bi bi-chevron-expand me-1';
    btn.querySelector('span').textContent = 'Expand All';
  }
}

function openEmployeePanel(userId, name, status, statusType) {
  selectedEmployee = { id: userId, name };
  bridgeConvId = null;

  document.getElementById('panelAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('panelName').textContent = name;
  document.getElementById('panelStatus').innerHTML = `<span class="ts-badge ts-${statusType}">${status}</span>`;
  document.getElementById('teamPanel').style.display = 'flex';

  switchPanelTab('tasks');
  loadEmployeeTasks(userId);

  // Pre-create bridge conversation
  fetch('/portal/bridge/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ local_user_id: userId })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        bridgeConvId = res.data.conversation.id;
      }
    });
}

function closeTeamPanel() {
  document.getElementById('teamPanel').style.display = 'none';
  selectedEmployee = null;
  bridgeConvId = null;
}

function switchPanelTab(tab) {
  document.getElementById('tabTasks').classList.toggle('active', tab === 'tasks');
  document.getElementById('tabChat').classList.toggle('active', tab === 'chat');
  document.getElementById('panelTasks').style.display = tab === 'tasks' ? '' : 'none';
  document.getElementById('panelChat').style.display = tab === 'chat' ? '' : 'none';

  if (tab === 'chat' && bridgeConvId) {
    loadBridgeMessages();
    fetch(`/portal/bridge/conversations/${bridgeConvId}/read`, { method: 'POST' });
  }
}

function loadEmployeeTasks(userId) {
  // Fetch tasks assigned to this local user from TaskFlow
  fetch(`/portal/team-status/employee-tasks/${userId}`)
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      const list = document.getElementById('panelTaskList');
      const tasks = res.data.tasks;

      if (!tasks.length) {
        list.innerHTML = '<div class="text-center text-muted py-4 small">No tasks for today</div>';
        return;
      }

      list.innerHTML = tasks.map(t => {
        let statusClass, statusText, statusIcon;
        if (t.status === 'completed') {
          statusClass = 'panel-status-done';
          statusText = 'Done';
          statusIcon = 'bi-check-circle-fill';
        } else if (t.status === 'in_progress') {
          statusClass = 'panel-status-working';
          statusText = 'Currently Working';
          statusIcon = 'bi-play-circle-fill';
        } else if (t.status === 'active' || t.status === 'pending') {
          statusClass = 'panel-status-pending';
          statusText = 'To Be Started';
          statusIcon = 'bi-clock';
        } else {
          statusClass = 'panel-status-pending';
          statusText = t.status;
          statusIcon = 'bi-dash-circle';
        }
        return `<div class="panel-task-item ${statusClass}">
          <div class="panel-task-title">${escapeHtml(t.title)}</div>
          <div class="panel-task-meta">
            <span class="panel-task-status ${statusClass}"><i class="bi ${statusIcon} me-1"></i>${statusText}</span>
            <span class="panel-task-type">${t.type === 'recurring' ? 'Recurring' : 'Ad-hoc'}</span>
          </div>
        </div>`;
      }).join('');
    });
}

// ── BRIDGE CHAT ────────────────────────────────────────────

function loadBridgeMessages() {
  if (!bridgeConvId) return;

  fetch(`/portal/bridge/conversations/${bridgeConvId}/messages`)
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      renderBridgeMessages(res.data.messages, true);
    });
}

function renderBridgeMessages(messages, replace) {
  const container = document.getElementById('bridgeMessages');
  if (!messages.length && replace) {
    container.innerHTML = '<div class="text-center text-muted py-4 small">Start a conversation...</div>';
    return;
  }

  let lastBridgeDate = '';
  if (!replace) {
    const dividers = container.querySelectorAll('.msg-date-divider');
    if (dividers.length) lastBridgeDate = dividers[dividers.length - 1].textContent.trim();
  }

  const html = messages.map(m => {
    const msgDate = formatDateLabel(m.created_at);
    let dateDivider = '';
    if (msgDate !== lastBridgeDate) {
      dateDivider = `<div class="msg-date-divider"><span>${msgDate}</span></div>`;
      lastBridgeDate = msgDate;
    }

    const isSent = m.sender_id === PORTAL_USER.id;
    const bubbleClass = isSent ? 'sent' : 'received';
    const time = parseServerDate(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let content = '';
    if (m.is_deleted) {
      content = '<i class="bi bi-ban me-1"></i><em>This message was deleted</em>';
    } else if (m.type === 'file' && m.attachment) {
      content = renderFileContent(m.attachment, m.id, '/portal/bridge/attachment');
    } else {
      content = linkify(escapeHtml(m.content));
    }

    const deleteBtn = isSent && !m.is_deleted ? `<span class="bridge-msg-delete" onclick="event.stopPropagation(); deleteBridgeMsg(${m.id})" title="Delete"><i class="bi bi-trash"></i></span>` : '';

    return `${dateDivider}<div class="msg-bubble ${bubbleClass}${m.is_deleted ? ' deleted' : ''}" data-bridge-msg-id="${m.id}">
      ${deleteBtn}
      <div class="msg-content">${content}</div>
      <div class="msg-footer"><span class="msg-time">${time}</span></div>
    </div>`;
  }).join('');

  if (replace) {
    container.innerHTML = html;
  } else {
    container.insertAdjacentHTML('beforeend', html);
  }
  container.scrollTop = container.scrollHeight;
}

function sendBridgeMessage() {
  if (!bridgeConvId) return;
  const input = document.getElementById('bridgeMessageInput');
  const content = input.value.trim();
  if (!content) return;

  fetch(`/portal/bridge/conversations/${bridgeConvId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        input.value = '';
      }
    });
}

function sendBridgeFile() {
  if (!bridgeConvId) return;
  const fileInput = document.getElementById('bridgeFileInput');
  if (!fileInput.files.length) return;

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  fetch(`/portal/bridge/conversations/${bridgeConvId}/file`, {
    method: 'POST',
    body: formData
  })
    .then(r => r.json())
    .then(res => {
      if (!res.success) alert('Failed to send file');
      fileInput.value = '';
    });
}

function deleteBridgeMsg(msgId) {
  if (!confirm('Delete this message?')) return;
  fetch('/portal/bridge/messages/' + msgId, { method: 'DELETE' })
    .then(r => r.json())
    .then(res => {
      if (!res.success) alert(res.message);
    });
}

// ── NOTES ──────────────────────────────────────────────────

let currentNoteId = null;
let noteAutoSaveTimer = null;
let recognition = null;
let isDictating = false;

function loadNotes() {
  const search = document.getElementById('noteSearch')?.value || '';
  const url = search ? `/portal/notes/list?search=${encodeURIComponent(search)}` : '/portal/notes/list';

  fetch(url)
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      renderNotesList(res.data.notes);
    });
}

function renderNotesList(notes) {
  const list = document.getElementById('notesList');
  if (!list) return;

  if (!notes.length) {
    list.innerHTML = '<div class="text-center text-muted py-4 small">No notes yet</div>';
    return;
  }

  list.innerHTML = notes.map(n => {
    const active = n.id === currentNoteId ? 'active' : '';
    var rawText = n.content ? n.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
    const preview = rawText ? rawText.substring(0, 60) + (rawText.length > 60 ? '...' : '') : 'No content';
    const date = timeAgo(n.updated_at);
    const pinIcon = n.is_pinned ? '<i class="bi bi-pin-fill" style="color:var(--tf-warning);font-size:0.7rem;margin-right:4px"></i>' : '';
    return `<div class="note-item ${active}" onclick="openNote(${n.id})">
      <div class="note-item-title">${pinIcon}${escapeHtml(n.title)}</div>
      <div class="note-item-preview">${escapeHtml(preview)}</div>
      <div class="note-item-date">${date}</div>
    </div>`;
  }).join('');
}

function searchNotes() {
  clearTimeout(noteAutoSaveTimer);
  loadNotes();
}

function createNewNote() {
  fetch('/portal/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }), content: '' })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        loadNotes();
        openNote(res.data.note.id);
      }
    });
}

function openNote(noteId) {
  // Auto-save current note before switching
  if (currentNoteId && currentNoteId !== noteId) {
    saveNoteQuiet();
  }

  currentNoteId = noteId;
  document.getElementById('notesPlaceholder').style.display = 'none';
  document.getElementById('notesActive').style.display = 'flex';

  fetch(`/portal/notes/list`)
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      const note = res.data.notes.find(n => n.id === noteId);
      if (!note) return;
      document.getElementById('noteTitle').value = note.title;
      if (typeof quillEditor !== 'undefined' && quillEditor) {
        quillEditor.root.innerHTML = note.content || '';
      }
      document.getElementById('noteStatus').textContent = 'Last saved: ' + timeAgo(note.updated_at);
      currentNotePinned = !!note.is_pinned;
      updatePinIcon();

      // Highlight in sidebar
      document.querySelectorAll('.note-item').forEach(el => el.classList.remove('active'));
      loadNotes();
    });
}

function getEditorContent() {
  if (typeof quillEditor !== 'undefined' && quillEditor) {
    var html = quillEditor.root.innerHTML;
    // Return empty string if editor is blank
    return html === '<p><br></p>' ? '' : html;
  }
  return '';
}

function saveNote() {
  if (!currentNoteId) return;
  var title = document.getElementById('noteTitle').value.trim();
  var content = getEditorContent();
  if (!title) return alert('Title is required');

  fetch('/portal/notes/' + currentNoteId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title, content: content })
  })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.success) {
        document.getElementById('noteStatus').textContent = 'Saved just now';
        loadNotes();
      }
    });
}

function saveNoteQuiet() {
  if (!currentNoteId) return;
  var title = document.getElementById('noteTitle')?.value?.trim();
  var content = getEditorContent();
  if (!title) return;

  fetch('/portal/notes/' + currentNoteId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title, content: content })
  })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.success) {
        var statusEl = document.getElementById('noteStatus');
        if (statusEl) statusEl.textContent = 'Auto-saved';
        loadNotes();
      }
    })
    .catch(function() {});
}

function deleteNote() {
  if (!currentNoteId || !confirm('Delete this note?')) return;

  fetch(`/portal/notes/${currentNoteId}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        currentNoteId = null;
        document.getElementById('notesPlaceholder').style.display = 'flex';
        document.getElementById('notesActive').style.display = 'none';
        loadNotes();
      }
    });
}

function exportNoteText() {
  var title = document.getElementById('noteTitle').value || 'note';
  var plainText = (typeof quillEditor !== 'undefined' && quillEditor) ? quillEditor.getText() : '';
  var blob = new Blob([title + '\n' + '='.repeat(title.length) + '\n\n' + plainText], { type: 'text/plain' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_') + '.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportNotePDF() {
  var title = document.getElementById('noteTitle').value || 'Note';
  var htmlContent = getEditorContent();
  var win = window.open('', '_blank');
  win.document.write('<!DOCTYPE html><html><head><title>' + escapeHtml(title) + '</title>' +
    '<style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#222;}' +
    'h1{font-size:1.5rem;border-bottom:2px solid #333;padding-bottom:8px;}' +
    '.content{font-size:0.95rem;line-height:1.7;}' +
    '.meta{font-size:0.75rem;color:#888;margin-bottom:20px;}</style></head>' +
    '<body><h1>' + escapeHtml(title) + '</h1>' +
    '<div class="meta">' + new Date().toLocaleString() + '</div>' +
    '<div class="content">' + htmlContent + '</div></body></html>');
  win.document.close();
  setTimeout(function() { win.print(); }, 500);
}

let currentNotePinned = false;

function togglePinNote() {
  if (!currentNoteId) return;
  fetch(`/portal/notes/${currentNoteId}/pin`, { method: 'PATCH' })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        currentNotePinned = res.data.note.is_pinned;
        updatePinIcon();
        loadNotes();
      }
    });
}

function updatePinIcon() {
  const icon = document.getElementById('pinNoteIcon');
  const btn = document.getElementById('pinNoteBtn');
  if (currentNotePinned) {
    icon.className = 'bi bi-pin-fill';
    btn.style.color = 'var(--tf-warning)';
  } else {
    icon.className = 'bi bi-pin';
    btn.style.color = '';
  }
}

// ── DICTATION (Speech-to-Text) ─────────────────────────────

function toggleDictation() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Speech recognition is not supported in your browser. Try Chrome.');
    return;
  }

  if (isDictating) {
    stopDictation();
  } else {
    startDictation();
  }
}

function startDictation() {
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = function(event) {
    for (var i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        var text = event.results[i][0].transcript + ' ';
        if (typeof quillEditor !== 'undefined' && quillEditor) {
          var range = quillEditor.getSelection(true);
          var pos = range ? range.index : quillEditor.getLength();
          quillEditor.insertText(pos, text);
          quillEditor.setSelection(pos + text.length);
        }
      }
    }
  };

  recognition.onerror = function() {
    stopDictation();
  };

  recognition.onend = function() {
    if (isDictating) {
      try { recognition.start(); } catch (e) { stopDictation(); }
    }
  };

  recognition.start();
  isDictating = true;
  document.getElementById('dictateIcon').className = 'bi bi-mic-fill text-danger';
  document.getElementById('dictateBtn').classList.add('dictating');
  document.getElementById('dictateStatus').style.display = '';
}

function stopDictation() {
  if (recognition) {
    isDictating = false;
    try { recognition.stop(); } catch (e) {}
    recognition = null;
  }
  document.getElementById('dictateIcon').className = 'bi bi-mic';
  document.getElementById('dictateBtn').classList.remove('dictating');
  document.getElementById('dictateStatus').style.display = 'none';
}

// ── PORTAL COMMENT EDIT ────────────────────────────────────

function startEditPortalComment(commentId) {
  document.getElementById('portalCommentBody-' + commentId).style.display = 'none';
  document.getElementById('portalCommentEdit-' + commentId).style.display = '';
  document.getElementById('portalCommentEditInput-' + commentId).focus();
}

function cancelEditPortalComment(commentId) {
  document.getElementById('portalCommentBody-' + commentId).style.display = '';
  document.getElementById('portalCommentEdit-' + commentId).style.display = 'none';
}

function saveEditPortalComment(commentId) {
  const input = document.getElementById('portalCommentEditInput-' + commentId);
  const content = input.value.trim();
  if (!content) return;

  fetch('/portal/tasks/comments/' + commentId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        document.getElementById('portalCommentBody-' + commentId).textContent = content;
        cancelEditPortalComment(commentId);
      } else {
        alert(res.message);
      }
    });
}

// ── TASK DUE DATE REMINDERS ─────────────────────────────────

function checkDueTodayReminders() {
  // Only show once per session
  if (sessionStorage.getItem('portal_due_reminder_shown')) return;

  fetch('/portal/tasks/list')
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      const today = new Date().toDateString();
      const dueTasks = res.data.tasks.filter(t => {
        if (t.status === 'completed' || t.status === 'cancelled') return false;
        if (!t.due_date) return false;
        return new Date(t.due_date).toDateString() === today;
      });

      if (dueTasks.length > 0) {
        sessionStorage.setItem('portal_due_reminder_shown', '1');
        setTimeout(() => {
          const names = dueTasks.map(t => t.title).slice(0, 3);
          const more = dueTasks.length > 3 ? ` and ${dueTasks.length - 3} more` : '';
          showPortalToast({
            title: `${dueTasks.length} task${dueTasks.length > 1 ? 's' : ''} due today`,
            sender: '',
            priority: dueTasks.some(t => t.priority === 'urgent') ? 'urgent' : 'high',
            customText: `<strong>${names.join('</strong>, <strong>')}</strong>${more}`,
            customIcon: 'bi-calendar-event'
          });
        }, 3000);
      }
    });
}

// ── FIELD DICTATION (reusable for any input/textarea) ──────

let fieldRecognition = null;
let fieldDictatingBtn = null;

function toggleFieldDictation(fieldId, btn) {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Speech recognition is not supported in your browser. Try Chrome.');
    return;
  }

  // If already dictating this field, stop
  if (fieldDictatingBtn === btn && fieldRecognition) {
    stopFieldDictation();
    return;
  }

  // Stop any other active dictation
  if (fieldRecognition) stopFieldDictation();

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  fieldRecognition = new SpeechRecognition();
  fieldRecognition.continuous = true;
  fieldRecognition.interimResults = true;
  fieldRecognition.lang = 'en-US';

  const field = document.getElementById(fieldId);
  const startValue = field.value;
  const startPos = field.selectionStart || field.value.length;
  let finalTranscript = '';

  fieldRecognition.onresult = function(event) {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript + ' ';
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    const before = startValue.substring(0, startPos);
    const after = startValue.substring(startPos);
    field.value = before + (before && !before.endsWith(' ') ? ' ' : '') + finalTranscript + interim + after;
  };

  fieldRecognition.onerror = function() { stopFieldDictation(); };
  fieldRecognition.onend = function() {
    if (fieldDictatingBtn === btn) {
      try { fieldRecognition.start(); } catch (e) { stopFieldDictation(); }
    }
  };

  fieldRecognition.start();
  fieldDictatingBtn = btn;
  btn.classList.add('dictating');
  btn.querySelector('i').className = 'bi bi-mic-fill text-danger';
}

function stopFieldDictation() {
  if (fieldRecognition) {
    try { fieldRecognition.stop(); } catch (e) {}
    fieldRecognition = null;
  }
  if (fieldDictatingBtn) {
    fieldDictatingBtn.classList.remove('dictating');
    fieldDictatingBtn.querySelector('i').className = 'bi bi-mic';
    fieldDictatingBtn = null;
  }
}

// ── NOTIFICATION SOUND ─────────────────────────────────────

var _sndCtx      = null;
var _sndUnlocked = false;
var _sndPending  = false;

function _unlockSnd() {
  if (_sndUnlocked) return;
  try {
    if (!_sndCtx) _sndCtx = new (window.AudioContext || window.webkitAudioContext)();
    var p = _sndCtx.resume();
    if (p && p.then) {
      p.then(function() {
        var buf = _sndCtx.createBuffer(1, 1, 22050);
        var src = _sndCtx.createBufferSource();
        src.buffer = buf; src.connect(_sndCtx.destination); src.start(0);
        _sndUnlocked = true;
        if (_sndPending) { _sndPending = false; _doPlaySnd(); }
      }).catch(function(){});
    }
  } catch(e) {}
}

document.addEventListener('click',   _unlockSnd, { once: false });
document.addEventListener('keydown', _unlockSnd, { once: false });

function _doPlaySnd() {
  if (!_sndCtx) return;
  try {
    var now = _sndCtx.currentTime;
    var o = _sndCtx.createOscillator(), g = _sndCtx.createGain();
    o.connect(g); g.connect(_sndCtx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, now);
    o.frequency.setValueAtTime(1046, now + 0.1);
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    o.start(now);
    o.stop(now + 0.3);
  } catch(_) {}
}

function playNotificationSound() {
  if (!_sndUnlocked) { _sndPending = true; return; }
  _doPlaySnd();
}

// ── CHAT SEARCH ────────────────────────────────────────────

function toggleChatSearch() {
  const bar = document.getElementById('chatSearchBar');
  if (bar.style.display === 'none') {
    bar.style.display = 'flex';
    document.getElementById('chatSearchInput').focus();
  } else {
    closeChatSearch();
  }
}

function closeChatSearch() {
  document.getElementById('chatSearchBar').style.display = 'none';
  document.getElementById('chatSearchInput').value = '';
  // Reload full messages
  if (currentConversationId) loadMessages(currentConversationId);
}

function searchInChat() {
  const q = document.getElementById('chatSearchInput').value.trim();
  if (!q || !currentConversationId) return;

  fetch(`/portal/chat/conversations/${currentConversationId}/search?q=${encodeURIComponent(q)}`)
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      if (!res.data.messages.length) {
        document.getElementById('chatMessages').innerHTML = '<div class="text-center text-muted p-4 small">No messages found</div>';
        return;
      }
      renderMessages(res.data.messages, true);
      // Highlight search term
      const container = document.getElementById('chatMessages');
      container.querySelectorAll('.msg-content').forEach(el => {
        el.innerHTML = el.innerHTML.replace(
          new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
          '<mark>$1</mark>'
        );
      });
    });
}

// ── EDIT / DELETE MESSAGES ──────────────────────────────────

function showMsgActions(msgId, content) {
  const existing = document.getElementById('msgActions_' + msgId);
  if (existing) { existing.remove(); return; }

  // Remove any other open menus
  document.querySelectorAll('.msg-action-menu').forEach(m => m.remove());

  const bubble = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (!bubble) return;

  const menu = document.createElement('div');
  menu.className = 'msg-action-menu';
  menu.id = 'msgActions_' + msgId;
  menu.innerHTML = `
    <button onclick="showEditMsgModal(${msgId}, this)"><i class="bi bi-pencil"></i> Edit</button>
    <button onclick="deleteMsg(${msgId})" class="text-danger"><i class="bi bi-trash"></i> Delete</button>
  `;
  bubble.appendChild(menu);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closeMenu(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    });
  }, 10);
}

function showEditMsgModal(msgId) {
  document.querySelectorAll('.msg-action-menu').forEach(m => m.remove());
  const bubble = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (!bubble) return;
  const contentEl = bubble.querySelector('.msg-content');
  document.getElementById('editMsgId').value = msgId;
  document.getElementById('editMsgContent').value = contentEl ? contentEl.textContent : '';
  new bootstrap.Modal(document.getElementById('editMsgModal')).show();
}

function saveEditMessage() {
  const msgId = document.getElementById('editMsgId').value;
  const content = document.getElementById('editMsgContent').value.trim();
  if (!content) return;

  fetch(`/portal/chat/messages/${msgId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        bootstrap.Modal.getInstance(document.getElementById('editMsgModal')).hide();
      } else {
        alert(res.message);
      }
    });
}

function deleteMsg(msgId) {
  document.querySelectorAll('.msg-action-menu').forEach(m => m.remove());
  if (!confirm('Delete this message?')) return;

  fetch(`/portal/chat/messages/${msgId}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(res => {
      if (!res.success) alert(res.message);
    });
}

// ── GROUP MANAGEMENT ───────────────────────────────────────

let currentConvType = null;

function showGroupInfoModal() {
  if (!currentConversationId) return;

  fetch(`/portal/chat/conversations/${currentConversationId}/members`)
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      const list = document.getElementById('groupMembersList');
      const conv = res.data.conversation;
      const canManage = ['CLIENT_ADMIN', 'CLIENT_TOP_MGMT', 'CLIENT_MGMT', 'CLIENT_MANAGER'].includes(PORTAL_USER.role) || conv.created_by === PORTAL_USER.id;

      list.innerHTML = res.data.participants.map(p => {
        const isCreator = p.id === conv.created_by;
        const removeBtn = canManage && !isCreator && p.id !== PORTAL_USER.id
          ? `<button class="btn btn-sm btn-outline-danger" style="width:28px;height:28px;padding:0" onclick="removeGroupMember(${p.id})"><i class="bi bi-x"></i></button>`
          : '';
        return `<div class="d-flex align-items-center gap-2 mb-2">
          <div class="contact-avatar" style="width:32px;height:32px;font-size:0.75rem">${p.name.charAt(0).toUpperCase()}</div>
          <div style="flex:1">
            <div class="small fw-bold">${escapeHtml(p.name)}</div>
            <div style="font-size:0.65rem;color:var(--tf-text-muted)">${isCreator ? 'Creator' : ''}</div>
          </div>
          ${removeBtn}
        </div>`;
      }).join('');

      new bootstrap.Modal(document.getElementById('groupInfoModal')).show();
    });
}

function addGroupMember() {
  const sel = document.getElementById('addMemberSelect');
  const userId = parseInt(sel.value);
  if (!userId || !currentConversationId) return;

  fetch(`/portal/chat/conversations/${currentConversationId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_ids: [userId] })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        sel.value = '';
        showGroupInfoModal(); // refresh
      } else {
        alert(res.message);
      }
    });
}

function removeGroupMember(userId) {
  if (!confirm('Remove this member?')) return;

  fetch(`/portal/chat/conversations/${currentConversationId}/members/${userId}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(res => {
      if (res.success) showGroupInfoModal();
      else alert(res.message);
    });
}

// ── EMOJI PICKER ───────────────────────────────────────────

const EMOJI_LIST = [
  '😀','😂','🤣','😊','😍','🥰','😘','😎','🤔','😏',
  '😢','😭','😤','🤯','😱','🥳','🤩','😴','🤮','🤗',
  '👍','👎','👏','🙌','🤝','💪','✌️','🤞','👋','🙏',
  '❤️','🔥','⭐','💯','✅','❌','⚠️','💡','🎉','🎊',
  '📎','📁','📝','💬','📞','📅','⏰','🔔','🚀','💼'
];

function toggleEmojiPicker() {
  const picker = document.getElementById('emojiPicker');
  if (picker.style.display === 'none') {
    if (!picker.innerHTML) {
      picker.innerHTML = EMOJI_LIST.map(e => `<span class="emoji-item" onclick="insertEmoji('${e}')">${e}</span>`).join('');
    }
    picker.style.display = 'flex';

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function closePicker(e) {
        if (!picker.contains(e.target) && !e.target.closest('[title="Emoji"]')) {
          picker.style.display = 'none';
          document.removeEventListener('click', closePicker);
        }
      });
    }, 10);
  } else {
    picker.style.display = 'none';
  }
}

function insertEmoji(emoji) {
  const input = document.getElementById('messageInput');
  if (input) {
    const start = input.selectionStart;
    input.value = input.value.substring(0, start) + emoji + input.value.substring(input.selectionEnd);
    input.selectionStart = input.selectionEnd = start + emoji.length;
    input.focus();
  }
  document.getElementById('emojiPicker').style.display = 'none';
}

// ── UTILS ──────────────────────────────────────────────────

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

function getFileIconMeta(ext) {
  const map = {
    pdf:  { i: 'bi-file-earmark-pdf-fill',        c: '#ef4444' },
    doc:  { i: 'bi-file-earmark-word-fill',       c: '#2b7bf0' },
    docx: { i: 'bi-file-earmark-word-fill',       c: '#2b7bf0' },
    xls:  { i: 'bi-file-earmark-excel-fill',      c: '#16a34a' },
    xlsx: { i: 'bi-file-earmark-excel-fill',      c: '#16a34a' },
    csv:  { i: 'bi-file-earmark-spreadsheet-fill', c: '#16a34a' },
    ppt:  { i: 'bi-file-earmark-ppt-fill',        c: '#f97316' },
    pptx: { i: 'bi-file-earmark-ppt-fill',        c: '#f97316' },
    zip:  { i: 'bi-file-earmark-zip-fill',        c: '#eab308' },
    rar:  { i: 'bi-file-earmark-zip-fill',        c: '#eab308' },
    '7z': { i: 'bi-file-earmark-zip-fill',        c: '#eab308' },
    txt:  { i: 'bi-file-earmark-text-fill',       c: '#9ca3af' },
    mp3:  { i: 'bi-file-earmark-music-fill',      c: '#a855f7' },
    wav:  { i: 'bi-file-earmark-music-fill',      c: '#a855f7' },
    mp4:  { i: 'bi-file-earmark-play-fill',       c: '#ec4899' },
    mov:  { i: 'bi-file-earmark-play-fill',       c: '#ec4899' },
    webm: { i: 'bi-file-earmark-play-fill',       c: '#ec4899' },
    js:   { i: 'bi-file-earmark-code-fill',       c: '#f0db4f' },
    json: { i: 'bi-file-earmark-code-fill',       c: '#f0db4f' },
    html: { i: 'bi-file-earmark-code-fill',       c: '#e34c26' },
    css:  { i: 'bi-file-earmark-code-fill',       c: '#2965f1' }
  };
  return map[ext] || { i: 'bi-file-earmark-fill', c: '#94a3b8' };
}

function renderFileContent(attachment, msgId, baseUrl) {
  const fname = attachment.file_name;
  const ext = fname.split('.').pop().toLowerCase();
  const shortName = fname.length > 30 ? fname.substring(0, 27) + '...' : fname;
  const size = attachment.file_size ? formatFileSize(attachment.file_size) : '';
  const url = `${baseUrl}/${msgId}`;

  if (IMAGE_EXTS.includes(ext)) {
    return `<a href="${url}" target="_blank" class="msg-image-link">
      <img src="${url}" class="msg-image-preview" alt="${escapeHtml(fname)}" loading="lazy">
    </a>`;
  }

  const meta = getFileIconMeta(ext);
  return `<a class="msg-file" href="${url}" target="_blank">
    <i class="bi ${meta.i}" style="color:${meta.c};font-size:1.5rem;"></i>
    <div><span class="msg-file-name">${escapeHtml(shortName)}</span>${size ? `<span class="msg-file-size">${size}</span>` : ''}</div>
  </a>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDateLabel(dateStr) {
  const d = parseServerDate(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dStr = d.toDateString();
  if (dStr === today.toDateString()) return 'Today';
  if (dStr === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function linkify(text) {
  const urlPattern = /(\b(?:https?:\/\/|www\.)[^\s<]+)/gi;
  return text.replace(urlPattern, function(url) {
    const href = url.startsWith('http') ? url : 'https://' + url;
    return '<a href="' + href + '" target="_blank" rel="noopener" class="msg-link">' + url + '</a>';
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
