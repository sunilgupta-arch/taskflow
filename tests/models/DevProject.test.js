jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db         = require('../../config/db');
const DevProject = require('../../models/DevProject');

// ── getAll ────────────────────────────────────────────────────────────────────

describe('DevProject.getAll', () => {
  test('returns all projects with computed progress', async () => {
    db.query.mockResolvedValue([[
      { id: 1, title: 'P1', task_count: 4, done_count: 2 },
      { id: 2, title: 'P2', task_count: 0, done_count: 0 },
    ]]);

    const result = await DevProject.getAll();

    expect(result[0].progress).toBe(50);
    expect(result[1].progress).toBe(0); // avoids division by zero
  });

  test('parses task_count and done_count as integers', async () => {
    db.query.mockResolvedValue([[{ id: 1, task_count: '3', done_count: '1' }]]);

    const result = await DevProject.getAll();

    expect(result[0].task_count).toBe(3);
    expect(result[0].done_count).toBe(1);
  });

  test('adds client_visible = 1 filter when clientVisibleOnly is true', async () => {
    db.query.mockResolvedValue([[]]);

    await DevProject.getAll({ clientVisibleOnly: true });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('dp.client_visible = 1');
  });

  test('adds developer_id filter when provided', async () => {
    db.query.mockResolvedValue([[]]);

    await DevProject.getAll({ developerId: 7 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('dp.developer_id = ?');
    expect(params).toContain(7);
  });

  test('returns all projects with no WHERE clause when no filters given', async () => {
    db.query.mockResolvedValue([[]]);

    await DevProject.getAll();

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toContain('WHERE');
    expect(params).toEqual([]);
  });
});

// ── getById ───────────────────────────────────────────────────────────────────

describe('DevProject.getById', () => {
  test('returns null when project is not found', async () => {
    db.query.mockResolvedValueOnce([[undefined]]);

    const result = await DevProject.getById(999);

    expect(result).toBeNull();
  });

  test('attaches tasks, milestones, and links to the project', async () => {
    const project = { id: 1, title: 'P' };
    db.query
      .mockResolvedValueOnce([[project]])                           // project
      .mockResolvedValueOnce([[{ id: 10, status: 'done' }, { id: 11, status: 'todo' }]]) // tasks
      .mockResolvedValueOnce([[{ id: 20 }]])                        // milestones
      .mockResolvedValueOnce([[{ id: 30 }]]);                       // links

    const result = await DevProject.getById(1);

    expect(result.tasks).toHaveLength(2);
    expect(result.milestones).toHaveLength(1);
    expect(result.links).toHaveLength(1);
  });

  test('computes progress from tasks array', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 1 }]])                                           // project
      .mockResolvedValueOnce([[{ status: 'done' }, { status: 'todo' }, { status: 'done' }]]) // 2/3 done
      .mockResolvedValueOnce([[]])                                                     // milestones
      .mockResolvedValueOnce([[]]); 	                                                 // links

    const result = await DevProject.getById(1);

    expect(result.progress).toBe(67); // Math.round((2/3)*100)
  });

  test('sets progress to 0 when there are no tasks', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([[]])  // no tasks
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const result = await DevProject.getById(1);

    expect(result.progress).toBe(0);
  });
});

// ── create ────────────────────────────────────────────────────────────────────

describe('DevProject.create', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 42 }]);

    const id = await DevProject.create({ title: 'API', developer_id: 5 });

    expect(id).toBe(42);
  });

  test('defaults status to "planning" when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await DevProject.create({ title: 'API', developer_id: 5 });

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBe('planning');
  });

  test('coerces client_visible to 1 when truthy', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await DevProject.create({ title: 'API', developer_id: 5, client_visible: true });

    const [, params] = db.query.mock.calls[0];
    expect(params[4]).toBe(1);
  });

  test('coerces client_visible to 0 when falsy', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await DevProject.create({ title: 'API', developer_id: 5, client_visible: false });

    const [, params] = db.query.mock.calls[0];
    expect(params[4]).toBe(0);
  });

  test('defaults description and tech_stack to null', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await DevProject.create({ title: 'API', developer_id: 5 });

    const [, params] = db.query.mock.calls[0];
    expect(params[1]).toBeNull(); // description
    expect(params[2]).toBeNull(); // tech_stack
  });
});

// ── ownedBy ───────────────────────────────────────────────────────────────────

describe('DevProject.ownedBy', () => {
  test('returns true when developer_id matches userId', async () => {
    db.query.mockResolvedValue([[{ developer_id: 5 }]]);

    const result = await DevProject.ownedBy(1, 5);

    expect(result).toBe(true);
  });

  test('returns false when developer_id does not match', async () => {
    db.query.mockResolvedValue([[{ developer_id: 99 }]]);

    const result = await DevProject.ownedBy(1, 5);

    expect(result).toBe(false);
  });

  test('returns false when project is not found', async () => {
    db.query.mockResolvedValue([[undefined]]);

    const result = await DevProject.ownedBy(999, 5);

    expect(result).toBeFalsy();
  });
});

// ── addTask ───────────────────────────────────────────────────────────────────

describe('DevProject.addTask', () => {
  test('returns the insertId', async () => {
    db.query
      .mockResolvedValueOnce([[{ maxOrder: 3 }]])  // MAX sort_order
      .mockResolvedValueOnce([{ insertId: 55 }]);   // INSERT

    const id = await DevProject.addTask(1, { title: 'New task' });

    expect(id).toBe(55);
  });

  test('sets sort_order to maxOrder + 1', async () => {
    db.query
      .mockResolvedValueOnce([[{ maxOrder: 5 }]])
      .mockResolvedValueOnce([{ insertId: 1 }]);

    await DevProject.addTask(1, { title: 'Task' });

    const [, params] = db.query.mock.calls[1];
    expect(params[params.length - 1]).toBe(6); // sort_order = 5 + 1
  });

  test('defaults priority to "medium"', async () => {
    db.query
      .mockResolvedValueOnce([[{ maxOrder: 0 }]])
      .mockResolvedValueOnce([{ insertId: 1 }]);

    await DevProject.addTask(1, { title: 'Task' });

    const [, params] = db.query.mock.calls[1];
    expect(params[2]).toBe('medium'); // priority
  });

  test('inserts with status "todo"', async () => {
    db.query
      .mockResolvedValueOnce([[{ maxOrder: 0 }]])
      .mockResolvedValueOnce([{ insertId: 1 }]);

    await DevProject.addTask(1, { title: 'Task' });

    const [sql] = db.query.mock.calls[1];
    expect(sql).toContain("'todo'");
  });

  test('defaults due_date and milestone_id to null', async () => {
    db.query
      .mockResolvedValueOnce([[{ maxOrder: 0 }]])
      .mockResolvedValueOnce([{ insertId: 1 }]);

    await DevProject.addTask(1, { title: 'Task' });

    const [, params] = db.query.mock.calls[1];
    expect(params[3]).toBeNull(); // due_date
    expect(params[4]).toBeNull(); // milestone_id
  });
});

// ── updateTask ────────────────────────────────────────────────────────────────

describe('DevProject.updateTask', () => {
  test('returns undefined (no-op) when no fields are provided', async () => {
    const result = await DevProject.updateTask(1, {});

    expect(result).toBeUndefined();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('updates only the provided fields', async () => {
    db.query
      .mockResolvedValueOnce([{}])  // UPDATE task
      .mockResolvedValueOnce([{}]); // UPDATE project updated_at

    await DevProject.updateTask(1, { status: 'done' });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('status = ?');
    expect(sql).not.toContain('title = ?');
  });

  test('also updates the parent project updated_at', async () => {
    db.query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}]);

    await DevProject.updateTask(1, { title: 'New' });

    expect(db.query).toHaveBeenCalledTimes(2);
    const [projectSql] = db.query.mock.calls[1];
    expect(projectSql).toContain('updated_at = NOW()');
  });
});

// ── addMilestone ──────────────────────────────────────────────────────────────

describe('DevProject.addMilestone', () => {
  test('sets sort_order to maxOrder + 1', async () => {
    db.query
      .mockResolvedValueOnce([[{ maxOrder: 2 }]])
      .mockResolvedValueOnce([{ insertId: 1 }]);

    await DevProject.addMilestone(1, { title: 'v1.0', due_date: '2024-12-31' });

    const [, params] = db.query.mock.calls[1];
    expect(params[3]).toBe(3); // sort_order
  });
});

// ── updateMilestone ───────────────────────────────────────────────────────────

describe('DevProject.updateMilestone', () => {
  test('returns undefined (no-op) when no fields are provided', async () => {
    const result = await DevProject.updateMilestone(1, {});

    expect(result).toBeUndefined();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('updates only provided fields', async () => {
    db.query.mockResolvedValue([{}]);

    await DevProject.updateMilestone(1, { status: 'done' });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('status = ?');
    expect(sql).not.toContain('title = ?');
  });
});

// ── addLink / deleteLink ──────────────────────────────────────────────────────

describe('DevProject.addLink', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 10 }]);

    const id = await DevProject.addLink(1, { label: 'Repo', url: 'https://github.com/...' });

    expect(id).toBe(10);
  });
});

describe('DevProject.deleteLink', () => {
  test('issues a DELETE by id', async () => {
    db.query.mockResolvedValue([{}]);

    await DevProject.deleteLink(5);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql.trim().toUpperCase()).toMatch(/^DELETE/);
    expect(params).toEqual([5]);
  });
});

// ── addRelease ────────────────────────────────────────────────────────────────

describe('DevProject.addRelease', () => {
  test('defaults environment to "staging" when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await DevProject.addRelease(1, { version: '1.0.0', released_by: 5 });

    const [, params] = db.query.mock.calls[0];
    expect(params[2]).toBe('staging');
  });

  test('uses provided environment', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await DevProject.addRelease(1, { version: '1.0.0', environment: 'production', released_by: 5 });

    const [, params] = db.query.mock.calls[0];
    expect(params[2]).toBe('production');
  });

  test('defaults notes to null', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await DevProject.addRelease(1, { version: '1.0.0', released_by: 5 });

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBeNull();
  });
});

// ── getNotes ──────────────────────────────────────────────────────────────────

describe('DevProject.getNotes', () => {
  test('returns notes created by the user when createdBy is provided', async () => {
    const rows = [{ id: 1, title: 'My Note' }];
    db.query.mockResolvedValue([rows]);

    const result = await DevProject.getNotes({ createdBy: 5 });

    expect(result).toEqual(rows);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('n.created_by = ?');
    expect(params).toContain(5);
  });

  test('returns notes shared with the user when sharedWith is provided', async () => {
    db.query.mockResolvedValue([[]]);

    await DevProject.getNotes({ sharedWith: 7 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('ns.developer_id = ?');
    expect(params[0]).toBe(7);
  });

  test('returns empty array when neither createdBy nor sharedWith is provided', async () => {
    const result = await DevProject.getNotes();

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── getNoteById ───────────────────────────────────────────────────────────────

describe('DevProject.getNoteById', () => {
  test('returns null when note is not found', async () => {
    db.query.mockResolvedValueOnce([[undefined]]);

    const result = await DevProject.getNoteById(999);

    expect(result).toBeNull();
  });

  test('attaches shares array to the note', async () => {
    const note = { id: 1, title: 'Note' };
    const shares = [{ developer_id: 5, developer_name: 'Alice' }];
    db.query
      .mockResolvedValueOnce([[note]])
      .mockResolvedValueOnce([shares]);

    const result = await DevProject.getNoteById(1);

    expect(result.shares).toEqual(shares);
  });
});

// ── setNoteShares ─────────────────────────────────────────────────────────────

describe('DevProject.setNoteShares', () => {
  test('always deletes existing shares first', async () => {
    db.query.mockResolvedValue([{}]);

    await DevProject.setNoteShares(5, []);

    const [deleteSql] = db.query.mock.calls[0];
    expect(deleteSql).toContain('DELETE FROM dev_note_shares');
  });

  test('skips the INSERT when developerIds is empty', async () => {
    db.query.mockResolvedValue([{}]);

    await DevProject.setNoteShares(5, []);

    expect(db.query).toHaveBeenCalledTimes(1); // only the DELETE
  });

  test('inserts note-developer pairs when developerIds are provided', async () => {
    db.query
      .mockResolvedValueOnce([{}])  // DELETE
      .mockResolvedValueOnce([{}]); // INSERT

    await DevProject.setNoteShares(5, [10, 20]);

    const [, insertParams] = db.query.mock.calls[1];
    expect(insertParams[0]).toEqual([[5, 10], [5, 20]]);
  });
});

// ── getDevelopers ─────────────────────────────────────────────────────────────

describe('DevProject.getDevelopers', () => {
  test('returns only active developers', async () => {
    const rows = [{ id: 1, name: 'Alice' }];
    db.query.mockResolvedValue([rows]);

    const result = await DevProject.getDevelopers();

    expect(result).toEqual(rows);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('is_developer = 1');
    expect(sql).toContain('is_active = 1');
  });
});
