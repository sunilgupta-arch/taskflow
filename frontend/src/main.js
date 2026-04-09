import './style.css';
import router from './router/index.js';
import { fetchProfile, isLoggedIn, hasRole } from './utils/auth.js';

// --- Pages ---
import { loginPage } from './pages/auth/login.js';
import { dashboardPage } from './pages/dashboard/index.js';
import { tasksPage } from './pages/tasks/index.js';
import { boardPage } from './pages/tasks/board.js';
import { myTasksPage } from './pages/tasks/my.js';
import { taskShowPage } from './pages/tasks/show.js';
import { taskCreatePage } from './pages/tasks/create.js';
import { taskEditPage } from './pages/tasks/edit.js';
import { chatPage } from './pages/chat/index.js';
import { drivePage } from './pages/drive/index.js';
import { reportsIndexPage } from './pages/reports/index.js';
import { completionReportPage } from './pages/reports/completion.js';
import { taskCompletionReportPage } from './pages/reports/task-completion.js';
import { overdueReportPage } from './pages/reports/overdue.js';
import { rewardsReportPage } from './pages/reports/rewards.js';
import { punctualityReportPage } from './pages/reports/punctuality.js';
import { workloadReportPage } from './pages/reports/workload.js';
import { usersPage } from './pages/users/index.js';
import { userProgressPage, myProgressPage } from './pages/users/progress.js';
import { attendancePage, myAttendancePage } from './pages/attendance/index.js';
import { leavesPage } from './pages/leaves/index.js';
import { rewardsPage } from './pages/rewards/index.js';
import { notesPage } from './pages/notes/index.js';
import { announcementsPage } from './pages/announcements/index.js';
import { liveStatusPage } from './pages/live-status/index.js';
import { backupPage } from './pages/backup/index.js';
import { helpPage } from './pages/help/index.js';
import { notFoundPage } from './pages/error/index.js';

// --- Auth guard ---
const PUBLIC_ROUTES = ['/login'];

router.beforeEach = (route) => {
  if (PUBLIC_ROUTES.includes(route.path)) return true;
  if (!isLoggedIn()) {
    router.navigate('/login');
    return false;
  }
  // Role-based guards
  if (route.meta.roles && !hasRole(...route.meta.roles)) {
    router.navigate('/tasks');
    return false;
  }
  return true;
};

// --- Route definitions ---

// Auth
router.on('/login', loginPage);

// Dashboard
router.on('/dashboard', dashboardPage, { roles: ['LOCAL_ADMIN', 'CLIENT_ADMIN', 'LOCAL_MANAGER', 'CLIENT_MANAGER'] });

// Tasks
router.on('/tasks/board', boardPage, { roles: ['LOCAL_ADMIN', 'CLIENT_ADMIN', 'LOCAL_MANAGER', 'CLIENT_MANAGER'] });
router.on('/tasks/create', taskCreatePage);
router.on('/tasks/my', myTasksPage);
router.on('/tasks/:id/edit', taskEditPage);
router.on('/tasks/:id', taskShowPage);
router.on('/tasks', tasksPage);

// Chat
router.on('/chat', chatPage);

// Drive
router.on('/drive', drivePage);

// Reports
router.on('/reports/completion', completionReportPage, { roles: ['LOCAL_ADMIN', 'CLIENT_ADMIN', 'LOCAL_MANAGER', 'CLIENT_MANAGER'] });
router.on('/reports/task-completion', taskCompletionReportPage, { roles: ['LOCAL_ADMIN', 'CLIENT_ADMIN', 'LOCAL_MANAGER', 'CLIENT_MANAGER'] });
router.on('/reports/overdue', overdueReportPage, { roles: ['LOCAL_ADMIN', 'CLIENT_ADMIN', 'LOCAL_MANAGER', 'CLIENT_MANAGER'] });
router.on('/reports/rewards', rewardsReportPage, { roles: ['LOCAL_ADMIN', 'CLIENT_ADMIN', 'LOCAL_MANAGER', 'CLIENT_MANAGER'] });
router.on('/reports/punctuality', punctualityReportPage, { roles: ['LOCAL_ADMIN', 'CLIENT_ADMIN', 'LOCAL_MANAGER', 'CLIENT_MANAGER'] });
router.on('/reports/workload', workloadReportPage, { roles: ['LOCAL_ADMIN', 'CLIENT_ADMIN', 'LOCAL_MANAGER', 'CLIENT_MANAGER'] });
router.on('/reports', reportsIndexPage, { roles: ['LOCAL_ADMIN', 'CLIENT_ADMIN', 'LOCAL_MANAGER', 'CLIENT_MANAGER'] });

// Users
router.on('/users/:id/progress', userProgressPage, { roles: ['LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'] });
router.on('/users', usersPage, { roles: ['LOCAL_ADMIN', 'LOCAL_MANAGER'] });

// Self-service
router.on('/my-progress', myProgressPage);
router.on('/my-attendance', myAttendancePage);

// Attendance (admin)
router.on('/attendance', attendancePage, { roles: ['LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'] });

// Leaves
router.on('/leaves', leavesPage, { roles: ['LOCAL_ADMIN', 'LOCAL_MANAGER', 'LOCAL_USER'] });

// Live Status
router.on('/live-status', liveStatusPage, { roles: ['LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'] });

// Rewards
router.on('/rewards', rewardsPage);

// Notes
router.on('/notes', notesPage);

// Announcements
router.on('/announcements', announcementsPage);

// Backups
router.on('/backups', backupPage, { roles: ['LOCAL_ADMIN'] });

// Help
router.on('/help', helpPage);

// Catch-all
router.on('/', () => {
  if (!isLoggedIn()) return router.navigate('/login');
  router.navigate('/tasks/board');
});

router.notFound = notFoundPage;

// --- Bootstrap ---
async function init() {
  const user = await fetchProfile();
  if (!user && window.location.hash !== '#/login') {
    window.location.hash = '/login';
  }
  router.start();
}

init();
