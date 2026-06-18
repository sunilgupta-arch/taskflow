jest.mock('../../config/db', () => ({ query: jest.fn() }));
jest.mock('../../services/taskService', () => ({
  getTaskStats:          jest.fn(),
  getCompletionPerUser:  jest.fn(),
}));
jest.mock('../../models/Reward', () => ({
  getGlobalSummary:  jest.fn(),
  getPerUserSummary: jest.fn(),
  getUserSummary:    jest.fn(),
}));
jest.mock('../../utils/timezone', () => ({
  getToday:     jest.fn().mockReturnValue('2024-06-10'),
  getDayOfWeek: jest.fn().mockReturnValue('Monday'),
}));

const db               = require('../../config/db');
const TaskService      = require('../../services/taskService');
const RewardModel      = require('../../models/Reward');
const { getToday, getDayOfWeek } = require('../../utils/timezone');
const DashboardService = require('../../services/dashboardService');

// ── getAdminDashboard ─────────────────────────────────────────────────────────

describe('DashboardService.getAdminDashboard', () => {
  beforeEach(() => {
    TaskService.getTaskStats.mockResolvedValue({ total: 10 });
    TaskService.getCompletionPerUser.mockResolvedValue([]);
    RewardModel.getGlobalSummary.mockResolvedValue({ total: 500 });
    RewardModel.getPerUserSummary.mockResolvedValue([]);
    db.query.mockResolvedValue([[{ total_users: 5, logged_in_today: 3, on_leave: 1, on_weekoff: 0 }]]);
  });

  test('returns an object with all five keys', async () => {
    const result = await DashboardService.getAdminDashboard();

    expect(result).toHaveProperty('taskStats');
    expect(result).toHaveProperty('rewardSummary');
    expect(result).toHaveProperty('attendanceSummary');
    expect(result).toHaveProperty('perUserStats');
    expect(result).toHaveProperty('perUserRewards');
  });

  test('calls TaskService.getTaskStats with null userId and the orgType', async () => {
    await DashboardService.getAdminDashboard('LOCAL');

    expect(TaskService.getTaskStats).toHaveBeenCalledWith(null, 'LOCAL', '2024-06-10');
  });

  test('calls TaskService.getCompletionPerUser with orgType', async () => {
    await DashboardService.getAdminDashboard('LOCAL');

    expect(TaskService.getCompletionPerUser).toHaveBeenCalledWith('LOCAL');
  });

  test('calls RewardModel.getGlobalSummary and getPerUserSummary', async () => {
    await DashboardService.getAdminDashboard();

    expect(RewardModel.getGlobalSummary).toHaveBeenCalled();
    expect(RewardModel.getPerUserSummary).toHaveBeenCalled();
  });

  test('uses getToday with the timezone argument', async () => {
    await DashboardService.getAdminDashboard(null, 'America/Chicago');

    expect(getToday).toHaveBeenCalledWith('America/Chicago');
  });
});

// ── getUserDashboard ──────────────────────────────────────────────────────────

describe('DashboardService.getUserDashboard', () => {
  beforeEach(() => {
    TaskService.getTaskStats.mockResolvedValue({ total: 5 });
    RewardModel.getUserSummary.mockResolvedValue({ pending_amount: 0 });
    db.query.mockResolvedValue([[]]);  // getTasksForDate
  });

  test('returns the expected shape', async () => {
    const result = await DashboardService.getUserDashboard(5);

    expect(result).toHaveProperty('taskStats');
    expect(result).toHaveProperty('rewardSummary');
    expect(result).toHaveProperty('dayTasks');
    expect(result).toHaveProperty('selectedDate');
    expect(result).toHaveProperty('isToday');
    expect(result).toHaveProperty('isFuture');
    expect(result).toHaveProperty('isPast');
  });

  test('isToday is true when viewDate equals today', async () => {
    const result = await DashboardService.getUserDashboard(5, '2024-06-10');

    expect(result.isToday).toBe(true);
    expect(result.isFuture).toBe(false);
    expect(result.isPast).toBe(false);
  });

  test('isFuture is true when viewDate is after today', async () => {
    const result = await DashboardService.getUserDashboard(5, '2024-07-01');

    expect(result.isFuture).toBe(true);
    expect(result.isToday).toBe(false);
    expect(result.isPast).toBe(false);
  });

  test('isPast is true when viewDate is before today', async () => {
    const result = await DashboardService.getUserDashboard(5, '2024-05-01');

    expect(result.isPast).toBe(true);
    expect(result.isToday).toBe(false);
    expect(result.isFuture).toBe(false);
  });

  test('uses workDate as "today" when provided', async () => {
    // workDate overrides getToday()
    const result = await DashboardService.getUserDashboard(5, '2024-08-01', 'America/New_York', '2024-08-01');

    expect(result.isToday).toBe(true);
  });

  test('calls RewardModel.getUserSummary with userId', async () => {
    await DashboardService.getUserDashboard(7);

    expect(RewardModel.getUserSummary).toHaveBeenCalledWith(7);
  });

  test('returns selectedDate equal to today when no viewDate given', async () => {
    const result = await DashboardService.getUserDashboard(5);

    expect(result.selectedDate).toBe('2024-06-10'); // mocked getToday
  });
});

// ── getTasksForDate ───────────────────────────────────────────────────────────

describe('DashboardService.getTasksForDate', () => {
  test('returns the task rows from the DB', async () => {
    const rows = [{ id: 1, title: 'Deploy', type: 'once' }];
    db.query.mockResolvedValue([rows]);

    const result = await DashboardService.getTasksForDate(5, '2024-06-10', '2024-06-10');

    expect(result).toEqual(rows);
  });

  test('passes userId and date as parameterised values', async () => {
    db.query.mockResolvedValue([[]]);

    await DashboardService.getTasksForDate(7, '2024-06-10', '2024-06-10');

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(7);  // userId for is_completed_for_date subquery
    expect(params[1]).toBe('2024-06-10');
  });

  test('filters by is_deleted = 0', async () => {
    db.query.mockResolvedValue([[]]);

    await DashboardService.getTasksForDate(5, '2024-06-10', '2024-06-10');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('is_deleted = 0');
  });

  test('orders by priority then created_at DESC', async () => {
    db.query.mockResolvedValue([[]]);

    await DashboardService.getTasksForDate(5, '2024-06-10', '2024-06-10');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("FIELD(t.priority, 'urgent'");
    expect(sql).toContain('t.created_at DESC');
  });
});

// ── getAttendanceSummary ──────────────────────────────────────────────────────

describe('DashboardService.getAttendanceSummary', () => {
  test('returns the attendance summary object', async () => {
    const summary = { total_users: 10, logged_in_today: 7, on_leave: 1, on_weekoff: 2 };
    db.query.mockResolvedValue([[summary]]);

    const result = await DashboardService.getAttendanceSummary();

    expect(result).toEqual(summary);
  });

  test('passes today and dayOfWeek from timezone utils', async () => {
    db.query.mockResolvedValue([[{}]]);

    await DashboardService.getAttendanceSummary();

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe('2024-06-10'); // today from mock
    expect(params[1]).toBe('Monday');      // dayOfWeek from mock
  });

  test('calls getToday and getDayOfWeek with the timezone argument', async () => {
    db.query.mockResolvedValue([[{}]]);

    await DashboardService.getAttendanceSummary('Asia/Kolkata');

    expect(getToday).toHaveBeenCalledWith('Asia/Kolkata');
    expect(getDayOfWeek).toHaveBeenCalledWith('Asia/Kolkata');
  });
});
