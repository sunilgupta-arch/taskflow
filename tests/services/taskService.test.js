jest.mock('../../config/db', () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
  escape: jest.fn(v => `'${String(v)}'`),
}));
jest.mock('../../models/Task', () => ({
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
}));
jest.mock('../../models/TaskCompletion', () => ({
  startSession: jest.fn(),
  endSession: jest.fn(),
}));
jest.mock('../../models/Reward', () => ({}));
jest.mock('../../models/Chat', () => ({
  sendSystemMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../utils/timezone', () => ({
  getToday: jest.fn().mockReturnValue('2024-06-10'),
  getEffectiveWorkDate: jest.fn().mockReturnValue('2024-06-10'),
  getEffectiveWorkDateWithSession: jest.fn().mockResolvedValue('2024-06-10'),
}));

const db        = require('../../config/db');
const TaskModel = require('../../models/Task');
const TaskService = require('../../services/taskService');

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const LOCAL_ADMIN = { id: 10, role_name: 'LOCAL_ADMIN', organization_type: 'LOCAL' };
const LOCAL_USER  = { id: 20, role_name: 'LOCAL_USER',  organization_type: 'LOCAL' };
const CLIENT_ADMIN = { id: 30, role_name: 'CLIENT_ADMIN', organization_type: 'CLIENT' };

const BASE_ONCE_TASK = {
  id: 1, title: 'Test Task', description: '', type: 'once',
  status: 'pending', assigned_to: null, reward_amount: null,
  recurrence_pattern: null, recurrence_days: null,
  group_id: null, is_deleted: 0,
};

const BASE_RECURRING_TASK = {
  ...BASE_ONCE_TASK,
  id: 2, type: 'recurring', status: 'active',
};

// Reusable mock connection for transaction-based methods
function makeConn(queryResults = []) {
  const conn = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
  };
  queryResults.forEach(r => conn.query.mockResolvedValueOnce(r));
  return conn;
}

// ─── createTask ───────────────────────────────────────────────────────────────

describe('TaskService.createTask', () => {
  const baseData = { title: 'New Task', type: 'once', assigned_to: [] };

  test('throws when organization type is not LOCAL or CLIENT', async () => {
    const badCreator = { ...LOCAL_ADMIN, organization_type: 'PARTNER' };
    await expect(TaskService.createTask(baseData, badCreator))
      .rejects.toThrow('Not authorized to create tasks');
  });

  test('LOCAL_USER: self-assigns to creator id and strips reward_amount', async () => {
    TaskModel.create.mockResolvedValue(99);
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, id: 99, assigned_to: 20 });

    const data = { ...baseData, reward_amount: 50 };
    const result = await TaskService.createTask(data, LOCAL_USER);

    // create should have been called with the creator's id and no reward
    const [createArg] = TaskModel.create.mock.calls[0];
    expect(createArg.assigned_to).toBe(LOCAL_USER.id);
    expect(createArg.reward_amount).toBeNull();
    expect(result.id).toBe(99);
  });

  test('LOCAL_USER: sets status to pending for once task', async () => {
    TaskModel.create.mockResolvedValue(5);
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, id: 5 });

    await TaskService.createTask({ ...baseData, type: 'once' }, LOCAL_USER);

    const [createArg] = TaskModel.create.mock.calls[0];
    expect(createArg.status).toBe('pending');
  });

  test('LOCAL_USER: sets status to active for recurring task', async () => {
    TaskModel.create.mockResolvedValue(6);
    TaskModel.findById.mockResolvedValue({ ...BASE_RECURRING_TASK, id: 6 });

    await TaskService.createTask({ ...baseData, type: 'recurring' }, LOCAL_USER);

    const [createArg] = TaskModel.create.mock.calls[0];
    expect(createArg.status).toBe('active');
  });

  test('LOCAL_ADMIN: client_visible=true sets created_by_org to CLIENT', async () => {
    TaskModel.create.mockResolvedValue(7);
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, id: 7 });
    // single-assignee path calls getUserFullName + getUserName before returning
    db.query
      .mockResolvedValueOnce([[{ name: 'Admin User' }]])
      .mockResolvedValueOnce([[{ name: 'Alice' }]]);

    const data = { ...baseData, assigned_to: [5], client_visible: true };
    await TaskService.createTask(data, LOCAL_ADMIN);

    const [createArg] = TaskModel.create.mock.calls[0];
    expect(createArg.created_by_org).toBe('CLIENT');
  });

  test('throws when multi-assign is combined with secondary_assignee', async () => {
    const data = {
      ...baseData,
      assigned_to: [1, 2],
      secondary_assignee: 3,
    };
    await expect(TaskService.createTask(data, LOCAL_ADMIN))
      .rejects.toThrow('Cannot use both multi-assign and fallback assignees');
  });

  test('throws when multi-assign is combined with tertiary_assignee', async () => {
    const data = {
      ...baseData,
      assigned_to: [1, 2],
      tertiary_assignee: 4,
    };
    await expect(TaskService.createTask(data, LOCAL_ADMIN))
      .rejects.toThrow('Cannot use both multi-assign and fallback assignees');
  });

  test('multi-assign: creates one task per assignee linked by group_id', async () => {
    TaskModel.create
      .mockResolvedValueOnce(10) // first assignee → taskId 10
      .mockResolvedValueOnce(11); // second assignee → taskId 11
    TaskModel.update.mockResolvedValue(true);
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, id: 10, group_id: 10 });

    // getUserFullName and getUserName each call db.query
    db.query
      .mockResolvedValueOnce([[{ name: 'Admin User' }]]) // creator name
      .mockResolvedValueOnce([[{ name: 'Alice Smith' }]]) // assignee 1
      .mockResolvedValueOnce([[{ name: 'Bob Jones' }]]);  // assignee 2

    const data = { ...baseData, assigned_to: [5, 6], type: 'once' };
    const result = await TaskService.createTask(data, LOCAL_ADMIN);

    expect(TaskModel.create).toHaveBeenCalledTimes(2);
    // group_id set to firstTaskId
    expect(TaskModel.update).toHaveBeenCalledWith(10, { group_id: 10 });
    expect(result.id).toBe(10);
  });

  test('single assignee: creates one task and notifies', async () => {
    TaskModel.create.mockResolvedValue(20);
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, id: 20, assigned_to: 5 });
    db.query
      .mockResolvedValueOnce([[{ name: 'Admin User' }]]) // getUserFullName
      .mockResolvedValueOnce([[{ name: 'Alice' }]]);      // getUserName for assignee

    const data = { ...baseData, assigned_to: [5], type: 'once' };
    await TaskService.createTask(data, LOCAL_ADMIN);

    expect(TaskModel.create).toHaveBeenCalledTimes(1);
    const [createArg] = TaskModel.create.mock.calls[0];
    expect(createArg.assigned_to).toBe(5);
  });
});

// ─── pickTask ─────────────────────────────────────────────────────────────────

describe('TaskService.pickTask', () => {
  test('throws when task is not found', async () => {
    TaskModel.findById.mockResolvedValue(null);
    await expect(TaskService.pickTask(1, LOCAL_USER))
      .rejects.toThrow('Task not found');
  });

  test('throws when task is already assigned to someone', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, assigned_to: 99 });
    await expect(TaskService.pickTask(1, LOCAL_USER))
      .rejects.toThrow('Task is already assigned');
  });

  test('throws when task status is not pending', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, status: 'in_progress' });
    await expect(TaskService.pickTask(1, LOCAL_USER))
      .rejects.toThrow('Task is not available for picking');
  });

  test('throws when user is not LOCAL org', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK });
    await expect(TaskService.pickTask(1, CLIENT_ADMIN))
      .rejects.toThrow('Only LOCAL team can pick tasks');
  });

  test('calls TaskModel.update with correct args on success', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK });
    TaskModel.update.mockResolvedValue(true);

    await TaskService.pickTask(1, LOCAL_USER);

    expect(TaskModel.update).toHaveBeenCalledWith(1, {
      assigned_to: LOCAL_USER.id,
      status: 'in_progress',
    });
  });
});

// ─── startTask ────────────────────────────────────────────────────────────────

describe('TaskService.startTask', () => {
  test('throws when task is not found', async () => {
    TaskModel.findById.mockResolvedValue(null);
    await expect(TaskService.startTask(1, 20))
      .rejects.toThrow('Task not found');
  });

  test('throws when task is assigned to a different user', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, assigned_to: 99 });
    await expect(TaskService.startTask(1, 20))
      .rejects.toThrow('You can only start tasks assigned to you');
  });

  test('throws for an active recurring task (use log completion instead)', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_RECURRING_TASK, assigned_to: 20 });
    await expect(TaskService.startTask(2, 20))
      .rejects.toThrow('Recurring tasks do not need to be started');
  });

  test('throws when task status is not pending', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, assigned_to: 20, status: 'in_progress' });
    await expect(TaskService.startTask(1, 20))
      .rejects.toThrow('Only pending tasks can be started');
  });

  test('calls TaskModel.update with status in_progress on success', async () => {
    TaskModel.findById
      .mockResolvedValueOnce({ ...BASE_ONCE_TASK, assigned_to: 20, status: 'pending' })
      .mockResolvedValueOnce({ ...BASE_ONCE_TASK, assigned_to: 20, status: 'in_progress' });
    TaskModel.update.mockResolvedValue(true);

    await TaskService.startTask(1, 20);

    expect(TaskModel.update).toHaveBeenCalledWith(1, { status: 'in_progress' });
  });
});

// ─── assignTask ───────────────────────────────────────────────────────────────

describe('TaskService.assignTask', () => {
  test('throws when task is not found', async () => {
    TaskModel.findById.mockResolvedValue(null);
    await expect(TaskService.assignTask(1, 5, 'LOCAL_ADMIN'))
      .rejects.toThrow('Task not found');
  });

  test('throws for an unauthorized assigner role', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK });
    await expect(TaskService.assignTask(1, 5, 'LOCAL_USER'))
      .rejects.toThrow('Not authorized to assign tasks');
  });

  test('throws when LOCAL admin tries to reassign to a non-LOCAL user', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK });
    db.query.mockResolvedValue([[]]); // empty = not LOCAL

    await expect(TaskService.assignTask(1, 5, 'LOCAL_ADMIN'))
      .rejects.toThrow('Can only reassign to LOCAL team members');
  });

  test('succeeds for LOCAL_ADMIN assigning to LOCAL user', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, title: 'My Task' });
    db.query
      .mockResolvedValueOnce([[{ id: 5 }]])            // user is LOCAL
      .mockResolvedValueOnce([[{ name: 'Alice' }]]);   // getUserName for notification

    TaskModel.update.mockResolvedValue(true);

    const result = await TaskService.assignTask(1, 5, 'LOCAL_ADMIN');
    expect(TaskModel.update).toHaveBeenCalledWith(1, { assigned_to: 5, status: 'in_progress' });
    expect(result).toBe(true);
  });

  test('CLIENT_ADMIN can assign without LOCAL org check', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, title: 'Client Task' });
    db.query.mockResolvedValueOnce([[{ name: 'Bob' }]]); // getUserName
    TaskModel.update.mockResolvedValue(true);

    const result = await TaskService.assignTask(1, 5, 'CLIENT_ADMIN');
    expect(result).toBe(true);
  });
});

// ─── deleteTask ───────────────────────────────────────────────────────────────

describe('TaskService.deleteTask', () => {
  test('throws when task is not found', async () => {
    TaskModel.findById.mockResolvedValue(null);
    await expect(TaskService.deleteTask(1))
      .rejects.toThrow('Task not found');
  });

  test('throws when task is not in deactivated status', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, status: 'completed' });
    await expect(TaskService.deleteTask(1))
      .rejects.toThrow('Task must be deactivated before deletion');
  });

  test('soft-deletes a standalone deactivated task', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, status: 'deactivated', group_id: null });
    TaskModel.softDelete.mockResolvedValue(true);

    await TaskService.deleteTask(1);

    expect(TaskModel.softDelete).toHaveBeenCalledWith(1);
  });

  test('bulk-deletes all tasks in a group', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, id: 1, status: 'deactivated', group_id: 1 });
    db.query.mockResolvedValue([{ affectedRows: 3 }]);

    await TaskService.deleteTask(1);

    // Should call db.query to bulk-update all group members
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('is_deleted = 1'),
      expect.arrayContaining([1])
    );
  });
});

// ─── logCompletion ────────────────────────────────────────────────────────────

describe('TaskService.logCompletion', () => {
  test('throws when task is not found', async () => {
    TaskModel.findById.mockResolvedValue(null);
    await expect(TaskService.logCompletion(1, 20))
      .rejects.toThrow('Task not found');
  });

  test('throws when task belongs to a different user', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_RECURRING_TASK, assigned_to: 99 });
    await expect(TaskService.logCompletion(2, 20))
      .rejects.toThrow('You can only log completion for tasks assigned to you');
  });

  test('throws when task is not recurring', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_ONCE_TASK, assigned_to: 20 });
    await expect(TaskService.logCompletion(1, 20))
      .rejects.toThrow('Only recurring tasks can be logged');
  });

  test('throws when recurring task is not active', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_RECURRING_TASK, assigned_to: 20, status: 'deactivated' });
    await expect(TaskService.logCompletion(2, 20))
      .rejects.toThrow('Task is not active');
  });

  test('throws when already completed for that date', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_RECURRING_TASK, assigned_to: 20 });

    // getUserWorkDate → db.query for shift info
    db.query.mockResolvedValueOnce([[{ shift_start: '09:00', shift_hours: 8 }]]);

    const conn = makeConn([
      [[{ id: 5 }], []],  // existing completion found → should throw
    ]);
    db.getConnection.mockResolvedValue(conn);

    await expect(TaskService.logCompletion(2, 20))
      .rejects.toThrow('Already completed for this date');

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('inserts completion and returns task on success', async () => {
    const task = { ...BASE_RECURRING_TASK, assigned_to: 20, reward_amount: null };
    TaskModel.findById.mockResolvedValue(task);

    // getUserWorkDate → shift query
    db.query.mockResolvedValueOnce([[{ shift_start: '09:00', shift_hours: 8 }]]);

    const conn = makeConn([
      [[], []],                    // no existing completion
      [{ affectedRows: 1 }, []],   // INSERT task_completions
    ]);
    db.getConnection.mockResolvedValue(conn);

    const result = await TaskService.logCompletion(2, 20, '2024-06-10');

    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(result).toBe(task);
  });
});

// ─── undoCompletion ───────────────────────────────────────────────────────────

describe('TaskService.undoCompletion', () => {
  test('throws when task is not found', async () => {
    TaskModel.findById.mockResolvedValue(null);
    await expect(TaskService.undoCompletion(1, 20))
      .rejects.toThrow('Task not found');
  });

  test('throws when task belongs to a different user', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_RECURRING_TASK, assigned_to: 99 });
    await expect(TaskService.undoCompletion(2, 20))
      .rejects.toThrow('You can only undo completion for tasks assigned to you');
  });

  test('throws when no completion record exists for that date', async () => {
    TaskModel.findById.mockResolvedValue({ ...BASE_RECURRING_TASK, assigned_to: 20 });

    db.query.mockResolvedValueOnce([[{ shift_start: '09:00', shift_hours: 8 }]]);

    const conn = makeConn([
      [{ affectedRows: 0 }, []],  // DELETE → nothing deleted
    ]);
    db.getConnection.mockResolvedValue(conn);

    await expect(TaskService.undoCompletion(2, 20))
      .rejects.toThrow('No completion found for this date');
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('deletes completion and returns task on success', async () => {
    const task = { ...BASE_RECURRING_TASK, assigned_to: 20, reward_amount: null };
    TaskModel.findById.mockResolvedValue(task);

    db.query.mockResolvedValueOnce([[{ shift_start: '09:00', shift_hours: 8 }]]);

    const conn = makeConn([
      [{ affectedRows: 1 }, []],  // DELETE succeeded
    ]);
    db.getConnection.mockResolvedValue(conn);

    const result = await TaskService.undoCompletion(2, 20, '2024-06-10');

    expect(conn.commit).toHaveBeenCalled();
    expect(result).toBe(task);
  });
});
