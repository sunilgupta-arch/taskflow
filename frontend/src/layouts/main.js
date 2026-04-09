import { getUser, isAdminOrManager, isAdmin, isLocalOrg, hasRole, logout } from '../utils/auth.js';

/**
 * Wrap page content inside the app shell (navbar + sidebar + main).
 */
export function layout(pageContent, activeRoute = '') {
  const user = getUser();
  if (!user) return pageContent;

  return `
    <div class="min-h-screen bg-gray-50 flex">
      ${sidebar(activeRoute)}
      <div class="flex-1 flex flex-col min-w-0">
        ${navbar()}
        <main class="flex-1 p-6 overflow-auto">
          ${pageContent}
        </main>
      </div>
    </div>
  `;
}

function navbar() {
  const user = getUser();
  return `
    <header class="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <button id="sidebar-toggle" class="lg:hidden text-gray-500 hover:text-gray-700">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>
      <div class="flex-1"></div>
      <div class="flex items-center gap-4">
        <span class="text-sm text-gray-600">${user?.name || ''}</span>
        <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">${user?.role_name || ''}</span>
        <button id="logout-btn" class="text-sm text-red-600 hover:text-red-800">Logout</button>
      </div>
    </header>
  `;
}

function sidebar(activeRoute) {
  const user = getUser();
  const links = getSidebarLinks();

  const linkHtml = links.map(link => {
    if (link.separator) return `<hr class="my-2 border-gray-700">`;
    const active = activeRoute === link.route || activeRoute.startsWith(link.route + '/');
    return `
      <a data-route="${link.route}"
         class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors
                ${active ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}">
        <span>${link.icon}</span>
        <span>${link.label}</span>
      </a>
    `;
  }).join('');

  return `
    <aside id="sidebar" class="w-64 bg-gray-900 text-white flex-shrink-0 hidden lg:flex flex-col">
      <div class="p-4 border-b border-gray-700">
        <h1 class="text-xl font-bold">TaskFlow</h1>
        <p class="text-xs text-gray-400 mt-1">${user?.org_name || ''}</p>
      </div>
      <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
        ${linkHtml}
      </nav>
    </aside>
  `;
}

function getSidebarLinks() {
  const links = [];

  if (isAdminOrManager()) {
    links.push({ route: '/dashboard', label: 'Dashboard', icon: '📊' });
  }

  if (isAdminOrManager()) {
    links.push({ route: '/tasks/board', label: 'Task Board', icon: '📋' });
  }
  links.push({ route: '/tasks', label: 'Tasks', icon: '✅' });
  links.push({ route: '/tasks/my', label: 'My Tasks', icon: '👤' });

  links.push({ separator: true });

  links.push({ route: '/chat', label: 'Chat', icon: '💬' });
  links.push({ route: '/drive', label: 'Drive', icon: '📁' });
  links.push({ route: '/notes', label: 'Notes', icon: '📝' });

  links.push({ separator: true });

  if (isAdminOrManager()) {
    links.push({ route: '/reports', label: 'Reports', icon: '📈' });
    links.push({ route: '/attendance', label: 'Attendance', icon: '📅' });
    links.push({ route: '/live-status', label: 'Live Status', icon: '🟢' });
  }

  links.push({ route: '/my-attendance', label: 'My Attendance', icon: '🕐' });

  if (isLocalOrg()) {
    links.push({ route: '/leaves', label: 'Leaves', icon: '🏖️' });
  }

  links.push({ route: '/rewards', label: 'Rewards', icon: '🏆' });
  links.push({ route: '/announcements', label: 'Announcements', icon: '📢' });

  links.push({ separator: true });

  if (isAdminOrManager()) {
    links.push({ route: '/users', label: 'Users', icon: '👥' });
  }

  if (hasRole('LOCAL_ADMIN')) {
    links.push({ route: '/backups', label: 'Backups', icon: '💾' });
  }

  links.push({ route: '/help', label: 'Help', icon: '❓' });

  return links;
}

export function initLayout() {
  // Sidebar toggle for mobile
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('hidden');
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => logout());
  }
}
