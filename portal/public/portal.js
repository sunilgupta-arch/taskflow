// ═══════════════════════════════════════════════════════════
// Portal Frontend — Chat & Tasks
// ═══════════════════════════════════════════════════════════

let currentConversationId = null;
let currentTaskId = null;
let typingTimeout = null;
let onlineUserIds = new Set();

// ── CHAT ───────────────────────────────────────────────────

function loadConversations() {
  fetch('/portal/chat/conversations')
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      renderConversations(res.data.conversations);
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
    const name = c.type === 'direct' ? (c.other_user?.name || 'Unknown') : c.name;
    const initial = name.charAt(0).toUpperCase();
    const lastMsg = c.last_message || '';
    const time = c.last_message_at ? timeAgo(c.last_message_at) : '';
    const unread = c.unread_count > 0 ? `<span class="conv-unread">${c.unread_count}</span>` : '';
    const activeClass = c.id === currentConversationId ? 'active' : '';
    const isOnline = c.type === 'direct' && c.other_user && onlineUserIds.has(c.other_user.id);
    const onlineDot = isOnline ? '<span class="online-dot"></span>' : '';

    return `<div class="conv-item ${activeClass}" onclick="openConversation(${c.id}, '${name.replace(/'/g, "\\'")}', '${c.type}', ${c.type === 'direct' && c.other_user ? c.other_user.id : 'null'})">
      <div class="conv-avatar-wrap">
        <div class="conv-avatar">${c.type === 'group' ? '<i class="bi bi-people-fill" style="font-size:0.8rem"></i>' : initial}</div>
        ${onlineDot}
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
  document.querySelector('.chat-sidebar-header').style.display = 'none';
}

function showConversations() {
  document.getElementById('conversationList').style.display = 'block';
  document.getElementById('contactsList').style.display = 'none';
  document.querySelector('.chat-sidebar-header').style.display = 'block';
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

function openConversation(convId, name, type, peerId) {
  currentConversationId = convId;
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
  let url = `/portal/chat/conversations/${convId}/messages`;
  if (beforeId) url += `?before=${beforeId}`;

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
      renderMessages(res.data.messages, beforeId ? 'prepend' : 'replace');
      loadingOlderMessages = false;
    });
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
      content = renderFileContent(m.attachment, m.id, '/portal/chat/attachment');
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

  fetch(`/portal/chat/conversations/${currentConversationId}/messages`, {
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

function sendFile() {
  const fileInput = document.getElementById('fileInput');
  if (!fileInput.files.length || !currentConversationId) return;

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  fetch(`/portal/chat/conversations/${currentConversationId}/file`, {
    method: 'POST',
    body: formData
  })
    .then(r => r.json())
    .then(res => {
      if (!res.success) alert('Failed to send file');
      fileInput.value = '';
    });
}

function showSidebar() {
  document.getElementById('chatSidebar').classList.remove('hidden');
}

// ── TASKS ──────────────────────────────────────────────────

function loadTasks() {
  const status = document.getElementById('filterStatus')?.value || '';
  const priority = document.getElementById('filterPriority')?.value || '';

  let url = '/portal/tasks/list?';
  if (status) url += `status=${status}&`;
  if (priority) url += `priority=${priority}&`;

  fetch(url)
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      renderTasks(res.data.tasks);
    });
}

function renderTasks(tasks) {
  const list = document.getElementById('tasksList');
  if (!list) return;

  if (!tasks.length) {
    list.innerHTML = '<div class="text-center text-muted p-4">No tasks found</div>';
    return;
  }

  list.innerHTML = tasks.map(t => {
    const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString() : 'No due date';
    const isOverdue = t.due_date && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.due_date) < new Date(new Date().toDateString());
    const overdueClass = isOverdue ? ' task-overdue' : '';
    const overdueIcon = isOverdue ? '<span class="overdue-badge"><i class="bi bi-exclamation-triangle-fill me-1"></i>OVERDUE</span>' : '';
    return `<div class="task-card${overdueClass}" onclick="openTask(${t.id})">
      <div class="task-card-header">
        <span class="task-title">${escapeHtml(t.title)}</span>
        <span class="priority-badge priority-${t.priority}">${t.priority}</span>
      </div>
      <div class="task-meta">
        <span class="status-badge status-${t.status}">${t.status === 'completed' ? '<i class="bi bi-check-circle-fill me-1"></i>DONE' : t.status.replace('_', ' ')}</span>
        ${overdueIcon}
        <span><i class="bi bi-person"></i> ${t.assigned_to_name}</span>
        <span><i class="bi bi-calendar"></i> ${dueStr}</span>
        <span><i class="bi bi-chat-dots"></i> ${t.comment_count || 0}</span>
        <span><i class="bi bi-person-up"></i> ${t.assigned_by_name}</span>
      </div>
    </div>`;
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
  if (task.assigned_to === PORTAL_USER.id || task.assigned_by === PORTAL_USER.id || PORTAL_USER.role === 'CLIENT_ADMIN') {
    statusHtml = `<select class="form-select form-select-sm" style="width:auto" onchange="updateTaskStatus(${task.id}, this.value)">
      <option value="open" ${task.status === 'open' ? 'selected' : ''}>Open</option>
      <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
      <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>Completed</option>
      <option value="cancelled" ${task.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
    </select>`;
  }
  actionsEl.innerHTML = statusHtml;

  const dueStr = task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date';

  body.innerHTML = `
    <div class="task-detail-compact">
      <div class="task-detail-title">${escapeHtml(task.title)}</div>
      ${task.description ? `<div class="task-detail-desc">${escapeHtml(task.description)}</div>` : ''}
      <div class="task-detail-tags">
        <span class="priority-badge priority-${task.priority}">${task.priority}</span>
        <span class="status-badge status-${task.status}">${task.status === 'completed' ? '<i class="bi bi-check-circle-fill me-1"></i>DONE' : task.status.replace('_', ' ')}</span>
        <span class="task-detail-info"><i class="bi bi-person-up"></i> ${task.assigned_by_name}</span>
        <span class="task-detail-info"><i class="bi bi-person"></i> ${task.assigned_to_name}</span>
        <span class="task-detail-info"><i class="bi bi-calendar"></i> ${dueStr}</span>
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
          const iconMap = { jpg: 'bi-file-image', jpeg: 'bi-file-image', png: 'bi-file-image', gif: 'bi-file-image', webp: 'bi-file-image', pdf: 'bi-file-pdf', doc: 'bi-file-word', docx: 'bi-file-word', xls: 'bi-file-excel', xlsx: 'bi-file-excel', zip: 'bi-file-zip', rar: 'bi-file-zip' };
          const icon = iconMap[ext] || 'bi-file-earmark';
          const size = a.file_size ? formatFileSize(a.file_size) : '';
          return `<a href="/portal/tasks/attachment/${a.id}" target="_blank" class="comment-attachment">
            <i class="bi ${icon}"></i> ${escapeHtml(a.file_name)} ${size ? `<span class="text-muted">(${size})</span>` : ''}
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

  list.innerHTML = users.map(u => {
    const initial = u.name.charAt(0).toUpperCase();
    const roleName = u.role_name.replace('CLIENT_', '').toLowerCase();
    const roleClass = roleName === 'admin' ? 'admin' : roleName === 'manager' ? 'manager' : 'user';
    const isAdmin = u.role_name === 'CLIENT_ADMIN';
    const activeClass = u.is_active ? 'active' : 'inactive';
    const activeText = u.is_active ? 'Active' : 'Inactive';

    return `<div class="user-card">
      <div class="user-card-avatar">${initial}</div>
      <div class="user-card-info">
        <div class="user-card-name">${escapeHtml(u.name)}</div>
        <div class="user-card-email">${escapeHtml(u.email)}</div>
        <div class="user-card-meta">
          <span class="role-badge ${roleClass}">${roleName}</span>
          <span class="active-badge ${activeClass}">${activeText}</span>
        </div>
      </div>
      <div class="user-card-actions">
        ${!isAdmin ? `
          <button class="btn btn-outline-secondary" title="Edit" onclick="showEditUserModal(${u.id}, '${escapeHtml(u.name).replace(/'/g, "\\'")}', '${escapeHtml(u.email).replace(/'/g, "\\'")}', ${u.role_id})">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-outline-secondary" title="Reset Password" onclick="showResetPwModal(${u.id}, '${escapeHtml(u.name).replace(/'/g, "\\'")}')">
            <i class="bi bi-key"></i>
          </button>
          <button class="btn ${u.is_active ? 'btn-outline-danger' : 'btn-outline-success'}" title="${u.is_active ? 'Deactivate' : 'Activate'}" onclick="toggleUserActive(${u.id})">
            <i class="bi ${u.is_active ? 'bi-person-slash' : 'bi-person-check'}"></i>
          </button>
        ` : ''}
      </div>
    </div>`;
  }).join('');
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

  // Play sound for messages from others
  if (msg.sender_id !== PORTAL_USER.id) {
    playNotificationSound();
  }

  loadConversations();
  updateUnreadBadge();
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
    const dot = el.querySelector('.online-dot');
    const userId = parseInt(el.getAttribute('data-user-id'));
    if (userId && onlineUserIds.has(userId)) {
      if (!dot) {
        const wrap = el.querySelector('.contact-avatar');
        if (wrap) {
          const parent = wrap.parentElement;
          wrap.remove();
          const wrapDiv = document.createElement('div');
          wrapDiv.className = 'conv-avatar-wrap';
          wrapDiv.appendChild(wrap);
          const dotEl = document.createElement('span');
          dotEl.className = 'online-dot';
          wrapDiv.appendChild(dotEl);
          parent.insertBefore(wrapDiv, parent.firstChild);
        }
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
        document.querySelectorAll('.conv-item').forEach(el => {
          const name = el.querySelector('.conv-name').textContent.toLowerCase();
          el.style.display = name.includes(q) ? '' : 'none';
        });
      });
    }
  }

  // Tasks page init
  if (document.getElementById('tasksList')) {
    loadTasks();
    checkDueTodayReminders();
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

    // Auto-save every 5 seconds of inactivity
    const noteContent = document.getElementById('noteContent');
    const noteTitle = document.getElementById('noteTitle');
    if (noteContent) {
      noteContent.addEventListener('input', () => {
        clearTimeout(noteAutoSaveTimer);
        noteAutoSaveTimer = setTimeout(saveNoteQuiet, 2000);
        document.getElementById('noteStatus').textContent = 'Unsaved changes...';
      });
    }
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

function showPortalToast({ title, sender, priority, taskId, customText, customIcon }) {
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

  // Click toast to navigate to task
  toast.addEventListener('click', () => {
    if (window.location.pathname !== '/portal/tasks') {
      window.location.href = '/portal/tasks';
    } else if (taskId) {
      openTask(taskId);
    }
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 250);
  });

  container.appendChild(toast);
}

// ── TEAM STATUS ────────────────────────────────────────────

let teamStatusInterval = null;

function loadTeamStatus() {
  fetch('/portal/team-status/data')
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      renderTeamStatus(res.data.employees, res.data.counts);
    });
}

let selectedEmployee = null;
let bridgeConvId = null;

function renderTeamStatus(employees, counts) {
  // Counts
  const countsEl = document.getElementById('statusCounts');
  if (countsEl) {
    countsEl.innerHTML = `
      <span class="status-count-pill working"><i class="bi bi-circle-fill"></i> ${counts.working} Working</span>
      <span class="status-count-pill idle"><i class="bi bi-circle-fill"></i> ${counts.idle} Idle</span>
      <span class="status-count-pill absent"><i class="bi bi-circle-fill"></i> ${counts.absent} Absent</span>
      <span class="status-count-pill off"><i class="bi bi-circle-fill"></i> ${counts.off} Off</span>
    `;
  }

  // Table
  const tbody = document.getElementById('statusTableBody');
  if (!tbody) return;

  if (!employees.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No employees found</td></tr>';
    return;
  }

  tbody.innerHTML = employees.map(e => {
    const shiftStr = e.shiftStart ? e.shiftStart.substring(0, 5) : '--';
    const statusClass = `ts-${e.statusType}`;

    let elapsed = '--';
    if (e.startedAt) {
      const started = parseServerDate(e.startedAt);
      const diffSec = Math.floor((new Date() - started) / 1000);
      if (diffSec >= 0) {
        const h = Math.floor(diffSec / 3600);
        const m = Math.floor((diffSec % 3600) / 60);
        elapsed = h > 0 ? `${h}h ${m}m` : `${m}m`;
      }
    }

    const startedStr = e.startedAt ? parseServerDate(e.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';

    return `<tr class="${statusClass}" style="cursor:pointer" onclick="openEmployeePanel(${e.id}, '${escapeHtml(e.name).replace(/'/g, "\\'")}', '${e.status}', '${e.statusType}')">
      <td class="ts-name">${escapeHtml(e.name)}</td>
      <td><code>${shiftStr}</code></td>
      <td><span class="ts-badge ${statusClass}">${e.status}</span></td>
      <td class="ts-task">${e.taskName ? escapeHtml(e.taskName) : '--'}</td>
      <td>${startedStr}</td>
      <td>${elapsed}</td>
    </tr>`;
  }).join('');
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
    const preview = n.content ? n.content.substring(0, 60) + (n.content.length > 60 ? '...' : '') : 'No content';
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
      document.getElementById('noteContent').value = note.content || '';
      document.getElementById('noteStatus').textContent = 'Last saved: ' + timeAgo(note.updated_at);
      currentNotePinned = !!note.is_pinned;
      updatePinIcon();

      // Highlight in sidebar
      document.querySelectorAll('.note-item').forEach(el => el.classList.remove('active'));
      loadNotes();
    });
}

function saveNote() {
  if (!currentNoteId) return;
  const title = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteContent').value.trim();
  if (!title) return alert('Title is required');

  fetch(`/portal/notes/${currentNoteId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        document.getElementById('noteStatus').textContent = 'Saved just now';
        loadNotes();
      }
    });
}

function saveNoteQuiet() {
  if (!currentNoteId) return;
  const title = document.getElementById('noteTitle')?.value?.trim();
  const content = document.getElementById('noteContent')?.value?.trim();
  if (!title) return;

  fetch(`/portal/notes/${currentNoteId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content })
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        const statusEl = document.getElementById('noteStatus');
        if (statusEl) statusEl.textContent = 'Auto-saved';
        loadNotes();
      }
    })
    .catch(() => {});
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
  const title = document.getElementById('noteTitle').value || 'note';
  const content = document.getElementById('noteContent').value || '';
  const blob = new Blob([title + '\n' + '='.repeat(title.length) + '\n\n' + content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_') + '.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportNotePDF() {
  const title = document.getElementById('noteTitle').value || 'Note';
  const content = document.getElementById('noteContent').value || '';
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
    <style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#222;}
    h1{font-size:1.5rem;border-bottom:2px solid #333;padding-bottom:8px;}
    pre{white-space:pre-wrap;font-family:inherit;font-size:0.95rem;line-height:1.7;}
    .meta{font-size:0.75rem;color:#888;margin-bottom:20px;}</style></head>
    <body><h1>${escapeHtml(title)}</h1>
    <div class="meta">${new Date().toLocaleString()}</div>
    <pre>${escapeHtml(content)}</pre></body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 500);
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
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  const content = document.getElementById('noteContent');
  const startPos = content.selectionStart;
  let finalTranscript = '';

  recognition.onresult = function(event) {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript + ' ';
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    // Insert at cursor position
    const before = content.value.substring(0, startPos);
    const after = content.value.substring(startPos);
    content.value = before + finalTranscript + interim + after;
  };

  recognition.onerror = function() {
    stopDictation();
  };

  recognition.onend = function() {
    // If still dictating, restart (continuous mode can stop)
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

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1046, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.3);
  } catch (_) {}
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
      const canManage = PORTAL_USER.role === 'CLIENT_ADMIN' || PORTAL_USER.role === 'CLIENT_MANAGER' || conv.created_by === PORTAL_USER.id;

      list.innerHTML = res.data.participants.map(p => {
        const isCreator = p.id === conv.created_by;
        const removeBtn = canManage && !isCreator && p.id !== PORTAL_USER.id
          ? `<button class="btn btn-sm btn-outline-danger" style="width:28px;height:28px;padding:0" onclick="removeGroupMember(${p.id})"><i class="bi bi-x"></i></button>`
          : '';
        return `<div class="d-flex align-items-center gap-2 mb-2">
          <div class="contact-avatar" style="width:32px;height:32px;font-size:0.75rem">${p.name.charAt(0).toUpperCase()}</div>
          <div style="flex:1">
            <div class="small fw-bold">${escapeHtml(p.name)}</div>
            <div style="font-size:0.65rem;color:var(--tf-text-muted)">${p.role_name.replace('CLIENT_', '')} ${isCreator ? '(Creator)' : ''}</div>
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

  const iconMap = { pdf: 'bi-file-pdf', doc: 'bi-file-word', docx: 'bi-file-word', xls: 'bi-file-excel', xlsx: 'bi-file-excel', zip: 'bi-file-zip', rar: 'bi-file-zip', mp4: 'bi-file-play', mp3: 'bi-file-music' };
  const icon = iconMap[ext] || 'bi-file-earmark';
  return `<a class="msg-file" href="${url}" target="_blank">
    <i class="bi ${icon}"></i>
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
