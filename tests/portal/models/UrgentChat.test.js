jest.mock('../../../config/db', () => ({ query: jest.fn() }));

const db         = require('../../../config/db');
const UrgentChat = require('../../../portal/models/UrgentChat');

// ── create ────────────────────────────────────────────────────────────────────

describe('UrgentChat.create', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 42 }]);

    const id = await UrgentChat.create({ created_by: 5, message: 'Help!' });

    expect(id).toBe(42);
  });

  test('passes created_by and message as parameterised values', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await UrgentChat.create({ created_by: 5, message: 'Urgent issue' });

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([5, 'Urgent issue']);
  });
});

// ── getActive ─────────────────────────────────────────────────────────────────

describe('UrgentChat.getActive', () => {
  test('returns the active urgent chat when one exists', async () => {
    const chat = { id: 1, status: 'waiting', created_by_name: 'Alice' };
    db.query.mockResolvedValue([[chat]]);

    const result = await UrgentChat.getActive();

    expect(result).toEqual(chat);
  });

  test('returns null when no active chat exists', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await UrgentChat.getActive();

    expect(result).toBeNull();
  });

  test('only queries status IN ("waiting", "accepted")', async () => {
    db.query.mockResolvedValue([[]]);

    await UrgentChat.getActive();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("'waiting'");
    expect(sql).toContain("'accepted'");
    expect(sql).not.toContain("'resolved'");
  });
});

// ── getById ───────────────────────────────────────────────────────────────────

describe('UrgentChat.getById', () => {
  test('returns the chat row when found', async () => {
    const chat = { id: 7, status: 'accepted', created_by_name: 'Bob' };
    db.query.mockResolvedValue([[chat]]);

    const result = await UrgentChat.getById(7);

    expect(result).toEqual(chat);
  });

  test('returns null when no row matches', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await UrgentChat.getById(999);

    expect(result).toBeNull();
  });
});

// ── accept ────────────────────────────────────────────────────────────────────

describe('UrgentChat.accept', () => {
  test('updates status to "accepted" only for waiting chats', async () => {
    const updated = { id: 5, status: 'accepted', accepted_by_name: 'Admin' };
    db.query
      .mockResolvedValueOnce([{}])        // UPDATE
      .mockResolvedValueOnce([[updated]]); // getById SELECT

    await UrgentChat.accept(5, 10);

    const [updateSql, params] = db.query.mock.calls[0];
    expect(updateSql).toContain("status = 'accepted'");
    expect(updateSql).toContain("status = 'waiting'");
    expect(params[0]).toBe(10); // userId
    expect(params[1]).toBe(5);  // id
  });

  test('returns the updated chat via getById', async () => {
    const updated = { id: 5, status: 'accepted' };
    db.query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[updated]]);

    const result = await UrgentChat.accept(5, 10);

    expect(result).toEqual(updated);
  });
});

// ── resolve ───────────────────────────────────────────────────────────────────

describe('UrgentChat.resolve', () => {
  test('updates status to "resolved" for both waiting and accepted chats', async () => {
    const updated = { id: 5, status: 'resolved' };
    db.query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[updated]]);

    await UrgentChat.resolve(5, 10);

    const [updateSql] = db.query.mock.calls[0];
    expect(updateSql).toContain("status = 'resolved'");
    expect(updateSql).toContain("'waiting'");
    expect(updateSql).toContain("'accepted'");
  });

  test('returns the updated chat via getById', async () => {
    const updated = { id: 5, status: 'resolved' };
    db.query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[updated]]);

    const result = await UrgentChat.resolve(5, 10);

    expect(result).toEqual(updated);
  });
});

// ── sendMessage ───────────────────────────────────────────────────────────────

describe('UrgentChat.sendMessage', () => {
  test('returns the fetched message row', async () => {
    const row = { id: 10, content: 'Help', sender_name: 'Alice' };
    db.query
      .mockResolvedValueOnce([{ insertId: 10 }])  // INSERT
      .mockResolvedValueOnce([[row]]);              // SELECT

    const result = await UrgentChat.sendMessage({
      urgent_chat_id: 5, sender_id: 1, content: 'Help', type: 'text',
    });

    expect(result).toEqual(row);
  });

  test('defaults type to "text" when not provided', async () => {
    db.query
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    await UrgentChat.sendMessage({ urgent_chat_id: 5, sender_id: 1, content: 'Hi' });

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBe('text');
  });

  test('stores null for content when not provided', async () => {
    db.query
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    await UrgentChat.sendMessage({ urgent_chat_id: 5, sender_id: 1, type: 'system' });

    const [, params] = db.query.mock.calls[0];
    expect(params[2]).toBeNull();
  });
});

// ── getMessages ───────────────────────────────────────────────────────────────

describe('UrgentChat.getMessages', () => {
  test('returns empty array when no messages exist (no attachment query)', async () => {
    db.query.mockResolvedValueOnce([[]]); // no messages

    const result = await UrgentChat.getMessages(5);

    expect(result).toEqual([]);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('attaches null when no attachment exists for a message', async () => {
    const rows = [{ id: 1, type: 'text' }];
    db.query
      .mockResolvedValueOnce([rows])   // messages
      .mockResolvedValueOnce([[]]); // no attachments

    const result = await UrgentChat.getMessages(5);

    expect(result[0].attachment).toBeNull();
  });

  test('attaches the matching attachment to each message', async () => {
    const rows = [{ id: 1, type: 'file' }];
    const att  = { id: 99, message_id: 1, file_name: 'doc.pdf' };
    db.query
      .mockResolvedValueOnce([rows])
      .mockResolvedValueOnce([[att]]);

    const result = await UrgentChat.getMessages(5);

    expect(result[0].attachment).toEqual(att);
  });

  test('orders messages by created_at ASC', async () => {
    db.query
      .mockResolvedValueOnce([[]])
    ;

    await UrgentChat.getMessages(5);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY m.created_at ASC');
  });
});

// ── saveAttachment ────────────────────────────────────────────────────────────

describe('UrgentChat.saveAttachment', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 77 }]);

    const id = await UrgentChat.saveAttachment({
      message_id: 1, file_name: 'f.pdf', file_size: 512, mime_type: 'application/pdf', uploaded_by: 5,
    });

    expect(id).toBe(77);
  });

  test('stores null for drive_file_id when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await UrgentChat.saveAttachment({
      message_id: 1, file_name: 'f.pdf', file_size: 512, mime_type: 'application/pdf', uploaded_by: 5,
    });

    const [, params] = db.query.mock.calls[0];
    expect(params[1]).toBeNull();
  });
});

// ── getAttachment ─────────────────────────────────────────────────────────────

describe('UrgentChat.getAttachment', () => {
  test('returns the attachment row when found', async () => {
    const att = { id: 1, file_name: 'img.png' };
    db.query.mockResolvedValue([[att]]);

    const result = await UrgentChat.getAttachment(10);

    expect(result).toEqual(att);
  });

  test('returns null when no attachment exists', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await UrgentChat.getAttachment(999);

    expect(result).toBeNull();
  });
});

// ── getHistory ────────────────────────────────────────────────────────────────

describe('UrgentChat.getHistory', () => {
  test('returns history rows', async () => {
    const rows = [{ id: 1, status: 'resolved', message_count: 5 }];
    db.query.mockResolvedValue([rows]);

    const result = await UrgentChat.getHistory();

    expect(result).toEqual(rows);
  });

  test('passes the limit as a parameterised value', async () => {
    db.query.mockResolvedValue([[]]);

    await UrgentChat.getHistory(20);

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(20);
  });

  test('defaults limit to 50', async () => {
    db.query.mockResolvedValue([[]]);

    await UrgentChat.getHistory();

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(50);
  });

  test('excludes system messages from message_count', async () => {
    db.query.mockResolvedValue([[]]);

    await UrgentChat.getHistory();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("type != 'system'");
  });
});
