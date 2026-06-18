jest.mock('../../config/db', () => ({ query: jest.fn() }));
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  unlinkSync:  jest.fn(),
}));

const db         = require('../../config/db');
const fs         = require('fs');
const DevThought = require('../../models/DevThought');

// ── create ────────────────────────────────────────────────────────────────────

describe('DevThought.create', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 42 }]);

    const id = await DevThought.create({ author_id: 1, title: 'Idea', body: 'Details' });

    expect(id).toBe(42);
  });

  test('inserts author_id, title, body in correct order', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await DevThought.create({ author_id: 5, title: 'T', body: 'B' });

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([5, 'T', 'B']);
  });
});

// ── addFile ───────────────────────────────────────────────────────────────────

describe('DevThought.addFile', () => {
  test('inserts all six fields', async () => {
    db.query.mockResolvedValue([{}]);

    await DevThought.addFile(3, {
      file_name:   'pic.png',
      file_path:   'thoughts/pic.png',
      file_mime:   'image/png',
      file_size:   2048,
      uploaded_by: 7,
    });

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([3, 'pic.png', 'thoughts/pic.png', 'image/png', 2048, 7]);
  });
});

// ── list ──────────────────────────────────────────────────────────────────────

describe('DevThought.list', () => {
  test('returns all rows', async () => {
    const rows = [{ id: 1, title: 'Alpha', comment_count: 2 }, { id: 2, title: 'Beta', comment_count: 0 }];
    db.query.mockResolvedValue([rows]);

    const result = await DevThought.list();

    expect(result).toEqual(rows);
  });

  test('orders by created_at DESC', async () => {
    db.query.mockResolvedValue([[]]);

    await DevThought.list();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY t.created_at DESC');
  });
});

// ── getById ───────────────────────────────────────────────────────────────────

describe('DevThought.getById', () => {
  test('returns null when thought is not found', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await DevThought.getById(999);

    expect(result).toBeNull();
  });

  test('attaches files and comments to the thought', async () => {
    const thought  = { id: 1, title: 'Idea' };
    const files    = [{ id: 10, file_name: 'doc.pdf' }];
    const comments = [{ id: 20, body: 'Nice!', author_id: 3 }];

    db.query
      .mockResolvedValueOnce([[thought]])  // main thought query
      .mockResolvedValueOnce([files])      // thought files
      .mockResolvedValueOnce([comments])   // comments
      .mockResolvedValueOnce([[]]);        // comment 20 files

    const result = await DevThought.getById(1);

    expect(result).not.toBeNull();
    expect(result.files).toEqual(files);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].body).toBe('Nice!');
  });

  test('attaches files to each comment', async () => {
    const thought      = { id: 1, title: 'A' };
    const comments     = [{ id: 5, body: 'C1' }, { id: 6, body: 'C2' }];
    const commentFiles5 = [{ id: 50, file_name: 'a.png' }];
    const commentFiles6 = [];

    db.query
      .mockResolvedValueOnce([[thought]])
      .mockResolvedValueOnce([[]])          // no thought files
      .mockResolvedValueOnce([comments])
      .mockResolvedValueOnce([commentFiles5])
      .mockResolvedValueOnce([commentFiles6]);

    const result = await DevThought.getById(1);

    expect(result.comments[0].files).toEqual(commentFiles5);
    expect(result.comments[1].files).toEqual(commentFiles6);
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe('DevThought.delete', () => {
  beforeEach(() => {
    jest.spyOn(DevThought, '_unlink').mockImplementation(() => {});
  });

  afterEach(() => {
    DevThought._unlink.mockRestore();
  });

  test('calls _unlink for each thought file', async () => {
    const files    = [{ file_path: 'thoughts/a.pdf' }, { file_path: 'thoughts/b.png' }];
    const comments = [];

    db.query
      .mockResolvedValueOnce([files])     // thought files
      .mockResolvedValueOnce([comments])  // comments
      .mockResolvedValueOnce([{}]);       // DELETE

    await DevThought.delete(1);

    expect(DevThought._unlink).toHaveBeenCalledWith('thoughts/a.pdf');
    expect(DevThought._unlink).toHaveBeenCalledWith('thoughts/b.png');
  });

  test('calls _unlink for comment files before deleting', async () => {
    const files    = [];
    const comments = [{ id: 9 }];
    const cf       = [{ file_path: 'comments/x.jpg' }];

    db.query
      .mockResolvedValueOnce([files])
      .mockResolvedValueOnce([comments])
      .mockResolvedValueOnce([cf])        // comment 9 files
      .mockResolvedValueOnce([{}]);       // DELETE

    await DevThought.delete(1);

    expect(DevThought._unlink).toHaveBeenCalledWith('comments/x.jpg');
  });

  test('issues DELETE FROM dev_thoughts by id', async () => {
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{}]);

    await DevThought.delete(7);

    const lastCall = db.query.mock.calls[db.query.mock.calls.length - 1];
    const [sql, params] = lastCall;
    expect(sql).toContain('DELETE FROM dev_thoughts');
    expect(params).toEqual([7]);
  });
});

// ── addComment ────────────────────────────────────────────────────────────────

describe('DevThought.addComment', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 77 }]);

    const id = await DevThought.addComment({ thought_id: 1, author_id: 3, body: 'Great!' });

    expect(id).toBe(77);
  });
});

// ── addCommentFile ────────────────────────────────────────────────────────────

describe('DevThought.addCommentFile', () => {
  test('inserts into dev_thought_comment_files', async () => {
    db.query.mockResolvedValue([{}]);

    await DevThought.addCommentFile(5, {
      file_name:   'note.txt',
      file_path:   'comments/note.txt',
      file_mime:   'text/plain',
      file_size:   512,
      uploaded_by: 2,
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('dev_thought_comment_files');
    expect(params).toEqual([5, 'note.txt', 'comments/note.txt', 'text/plain', 512, 2]);
  });
});

// ── deleteComment ─────────────────────────────────────────────────────────────

describe('DevThought.deleteComment', () => {
  beforeEach(() => {
    jest.spyOn(DevThought, '_unlink').mockImplementation(() => {});
  });

  afterEach(() => {
    DevThought._unlink.mockRestore();
  });

  test('calls _unlink for each comment file', async () => {
    const files = [{ file_path: 'comments/doc.pdf' }, { file_path: 'comments/img.png' }];
    db.query
      .mockResolvedValueOnce([files])
      .mockResolvedValueOnce([{}]);

    await DevThought.deleteComment(10);

    expect(DevThought._unlink).toHaveBeenCalledWith('comments/doc.pdf');
    expect(DevThought._unlink).toHaveBeenCalledWith('comments/img.png');
  });

  test('issues DELETE FROM dev_thought_comments by id', async () => {
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{}]);

    await DevThought.deleteComment(15);

    const [sql, params] = db.query.mock.calls[1];
    expect(sql).toContain('DELETE FROM dev_thought_comments');
    expect(params).toEqual([15]);
  });
});

// ── getFile / getCommentFile / getCommentById ─────────────────────────────────

describe('DevThought.getFile', () => {
  test('returns the file row when found', async () => {
    const row = { id: 1, file_name: 'plan.pdf' };
    db.query.mockResolvedValue([[row]]);

    expect(await DevThought.getFile(1)).toEqual(row);
  });

  test('returns null when not found', async () => {
    db.query.mockResolvedValue([[]]);

    expect(await DevThought.getFile(999)).toBeNull();
  });
});

describe('DevThought.getCommentFile', () => {
  test('returns the comment file row when found', async () => {
    const row = { id: 5, file_name: 'img.png' };
    db.query.mockResolvedValue([[row]]);

    expect(await DevThought.getCommentFile(5)).toEqual(row);
  });

  test('returns null when not found', async () => {
    db.query.mockResolvedValue([[]]);

    expect(await DevThought.getCommentFile(999)).toBeNull();
  });
});

describe('DevThought.getCommentById', () => {
  test('returns the comment when found', async () => {
    const row = { id: 20, body: 'Hello' };
    db.query.mockResolvedValue([[row]]);

    expect(await DevThought.getCommentById(20)).toEqual(row);
  });

  test('returns null when not found', async () => {
    db.query.mockResolvedValue([[]]);

    expect(await DevThought.getCommentById(999)).toBeNull();
  });
});

// ── _unlink ───────────────────────────────────────────────────────────────────

describe('DevThought._unlink', () => {
  test('does nothing for a falsy path', () => {
    DevThought._unlink('');
    DevThought._unlink(null);

    expect(fs.existsSync).not.toHaveBeenCalled();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  test('calls unlinkSync when the file exists', () => {
    fs.existsSync.mockReturnValue(true);

    DevThought._unlink('thoughts/file.txt');

    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  test('does not call unlinkSync when the file does not exist', () => {
    fs.existsSync.mockReturnValue(false);

    DevThought._unlink('thoughts/missing.txt');

    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  test('swallows errors thrown by unlinkSync', () => {
    fs.existsSync.mockReturnValue(true);
    fs.unlinkSync.mockImplementation(() => { throw new Error('Permission denied'); });

    expect(() => DevThought._unlink('thoughts/locked.txt')).not.toThrow();
  });
});
