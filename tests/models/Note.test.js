jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db        = require('../../config/db');
const NoteModel = require('../../models/Note');

// ── findById ──────────────────────────────────────────────────────────────────

describe('NoteModel.findById', () => {
  test('returns the note when found', async () => {
    const note = { id: 1, user_id: 5, title: 'My Note', content: 'Hello' };
    db.query.mockResolvedValue([[note]]);

    const result = await NoteModel.findById(1);

    expect(result).toEqual(note);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = ?'), [1]
    );
  });

  test('returns null when no row matches', async () => {
    db.query.mockResolvedValue([[]]); // empty

    const result = await NoteModel.findById(999);

    expect(result).toBeNull();
  });
});

// ── create ────────────────────────────────────────────────────────────────────

describe('NoteModel.create', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 77 }]);

    const id = await NoteModel.create({ user_id: 5, title: 'Title', content: 'Body' });

    expect(id).toBe(77);
  });

  test('passes user_id, title, and content as parameterised values', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await NoteModel.create({ user_id: 5, title: 'T', content: 'C' });

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([5, 'T', 'C']);
  });

  test('stores null for content when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await NoteModel.create({ user_id: 5, title: 'T' });

    const [, params] = db.query.mock.calls[0];
    expect(params[2]).toBeNull();
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('NoteModel.update', () => {
  test('returns false when no allowed fields are provided', async () => {
    const result = await NoteModel.update(1, { hacker_field: 'evil' });

    expect(result).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns false when data object is empty', async () => {
    const result = await NoteModel.update(1, {});

    expect(result).toBe(false);
  });

  test('builds SET clause only for allowed fields (title, content, is_pinned)', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await NoteModel.update(1, { title: 'New Title', hacker: 'evil' });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('title = ?');
    expect(sql).not.toContain('hacker');
  });

  test('can update is_pinned independently', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await NoteModel.update(1, { is_pinned: 1 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('is_pinned = ?');
    expect(params).toContain(1);
  });

  test('returns true when a row was updated', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await NoteModel.update(1, { title: 'Updated' });

    expect(result).toBe(true);
  });

  test('returns false when no rows were affected', async () => {
    db.query.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await NoteModel.update(999, { title: 'Ghost' });

    expect(result).toBe(false);
  });

  test('appends note id as the last WHERE param', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await NoteModel.update(42, { content: 'Updated body' });

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(42);
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe('NoteModel.delete', () => {
  test('returns true when the note is deleted', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await NoteModel.delete(1);

    expect(result).toBe(true);
  });

  test('returns false when no row was deleted', async () => {
    db.query.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await NoteModel.delete(999);

    expect(result).toBe(false);
  });

  test('issues a hard DELETE (not a soft-delete)', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await NoteModel.delete(1);

    const [sql] = db.query.mock.calls[0];
    expect(sql.trim().toUpperCase()).toMatch(/^DELETE/);
  });

  test('passes the note id as a parameterised value', async () => {
    db.query.mockResolvedValue([{ affectedRows: 1 }]);

    await NoteModel.delete(7);

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([7]);
  });
});

// ── getAll ────────────────────────────────────────────────────────────────────

describe('NoteModel.getAll', () => {
  function setupMock(rows = [], total = 0) {
    db.query
      .mockResolvedValueOnce([rows])
      .mockResolvedValueOnce([[{ total }]]);
  }

  test('returns rows and total count', async () => {
    setupMock([{ id: 1 }, { id: 2 }], 2);

    const result = await NoteModel.getAll();

    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  test('applies user_id filter when provided', async () => {
    setupMock();

    await NoteModel.getAll({ user_id: 5 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('user_id = ?');
    expect(params).toContain(5);
  });

  test('applies LIKE filter on both title and content when search is given', async () => {
    setupMock();

    await NoteModel.getAll({ search: 'hello' });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('title LIKE ?');
    expect(sql).toContain('content LIKE ?');
    expect(params).toContain('%hello%');
  });

  test('orders by is_pinned DESC then updated_at DESC', async () => {
    setupMock();

    await NoteModel.getAll();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY is_pinned DESC, updated_at DESC');
  });

  test('computes correct LIMIT and OFFSET for page 2 with limit 5', async () => {
    setupMock();

    await NoteModel.getAll({ page: 2, limit: 5 });

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 2]).toBe(5);  // LIMIT
    expect(params[params.length - 1]).toBe(5);  // OFFSET = (2-1)*5
  });

  test('defaults to page 1 limit 20', async () => {
    setupMock();

    await NoteModel.getAll();

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 2]).toBe(20); // LIMIT
    expect(params[params.length - 1]).toBe(0);  // OFFSET
  });
});
