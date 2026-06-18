jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db         = require('../../config/db');
const BridgeChat = require('../../models/BridgeChat');

// ── findOrCreateConversation ──────────────────────────────────────────────────

describe('BridgeChat.findOrCreateConversation', () => {
  test('returns existing conversation id without creating a new one', async () => {
    db.query.mockResolvedValueOnce([[{ id: 7 }]]); // existing row

    const id = await BridgeChat.findOrCreateConversation(1, 2);

    expect(id).toBe(7);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('creates and returns new conversation id when none exists', async () => {
    db.query
      .mockResolvedValueOnce([[]])              // no existing
      .mockResolvedValueOnce([{ insertId: 9 }]); // INSERT

    const id = await BridgeChat.findOrCreateConversation(1, 2);

    expect(id).toBe(9);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('passes clientUserId and localUserId to the SELECT query', async () => {
    db.query.mockResolvedValueOnce([[{ id: 3 }]]);

    await BridgeChat.findOrCreateConversation(10, 20);

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([10, 20]);
  });
});

// ── getConversation ───────────────────────────────────────────────────────────

describe('BridgeChat.getConversation', () => {
  test('returns the conversation row with joined user info', async () => {
    const conv = { id: 5, client_user_name: 'Alice', local_user_name: 'Bob' };
    db.query.mockResolvedValue([[conv]]);

    const result = await BridgeChat.getConversation(5);

    expect(result).toEqual(conv);
  });

  test('returns null when conversation is not found', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await BridgeChat.getConversation(999);

    expect(result).toBeNull();
  });
});

// ── isParticipant ─────────────────────────────────────────────────────────────

describe('BridgeChat.isParticipant', () => {
  test('returns true when user is the client or local participant', async () => {
    db.query.mockResolvedValue([[{ id: 5 }]]);

    const result = await BridgeChat.isParticipant(3, 10);

    expect(result).toBe(true);
  });

  test('returns false when user is not part of the conversation', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await BridgeChat.isParticipant(3, 99);

    expect(result).toBe(false);
  });

  test('checks both client_user_id and local_user_id', async () => {
    db.query.mockResolvedValue([[]]);

    await BridgeChat.isParticipant(3, 10);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('client_user_id = ?');
    expect(sql).toContain('local_user_id = ?');
  });
});

// ── getMessages ───────────────────────────────────────────────────────────────

describe('BridgeChat.getMessages', () => {
  test('returns messages in chronological order (reversed)', async () => {
    const rows = [{ id: 3, type: 'text' }, { id: 2, type: 'text' }, { id: 1, type: 'text' }];
    db.query.mockResolvedValue([rows]);

    const result = await BridgeChat.getMessages(5);

    expect(result[0].id).toBe(1);
    expect(result[2].id).toBe(3);
  });

  test('adds AND m.id < ? clause when beforeId is provided', async () => {
    db.query.mockResolvedValue([[]]);

    await BridgeChat.getMessages(5, 50, 20);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('m.id < ?');
    expect(params).toContain(20);
  });

  test('does not add beforeId clause when beforeId is null', async () => {
    db.query.mockResolvedValue([[]]);

    await BridgeChat.getMessages(5, 50, null);

    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain('m.id < ?');
  });

  test('passes limit as last query param', async () => {
    db.query.mockResolvedValue([[]]);

    await BridgeChat.getMessages(5, 25);

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(25);
  });
});

// ── sendMessage ───────────────────────────────────────────────────────────────

describe('BridgeChat.sendMessage', () => {
  test('returns the fetched message row', async () => {
    const row = { id: 10, content: 'Hello', sender_name: 'Alice' };
    db.query
      .mockResolvedValueOnce([{ insertId: 10 }])  // INSERT
      .mockResolvedValueOnce([{}])                  // UPDATE timestamp
      .mockResolvedValueOnce([[row]]);               // SELECT

    const result = await BridgeChat.sendMessage({
      conversation_id: 3, sender_id: 1, content: 'Hello', type: 'text',
    });

    expect(result).toEqual(row);
  });

  test('defaults type to "text"', async () => {
    db.query
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    await BridgeChat.sendMessage({ conversation_id: 3, sender_id: 1, content: 'Hi' });

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBe('text');
  });

  test('updates conversation updated_at after inserting', async () => {
    db.query
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    await BridgeChat.sendMessage({ conversation_id: 3, sender_id: 1, content: 'Hi' });

    const [updateSql] = db.query.mock.calls[1];
    expect(updateSql).toContain('updated_at = NOW()');
  });
});

// ── saveAttachment ────────────────────────────────────────────────────────────

describe('BridgeChat.saveAttachment', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 22 }]);

    const id = await BridgeChat.saveAttachment({
      message_id: 1, file_name: 'doc.pdf', file_size: 1024, mime_type: 'application/pdf', uploaded_by: 5,
    });

    expect(id).toBe(22);
  });

  test('stores null for drive_file_id when not provided', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await BridgeChat.saveAttachment({
      message_id: 1, file_name: 'f.pdf', file_size: 100, mime_type: 'application/pdf', uploaded_by: 5,
    });

    const [, params] = db.query.mock.calls[0];
    expect(params[1]).toBeNull(); // drive_file_id
  });
});

// ── markAsRead ────────────────────────────────────────────────────────────────

describe('BridgeChat.markAsRead', () => {
  test('only marks messages where sender_id != readByUserId and is_read = 0', async () => {
    db.query.mockResolvedValue([{ affectedRows: 2 }]);

    await BridgeChat.markAsRead(5, 10);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('sender_id != ?');
    expect(sql).toContain('is_read = 0');
    expect(params[1]).toBe(10);
  });
});

// ── getUnreadCount ────────────────────────────────────────────────────────────

describe('BridgeChat.getUnreadCount', () => {
  test('returns the total unread count for the user', async () => {
    db.query.mockResolvedValue([[{ total: 5 }]]);

    const count = await BridgeChat.getUnreadCount(10);

    expect(count).toBe(5);
  });
});

// ── getUnreadCountByUser ──────────────────────────────────────────────────────

describe('BridgeChat.getUnreadCountByUser', () => {
  test('returns a map of sender_id to unread count', async () => {
    db.query.mockResolvedValue([[{ sender_id: 3, cnt: 2 }, { sender_id: 7, cnt: 1 }]]);

    const result = await BridgeChat.getUnreadCountByUser(10);

    expect(result).toEqual({ 3: 2, 7: 1 });
  });

  test('returns an empty map when no unread messages', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await BridgeChat.getUnreadCountByUser(10);

    expect(result).toEqual({});
  });
});

// ── deleteMessage ─────────────────────────────────────────────────────────────

describe('BridgeChat.deleteMessage', () => {
  test('returns null when message is not found or already deleted', async () => {
    db.query.mockResolvedValueOnce([[]]); // no row found

    const result = await BridgeChat.deleteMessage(10, 5);

    expect(result).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('soft-deletes via UPDATE is_deleted = 1 for text messages', async () => {
    const msg = { id: 10, type: 'text', conversation_id: 3 };
    db.query
      .mockResolvedValueOnce([[msg]])  // SELECT
      .mockResolvedValueOnce([{}]);     // UPDATE

    const result = await BridgeChat.deleteMessage(10, 5);

    expect(result).toEqual({ id: 10, conversation_id: 3 });
    const [updateSql] = db.query.mock.calls[1];
    expect(updateSql).toContain('is_deleted = 1');
  });

  test('requires sender_id match in the SELECT query', async () => {
    db.query.mockResolvedValueOnce([[]]);

    await BridgeChat.deleteMessage(10, 99);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('sender_id = ?');
    expect(params[1]).toBe(99);
  });
});

// ── getAttachment ─────────────────────────────────────────────────────────────

describe('BridgeChat.getAttachment', () => {
  test('returns the attachment row when found', async () => {
    const att = { id: 1, file_name: 'doc.pdf' };
    db.query.mockResolvedValue([[att]]);

    const result = await BridgeChat.getAttachment(10);

    expect(result).toEqual(att);
  });

  test('returns null when no attachment exists', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await BridgeChat.getAttachment(999);

    expect(result).toBeNull();
  });
});
