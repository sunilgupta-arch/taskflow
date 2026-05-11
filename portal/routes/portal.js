const express = require('express');
const router = express.Router();
const multer = require('multer');
const authenticate = require('../../middleware/authenticate');
const portalOnly = require('../middleware/portalOnly');
const PortalChatController = require('../controllers/chatController');
const PortalTaskController = require('../controllers/taskController');
const PortalUserController = require('../controllers/userController');
const PortalTeamStatusController = require('../controllers/teamStatusController');
const UrgentController = require('../controllers/urgentController');
const { requireRoles } = require('../../middleware/authorize');

// Multer: memory storage for portal file uploads, 100MB max
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

// All portal routes require auth + client role
router.use(authenticate);
router.use(portalOnly);

// ── Portal Home (landing page) ───────────────────────────
router.get('/', (req, res) => {
  res.render('portal/home', {
    title: 'CFC Portal',
    layout: 'portal/layout',
    section: 'home'
  });
});

// ── Home Briefing API ───────────────────────────────────
router.get('/briefing', async (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  const db = require('../../config/db');
  try {
    const userId = req.user.id;
    const roleName = req.user.role_name;
    const isAdmin = ['CLIENT_ADMIN', 'CLIENT_TOP_MGMT'].includes(roleName);
    const today = new Date().toISOString().split('T')[0];

    // Tasks due today (assigned to user or created by user; admin sees all)
    let dueTodayQuery, dueTodayParams;
    if (isAdmin) {
      dueTodayQuery = `SELECT t.*, creator.name as assigned_by_name, assignee.name as assigned_to_name
        FROM portal_tasks t
        JOIN users creator ON creator.id = t.assigned_by
        JOIN users assignee ON assignee.id = t.assigned_to
        WHERE t.due_date = ? AND t.is_archived = 0 AND t.status != 'completed' AND t.status != 'cancelled'
        ORDER BY FIELD(t.priority, 'urgent', 'high', 'medium', 'low'), t.created_at DESC`;
      dueTodayParams = [today];
    } else {
      dueTodayQuery = `SELECT t.*, creator.name as assigned_by_name, assignee.name as assigned_to_name
        FROM portal_tasks t
        JOIN users creator ON creator.id = t.assigned_by
        JOIN users assignee ON assignee.id = t.assigned_to
        WHERE t.due_date = ? AND t.is_archived = 0 AND t.status != 'completed' AND t.status != 'cancelled'
          AND (t.assigned_to = ? OR t.assigned_by = ?)
        ORDER BY FIELD(t.priority, 'urgent', 'high', 'medium', 'low'), t.created_at DESC`;
      dueTodayParams = [today, userId, userId];
    }
    const [dueToday] = await db.query(dueTodayQuery, dueTodayParams);

    // Overdue tasks
    let overdueQuery, overdueParams;
    if (isAdmin) {
      overdueQuery = `SELECT t.*, creator.name as assigned_by_name, assignee.name as assigned_to_name
        FROM portal_tasks t
        JOIN users creator ON creator.id = t.assigned_by
        JOIN users assignee ON assignee.id = t.assigned_to
        WHERE t.due_date < ? AND t.is_archived = 0 AND t.status != 'completed' AND t.status != 'cancelled'
        ORDER BY t.due_date ASC`;
      overdueParams = [today];
    } else {
      overdueQuery = `SELECT t.*, creator.name as assigned_by_name, assignee.name as assigned_to_name
        FROM portal_tasks t
        JOIN users creator ON creator.id = t.assigned_by
        JOIN users assignee ON assignee.id = t.assigned_to
        WHERE t.due_date < ? AND t.is_archived = 0 AND t.status != 'completed' AND t.status != 'cancelled'
          AND (t.assigned_to = ? OR t.assigned_by = ?)
        ORDER BY t.due_date ASC`;
      overdueParams = [today, userId, userId];
    }
    const [overdue] = await db.query(overdueQuery, overdueParams);

    // In-progress tasks (no due date filter — any open work)
    let inProgressQuery, inProgressParams;
    if (isAdmin) {
      inProgressQuery = `SELECT COUNT(*) as cnt FROM portal_tasks WHERE status = 'in_progress' AND is_archived = 0`;
      inProgressParams = [];
    } else {
      inProgressQuery = `SELECT COUNT(*) as cnt FROM portal_tasks WHERE status = 'in_progress' AND is_archived = 0 AND (assigned_to = ? OR assigned_by = ?)`;
      inProgressParams = [userId, userId];
    }
    const [[{ cnt: inProgressCount }]] = await db.query(inProgressQuery, inProgressParams);

    // Open tasks count
    let openQuery, openParams;
    if (isAdmin) {
      openQuery = `SELECT COUNT(*) as cnt FROM portal_tasks WHERE status = 'open' AND is_archived = 0`;
      openParams = [];
    } else {
      openQuery = `SELECT COUNT(*) as cnt FROM portal_tasks WHERE status = 'open' AND is_archived = 0 AND (assigned_to = ? OR assigned_by = ?)`;
      openParams = [userId, userId];
    }
    const [[{ cnt: openCount }]] = await db.query(openQuery, openParams);

    // Unread chat messages count
    const PortalChat = require('../models/Chat');
    const unreadCount = await PortalChat.getTotalUnreadCount(userId);

    // Recent activity — last 10 task status changes / comments from today
    let activityQuery, activityParams;
    if (isAdmin) {
      activityQuery = `(SELECT 'comment' as type, tc.created_at, u.name as user_name, t.title as task_title, tc.content as detail, t.id as task_id
         FROM portal_task_comments tc
         JOIN users u ON u.id = tc.user_id
         JOIN portal_tasks t ON t.id = tc.task_id
         WHERE DATE(tc.created_at) = ?
         ORDER BY tc.created_at DESC LIMIT 10)
       ORDER BY created_at DESC LIMIT 10`;
      activityParams = [today];
    } else {
      activityQuery = `(SELECT 'comment' as type, tc.created_at, u.name as user_name, t.title as task_title, tc.content as detail, t.id as task_id
         FROM portal_task_comments tc
         JOIN users u ON u.id = tc.user_id
         JOIN portal_tasks t ON t.id = tc.task_id
         WHERE DATE(tc.created_at) = ? AND (t.assigned_to = ? OR t.assigned_by = ?)
         ORDER BY tc.created_at DESC LIMIT 10)
       ORDER BY created_at DESC LIMIT 10`;
      activityParams = [today, userId, userId];
    }
    const [activity] = await db.query(activityQuery, activityParams);

    return ApiResponse.success(res, {
      dueToday,
      overdue,
      inProgressCount,
      openCount,
      unreadCount,
      activity
    });
  } catch (err) {
    console.error('Portal briefing error:', err);
    return ApiResponse.error(res, 'Failed to load briefing');
  }
});

// ── Reminders API ───────────────────────────────────────
const PortalReminder = require('../models/Reminder');
const { ApiResponse: ReminderApiResponse } = require('../../utils/response');

router.get('/reminders', async (req, res) => {
  try {
    const includeDone = req.query.done === '1';
    const reminders = await PortalReminder.getForUser(req.user.id, { includeDone });
    return ReminderApiResponse.success(res, { reminders });
  } catch (err) {
    return ReminderApiResponse.error(res, 'Failed to load reminders');
  }
});

router.post('/reminders', async (req, res) => {
  try {
    const { title, note, remind_at } = req.body;
    if (!title || !title.trim()) return ReminderApiResponse.error(res, 'Title is required', 400);
    if (!remind_at) return ReminderApiResponse.error(res, 'Reminder date/time is required', 400);
    const id = await PortalReminder.create({ user_id: req.user.id, title: title.trim(), note: note?.trim() || null, remind_at });
    const reminder = await PortalReminder.findById(id);
    return ReminderApiResponse.success(res, { reminder }, 'Reminder created', 201);
  } catch (err) {
    return ReminderApiResponse.error(res, err.message, 400);
  }
});

router.put('/reminders/:id', async (req, res) => {
  try {
    const reminder = await PortalReminder.findById(req.params.id);
    if (!reminder || reminder.user_id !== req.user.id) return ReminderApiResponse.error(res, 'Not found', 404);
    const { title, note, remind_at } = req.body;
    if (title !== undefined && !title.trim()) return ReminderApiResponse.error(res, 'Title is required', 400);
    const updates = {};
    if (title) updates.title = title.trim();
    if (note !== undefined) updates.note = note?.trim() || null;
    if (remind_at) { updates.remind_at = remind_at; updates.notified = 0; }
    await PortalReminder.update(req.params.id, updates);
    const updated = await PortalReminder.findById(req.params.id);
    return ReminderApiResponse.success(res, { reminder: updated }, 'Reminder updated');
  } catch (err) {
    return ReminderApiResponse.error(res, err.message, 400);
  }
});

router.patch('/reminders/:id/done', async (req, res) => {
  try {
    const reminder = await PortalReminder.findById(req.params.id);
    if (!reminder || reminder.user_id !== req.user.id) return ReminderApiResponse.error(res, 'Not found', 404);
    await PortalReminder.toggleDone(req.params.id);
    const updated = await PortalReminder.findById(req.params.id);
    return ReminderApiResponse.success(res, { reminder: updated }, updated.is_done ? 'Done' : 'Restored');
  } catch (err) {
    return ReminderApiResponse.error(res, err.message, 400);
  }
});

router.delete('/reminders/:id', async (req, res) => {
  try {
    const reminder = await PortalReminder.findById(req.params.id);
    if (!reminder || reminder.user_id !== req.user.id) return ReminderApiResponse.error(res, 'Not found', 404);
    await PortalReminder.delete(req.params.id);
    return ReminderApiResponse.success(res, {}, 'Reminder deleted');
  } catch (err) {
    return ReminderApiResponse.error(res, err.message, 400);
  }
});

// ── Reports Page & API ──────────────────────────────────
const PortalReport = require('../models/Report');

router.get('/reports', (req, res) => {
  res.render('portal/reports', {
    title: 'Links - Client Portal',
    layout: 'portal/layout',
    section: 'reports'
  });
});

router.get('/reports/list', async (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  try {
    const reports = await PortalReport.getForUser(req.user.id);
    return ApiResponse.success(res, { reports });
  } catch (err) {
    return ApiResponse.error(res, 'Failed to load reports');
  }
});

router.post('/reports', async (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  try {
    const { name, url, color } = req.body;
    if (!name || !name.trim()) return ApiResponse.error(res, 'Name is required', 400);
    if (!url || !url.trim()) return ApiResponse.error(res, 'URL is required', 400);
    const id = await PortalReport.create({ user_id: req.user.id, name: name.trim(), url: url.trim(), color: color || 'blue' });
    const report = await PortalReport.findById(id);
    return ApiResponse.success(res, { report }, 'Report added', 201);
  } catch (err) {
    return ApiResponse.error(res, err.message, 400);
  }
});

router.put('/reports/:id', async (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  try {
    const report = await PortalReport.findById(req.params.id);
    if (!report || report.user_id !== req.user.id) return ApiResponse.error(res, 'Not found', 404);
    const { name, url, color } = req.body;
    if (name !== undefined && !name.trim()) return ApiResponse.error(res, 'Name is required', 400);
    if (url !== undefined && !url.trim()) return ApiResponse.error(res, 'URL is required', 400);
    await PortalReport.update(req.params.id, { name: name?.trim(), url: url?.trim(), color });
    const updated = await PortalReport.findById(req.params.id);
    return ApiResponse.success(res, { report: updated }, 'Report updated');
  } catch (err) {
    return ApiResponse.error(res, err.message, 400);
  }
});

router.delete('/reports/:id', async (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  try {
    const report = await PortalReport.findById(req.params.id);
    if (!report || report.user_id !== req.user.id) return ApiResponse.error(res, 'Not found', 404);
    await PortalReport.delete(req.params.id);
    return ApiResponse.success(res, {}, 'Report deleted');
  } catch (err) {
    return ApiResponse.error(res, err.message, 400);
  }
});

// ── Calendar Page & API ─────────────────────────────────
const CalendarEvent = require('../models/CalendarEvent');

router.get('/calendar', (req, res) => {
  res.render('portal/calendar', {
    title: 'Calendar - Client Portal',
    layout: 'portal/layout',
    section: 'calendar'
  });
});

// Get year data (events + reminders + tasks aggregated by date)
router.get('/calendar/year-data', async (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const dateMap = await CalendarEvent.getYearData(req.user.id, year, req.user.role_name);
    return ApiResponse.success(res, { year, dateMap });
  } catch (err) {
    console.error('Calendar year data error:', err);
    return ApiResponse.error(res, 'Failed to load calendar data');
  }
});

// Get entries for a specific date
router.get('/calendar/date/:date', async (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  try {
    const date = req.params.date;
    const events = await CalendarEvent.getForDate(req.user.id, date);

    // Also get reminders for this date
    const db = require('../../config/db');
    const [reminders] = await db.query(
      'SELECT id, title, note, remind_at, is_done FROM portal_reminders WHERE user_id = ? AND DATE(remind_at) = ?',
      [req.user.id, date]
    );

    // Tasks due on this date
    const isAdmin = ['CLIENT_ADMIN', 'CLIENT_TOP_MGMT'].includes(req.user.role_name);
    let tasks;
    if (isAdmin) {
      const [rows] = await db.query(
        `SELECT t.id, t.title, t.priority, t.status, t.due_date, assignee.name as assigned_to_name
         FROM portal_tasks t JOIN users assignee ON assignee.id = t.assigned_to
         WHERE t.due_date = ? AND t.is_archived = 0 ORDER BY t.priority DESC`,
        [date]
      );
      tasks = rows;
    } else {
      const [rows] = await db.query(
        `SELECT t.id, t.title, t.priority, t.status, t.due_date, assignee.name as assigned_to_name
         FROM portal_tasks t JOIN users assignee ON assignee.id = t.assigned_to
         WHERE t.due_date = ? AND t.is_archived = 0 AND (t.assigned_to = ? OR t.assigned_by = ?)
         ORDER BY t.priority DESC`,
        [date, req.user.id, req.user.id]
      );
      tasks = rows;
    }

    return ApiResponse.success(res, { events, reminders, tasks });
  } catch (err) {
    return ApiResponse.error(res, 'Failed to load date data');
  }
});

// Create calendar event
router.post('/calendar/events', async (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  try {
    const { event_date, title, description, color } = req.body;
    if (!title || !title.trim()) return ApiResponse.error(res, 'Title is required', 400);
    if (!event_date) return ApiResponse.error(res, 'Date is required', 400);
    const id = await CalendarEvent.create({
      user_id: req.user.id,
      event_date,
      title: title.trim(),
      description: description?.trim() || null,
      color: color || 'blue'
    });
    const event = await CalendarEvent.findById(id);
    return ApiResponse.success(res, { event }, 'Event created', 201);
  } catch (err) {
    return ApiResponse.error(res, err.message, 400);
  }
});

// Update calendar event
router.put('/calendar/events/:id', async (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  try {
    const event = await CalendarEvent.findById(req.params.id);
    if (!event || event.user_id !== req.user.id) return ApiResponse.error(res, 'Not found', 404);
    const { title, description, event_date, color } = req.body;
    if (title !== undefined && !title.trim()) return ApiResponse.error(res, 'Title is required', 400);
    await CalendarEvent.update(req.params.id, { title: title?.trim(), description: description?.trim() || null, event_date, color });
    const updated = await CalendarEvent.findById(req.params.id);
    return ApiResponse.success(res, { event: updated }, 'Event updated');
  } catch (err) {
    return ApiResponse.error(res, err.message, 400);
  }
});

// Delete calendar event
router.delete('/calendar/events/:id', async (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  try {
    const event = await CalendarEvent.findById(req.params.id);
    if (!event || event.user_id !== req.user.id) return ApiResponse.error(res, 'Not found', 404);
    await CalendarEvent.delete(req.params.id);
    return ApiResponse.success(res, {}, 'Event deleted');
  } catch (err) {
    return ApiResponse.error(res, err.message, 400);
  }
});

// Toggle calendar event done
router.patch('/calendar/events/:id/done', async (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  try {
    const event = await CalendarEvent.findById(req.params.id);
    if (!event || event.user_id !== req.user.id) return ApiResponse.error(res, 'Not found', 404);
    await CalendarEvent.toggleDone(req.params.id);
    const updated = await CalendarEvent.findById(req.params.id);
    return ApiResponse.success(res, { event: updated }, updated.is_done ? 'Done' : 'Restored');
  } catch (err) {
    return ApiResponse.error(res, err.message, 400);
  }
});

// Upcoming entries for side rail (events + reminders + tasks, 30 days ahead)
router.get('/calendar/upcoming', async (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  const db = require('../../config/db');
  try {
    const userId = req.user.id;
    const isAdmin = ['CLIENT_ADMIN', 'CLIENT_TOP_MGMT'].includes(req.user.role_name);
    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    // Calendar events (today to 30 days ahead)
    let events = [];
    try {
      const [rows] = await db.query(
        'SELECT *, "event" as entry_type FROM portal_calendar_events WHERE user_id = ? AND event_date >= ? AND event_date <= ? ORDER BY event_date ASC, created_at ASC',
        [userId, today, endDate]
      );
      events = rows;
    } catch (_) {}

    // Reminders (today to 30 days ahead)
    let reminders = [];
    try {
      const [rows] = await db.query(
        'SELECT *, "reminder" as entry_type FROM portal_reminders WHERE user_id = ? AND DATE(remind_at) >= ? AND DATE(remind_at) <= ? ORDER BY remind_at ASC',
        [userId, today, endDate]
      );
      reminders = rows;
    } catch (_) {}

    // Tasks with due dates (today to 30 days ahead)
    let tasks = [];
    try {
      let q, p;
      if (isAdmin) {
        q = `SELECT t.*, assignee.name as assigned_to_name, 'task' as entry_type
             FROM portal_tasks t JOIN users assignee ON assignee.id = t.assigned_to
             WHERE t.due_date >= ? AND t.due_date <= ? AND t.is_archived = 0
             ORDER BY t.due_date ASC`;
        p = [today, endDate];
      } else {
        q = `SELECT t.*, assignee.name as assigned_to_name, 'task' as entry_type
             FROM portal_tasks t JOIN users assignee ON assignee.id = t.assigned_to
             WHERE t.due_date >= ? AND t.due_date <= ? AND t.is_archived = 0
               AND (t.assigned_to = ? OR t.assigned_by = ?)
             ORDER BY t.due_date ASC`;
        p = [today, endDate, userId, userId];
      }
      const [rows] = await db.query(q, p);
      tasks = rows;
    } catch (_) {}

    // Also get overdue items (before today, not done)
    let overdueEvents = [];
    try {
      const [rows] = await db.query(
        'SELECT *, "event" as entry_type FROM portal_calendar_events WHERE user_id = ? AND event_date < ? AND is_done = 0 ORDER BY event_date ASC',
        [userId, today]
      );
      overdueEvents = rows;
    } catch (_) {}

    let overdueTasks = [];
    try {
      let q, p;
      if (isAdmin) {
        q = `SELECT t.*, assignee.name as assigned_to_name, 'task' as entry_type
             FROM portal_tasks t JOIN users assignee ON assignee.id = t.assigned_to
             WHERE t.due_date < ? AND t.is_archived = 0 AND t.status NOT IN ('completed', 'cancelled')
             ORDER BY t.due_date ASC`;
        p = [today];
      } else {
        q = `SELECT t.*, assignee.name as assigned_to_name, 'task' as entry_type
             FROM portal_tasks t JOIN users assignee ON assignee.id = t.assigned_to
             WHERE t.due_date < ? AND t.is_archived = 0 AND t.status NOT IN ('completed', 'cancelled')
               AND (t.assigned_to = ? OR t.assigned_by = ?)
             ORDER BY t.due_date ASC`;
        p = [today, userId, userId];
      }
      const [rows] = await db.query(q, p);
      overdueTasks = rows;
    } catch (_) {}

    return ApiResponse.success(res, { events, reminders, tasks, overdueEvents, overdueTasks });
  } catch (err) {
    console.error('Calendar upcoming error:', err);
    return ApiResponse.error(res, 'Failed to load upcoming entries');
  }
});

// ── Chat Pages & API ─────────────────────────────────────
router.get('/chat', PortalChatController.index);
router.get('/chat/conversations', PortalChatController.listConversations);
router.post('/chat/conversations', PortalChatController.createConversation);
router.get('/chat/conversations/:id/messages', PortalChatController.getMessages);
router.post('/chat/conversations/:id/messages', PortalChatController.sendMessage);
const portalChatUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.post('/chat/conversations/:id/file', (req, res, next) => portalChatUpload.single('file')(req, res, (err) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'Attachment too large. Max 10 MB.' });
  if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
  next();
}), PortalChatController.sendFile);
router.get('/chat/attachment/:messageId', PortalChatController.serveAttachment);
router.post('/chat/conversations/:id/read', PortalChatController.markAsRead);
router.get('/chat/unread-count', PortalChatController.unreadCount);
router.get('/chat/conversations/:id/search', PortalChatController.searchMessages);
router.put('/chat/messages/:messageId', PortalChatController.editMessage);
router.delete('/chat/messages/:messageId', PortalChatController.deleteMessage);
router.get('/chat/conversations/:id/members', PortalChatController.getGroupMembers);
router.post('/chat/conversations/:id/members', PortalChatController.addGroupMembers);
router.delete('/chat/conversations/:id/members/:userId', PortalChatController.removeGroupMember);

// ── Tasks Pages & API ────────────────────────────────────
router.get('/tasks', PortalTaskController.index);
router.get('/tasks/list', PortalTaskController.list);
router.post('/tasks', PortalTaskController.create);
router.get('/tasks/:id', PortalTaskController.getTask);
router.put('/tasks/:id', PortalTaskController.update);
router.patch('/tasks/:id/archive', PortalTaskController.toggleArchive);
const portalTaskUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
router.post('/tasks/:id/comments', (req, res, next) => portalTaskUpload.single('file')(req, res, (err) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'Attachment too large. Max 25 MB.' });
  if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
  next();
}), PortalTaskController.addComment);
router.put('/tasks/comments/:commentId', PortalTaskController.editComment);
router.get('/tasks/attachment/:attachmentId', PortalTaskController.serveAttachment);

// ── Work Requests (client submits tasks to local team) ───
const ClientRequestController = require('../controllers/clientRequestController');
const reqAttachUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const handleReqUploadError = (err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'Attachment too large. Max 25 MB.' });
  if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
  next();
};

router.get('/requests', ClientRequestController.index);
router.get('/requests/instances', ClientRequestController.getInstances);
router.get('/requests/badge', ClientRequestController.getBadgeCount);
router.post('/requests', ClientRequestController.create);
router.put('/requests/:id', ClientRequestController.update);
router.patch('/requests/:id/deactivate', ClientRequestController.deactivate);
router.get('/requests/task-types', ClientRequestController.getTaskTypes);
router.post('/requests/:id/attachments', (req, res, next) => reqAttachUpload.single('file')(req, res, err => handleReqUploadError(err, req, res, next)), ClientRequestController.uploadAttachment);
router.get('/requests/instances/:id', ClientRequestController.getDetail);
router.patch('/requests/instances/:id/cancel', ClientRequestController.cancelInstance);
router.post('/requests/instances/:id/comments', ClientRequestController.addComment);

// ── Help & Training ──────────────────────────────────────
router.get('/help', (req, res) => {
  res.render('portal/help', {
    title: 'Help & Training - Client Portal',
    layout: 'portal/layout',
    section: 'help'
  });
});

// ── Notes ────────────────────────────────────────────────
const NoteModel = require('../../models/Note');
const { ApiResponse: NoteApiResponse } = require('../../utils/response');

router.get('/notes', (req, res) => {
  res.render('portal/notes', {
    title: 'Notes - Client Portal',
    layout: 'portal/layout',
    section: 'notes'
  });
});

router.get('/notes/list', async (req, res) => {
  try {
    const { search } = req.query;
    const { rows } = await NoteModel.getAll({ user_id: req.user.id, search, page: 1, limit: 100 });
    return NoteApiResponse.success(res, { notes: rows });
  } catch (err) {
    return NoteApiResponse.error(res, 'Failed to load notes');
  }
});

router.post('/notes', async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !title.trim()) return NoteApiResponse.error(res, 'Title is required', 400);
    const noteId = await NoteModel.create({ user_id: req.user.id, title: title.trim(), content: content?.trim() || null });
    const note = await NoteModel.findById(noteId);
    return NoteApiResponse.success(res, { note }, 'Note created', 201);
  } catch (err) {
    return NoteApiResponse.error(res, err.message, 400);
  }
});

router.put('/notes/:id', async (req, res) => {
  try {
    const note = await NoteModel.findById(req.params.id);
    if (!note || note.user_id !== req.user.id) return NoteApiResponse.error(res, 'Not found', 404);
    const { title, content } = req.body;
    if (!title || !title.trim()) return NoteApiResponse.error(res, 'Title is required', 400);
    await NoteModel.update(req.params.id, { title: title.trim(), content: content?.trim() || null });
    const updated = await NoteModel.findById(req.params.id);
    return NoteApiResponse.success(res, { note: updated }, 'Note saved');
  } catch (err) {
    return NoteApiResponse.error(res, err.message, 400);
  }
});

router.patch('/notes/:id/pin', async (req, res) => {
  try {
    const note = await NoteModel.findById(req.params.id);
    if (!note || note.user_id !== req.user.id) return NoteApiResponse.error(res, 'Not found', 404);
    await NoteModel.update(req.params.id, { is_pinned: note.is_pinned ? 0 : 1 });
    const updated = await NoteModel.findById(req.params.id);
    return NoteApiResponse.success(res, { note: updated }, note.is_pinned ? 'Unpinned' : 'Pinned');
  } catch (err) {
    return NoteApiResponse.error(res, err.message, 400);
  }
});

router.delete('/notes/:id', async (req, res) => {
  try {
    const note = await NoteModel.findById(req.params.id);
    if (!note || note.user_id !== req.user.id) return NoteApiResponse.error(res, 'Not found', 404);
    await NoteModel.delete(req.params.id);
    return NoteApiResponse.success(res, {}, 'Note deleted');
  } catch (err) {
    return NoteApiResponse.error(res, err.message, 400);
  }
});

// ── Team India (Live Status) ─────────────────────────────
router.get('/team-status', requireRoles('CLIENT_ADMIN', 'CLIENT_TOP_MGMT'), PortalTeamStatusController.index);
router.get('/team-status/data', requireRoles('CLIENT_ADMIN', 'CLIENT_TOP_MGMT'), PortalTeamStatusController.getData);
router.get('/team-status/employee-tasks/:userId', requireRoles('CLIENT_ADMIN', 'CLIENT_TOP_MGMT'), PortalTeamStatusController.getEmployeeTasks);

// ── Bridge Chat (Client <-> Local) ───────────────────────
const BridgeChatController = require('../../controllers/bridgeChatController');
router.get('/bridge/conversations', BridgeChatController.getMyConversationsForPortal);
router.post('/bridge/conversations', BridgeChatController.getOrCreateConversation);
router.get('/bridge/conversations/:id/messages', BridgeChatController.getMessages);
router.post('/bridge/conversations/:id/messages', BridgeChatController.sendMessage);
const bridgeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.post('/bridge/conversations/:id/file', (req, res, next) => bridgeUpload.single('file')(req, res, (err) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'Attachment too large. Max 10 MB.' });
  if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
  next();
}), BridgeChatController.sendFile);
router.post('/bridge/conversations/:id/read', BridgeChatController.markAsRead);
router.delete('/bridge/messages/:messageId', BridgeChatController.deleteMessage);
router.get('/bridge/attachment/:messageId', BridgeChatController.serveAttachment);
router.get('/bridge/unread-count', BridgeChatController.unreadCount);

// ── Urgent Chat (Client → Local team) ───────────────────
router.post('/urgent', requireRoles('CLIENT_ADMIN', 'CLIENT_TOP_MGMT', 'CLIENT_MGMT', 'CLIENT_MANAGER'), UrgentController.create);
router.get('/urgent/active', UrgentController.getActive);
router.get('/urgent/:id/messages', UrgentController.getMessages);
router.post('/urgent/:id/messages', UrgentController.sendMessage);
const urgentPortalUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.post('/urgent/:id/file', (req, res, next) => urgentPortalUpload.single('file')(req, res, (err) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'Attachment too large. Max 10 MB.' });
  if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
  next();
}), UrgentController.sendFile);
router.post('/urgent/:id/resolve', UrgentController.resolve);
router.post('/urgent/:id/buzz', requireRoles('CLIENT_ADMIN', 'CLIENT_TOP_MGMT', 'CLIENT_MGMT', 'CLIENT_MANAGER'), UrgentController.buzz);
router.get('/urgent/history', UrgentController.getHistory);
router.post('/urgent/:id/typing', UrgentController.typing);
router.post('/urgent/:id/stop-typing', UrgentController.stopTyping);
router.get('/urgent/attachment/:messageId', UrgentController.serveAttachment);

// ── Group Channel (cross-team group chat) ──────────────────
const GroupChannelController = require('../../controllers/groupChannelController');
const gcExcludeSales = requireRoles('CLIENT_ADMIN', 'CLIENT_TOP_MGMT', 'CLIENT_MGMT', 'CLIENT_MANAGER', 'CLIENT_USER');
const gcUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const handleGcUploadError = (err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'Attachment too large. Max 5 MB.' });
  if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
  next();
};
router.get('/channel', gcExcludeSales, (req, res) => {
  res.render('portal/channel', { title: 'Group Channel', layout: 'portal/layout', section: 'channel' });
});
router.get('/channel/users', gcExcludeSales, GroupChannelController.getUsers);
router.get('/channel/messages', gcExcludeSales, GroupChannelController.getMessages);
router.post('/channel/messages', gcExcludeSales, GroupChannelController.sendMessage);
router.post('/channel/file', gcExcludeSales, (req, res, next) => gcUpload.single('file')(req, res, (err) => handleGcUploadError(err, req, res, next)), GroupChannelController.sendFile);
router.put('/channel/messages/:messageId', gcExcludeSales, GroupChannelController.editMessage);
router.delete('/channel/messages/:messageId', gcExcludeSales, GroupChannelController.deleteMessage);
router.post('/channel/messages/:messageId/reactions', gcExcludeSales, GroupChannelController.toggleReaction);
router.post('/channel/messages/:messageId/pin', gcExcludeSales, GroupChannelController.togglePin);
router.get('/channel/pinned', gcExcludeSales, GroupChannelController.getPinned);
router.get('/channel/search', gcExcludeSales, GroupChannelController.search);
router.get('/channel/unfurl', gcExcludeSales, GroupChannelController.unfurl);
router.get('/channel/attachment/:messageId', gcExcludeSales, GroupChannelController.serveAttachment);

// ── Change Password (all portal users) ───────────────────
router.post('/change-password', (req, res) => {
  const UserModel = require('../../models/User');
  const { ApiResponse } = require('../../utils/response');

  const { new_password, confirm_password } = req.body;
  if (!new_password || !confirm_password) return ApiResponse.error(res, 'All fields are required', 400);
  if (new_password.length < 6) return ApiResponse.error(res, 'Password must be at least 6 characters', 400);
  if (new_password !== confirm_password) return ApiResponse.error(res, 'Passwords do not match', 400);

  UserModel.update(req.user.id, { password: new_password })
    .then(() => ApiResponse.success(res, {}, 'Password changed successfully'))
    .catch(err => ApiResponse.error(res, err.message, 400));
});

// ── Users Management (Admin only) ────────────────────────
router.get('/users', requireRoles('CLIENT_ADMIN'), PortalUserController.index);
router.get('/users/list', requireRoles('CLIENT_ADMIN'), PortalUserController.list);
router.post('/users', requireRoles('CLIENT_ADMIN'), PortalUserController.create);
router.put('/users/:id', requireRoles('CLIENT_ADMIN'), PortalUserController.update);
router.post('/users/:id/reset-password', requireRoles('CLIENT_ADMIN'), PortalUserController.resetPassword);
router.patch('/users/:id/toggle', requireRoles('CLIENT_ADMIN'), PortalUserController.toggleActive);

// ── Session Management (Auto-logout after shift) ─────────
// Only for LOCAL users, not for CLIENT users
router.get('/check-shift-end', (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  try {
    const user = req.user;
    
    // Only LOCAL users have shift-based logout
    if (!user.role_name.startsWith('LOCAL')) {
      return ApiResponse.error(res, 'This feature is not available for your user type', 403);
    }
    
    // Parse shift start time (format: "HH:MM:SS")
    const [hours, minutes] = user.shift_start.split(':').map(Number);
    const shiftHours = user.shift_hours || 8.5;
    
    // Calculate shift end time
    const now = new Date();
    const shiftStartDate = new Date(now);
    shiftStartDate.setHours(hours, minutes, 0);
    
    const shiftEndDate = new Date(shiftStartDate);
    shiftEndDate.setHours(shiftEndDate.getHours() + Math.floor(shiftHours));
    shiftEndDate.setMinutes(shiftEndDate.getMinutes() + Math.round((shiftHours % 1) * 60));
    
    // Check if shift has ended
    const shiftEnded = now > shiftEndDate;
    const timeUntilShiftEnd = Math.max(0, shiftEndDate - now);
    
    return ApiResponse.success(res, {
      shift_ended: shiftEnded,
      shift_start: user.shift_start,
      shift_hours: shiftHours,
      shift_end: shiftEndDate.toISOString(),
      time_until_shift_end: timeUntilShiftEnd,
      current_time: now.toISOString()
    });
  } catch (err) {
    console.error('check-shift-end error:', err);
    return ApiResponse.error(res, 'Error checking shift');
  }
});

router.post('/extend-session', (req, res) => {
  const { ApiResponse } = require('../../utils/response');
  try {
    const user = req.user;
    
    // Only LOCAL users can extend session
    if (!user.role_name.startsWith('LOCAL')) {
      return ApiResponse.error(res, 'This feature is not available for your user type', 403);
    }
    
    // In this implementation, we're just validating that the user is authenticated
    // and sending back success. The actual session extension is handled by:
    // 1. Express session middleware automatically extends on each request
    // 2. Client reschedules the warning for 2 more hours
    
    return ApiResponse.success(res, {
      extended_until: new Date(Date.now() + 7200000).toISOString() // 2 hours from now
    }, 'Session extended for 2 more hours');
  } catch (err) {
    console.error('extend-session error:', err);
    return ApiResponse.error(res, 'Error extending session');
  }
});

module.exports = router;
