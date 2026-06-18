jest.mock('../../../config/db', () => ({
  query:         jest.fn(),
  getConnection: jest.fn(),
}));

const db         = require('../../../config/db');
const PortalChat = require('../../../portal/models/Chat');

function makeConn(queryResults = []) {
  const conn = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    query:            jest.fn(),
    commit:           jest.fn().mockResolvedValue(undefined),
    rollback:         jest.fn().mockResolvedValue(undefined),
    release:          jest.fn(),
  };
  queryResults.forEach(r => conn.query.mockResolvedValueOnce(r));
  return conn;
}

// ── getClientUsers ────────────────────────────────────────────────────────────

describe('PortalChat.getClientUsers', () => {
  test('excludes the given user id', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalChat.getClientUsers(5);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('u.id != ?');
    expect(params[0]).toBe(5);
  });

  test('filters only CLIENT_* roles', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalChat.getClientUsers(5);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('CLIENT_ADMIN');
    expect(sql).toContain('CLIENT_USER');
    // LOCAL roles must NOT appear in the IN list
    expect(sql).not.toContain('LOCAL_ADMIN');
  });

  test('excludes the system account', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalChat.getClientUsers(5);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("system@taskflow.local");
  });
});

// ── findDirectConversation ────────────────────────────────────────────────────

describe('PortalChat.findDirectConversation', () => {
  test('returns the conversation row when found', async () => {
    db.query.mockResolvedValue([[{ id: 3 }]]);

    const result = await PortalChat.findDirectConversation(1, 2);

    expect(result).toEqual({ id: 3 });
  });

  test('returns null when no direct conversation exists', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await PortalChat.findDirectConversation(1, 2);

    expect(result).toBeNull();
  });

  test('queries portal_conversations with type = "direct"', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalChat.findDirectConversation(1, 2);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("type = 'direct'");
    expect(sql).toContain('portal_conversations');
  });
});

// ── createConversation ────────────────────────────────────────────────────────

describe('PortalChat.createConversation', () => {
  test('returns the new conversationId', async () => {
    const conn = makeConn([
      [{ insertId: 10 }],  // INSERT conversation
      [{}],                 // INSERT participant 1
      [{}],                 // INSERT participant 2
    ]);
    db.getConnection.mockResolvedValue(conn);

    const id = await PortalChat.createConversation({
      type: 'direct', name: null, created_by: 1, participant_ids: [2],
    });

    expect(id).toBe(10);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('deduplicates created_by from participant_ids', async () => {
    const conn = makeConn([
      [{ insertId: 5 }],
      [{}],
      [{}],
    ]);
    db.getConnection.mockResolvedValue(conn);

    await PortalChat.createConversation({
      type: 'group', name: 'Team', created_by: 1, participant_ids: [1, 2],
    });

    const participantInserts = conn.query.mock.calls.filter(
      ([sql]) => sql.includes('portal_participants')
    );
    expect(participantInserts).toHaveLength(2); // 1 and 2, not 1, 1, 2
  });

  test('rolls back and rethrows on error', async () => {
    const conn = makeConn();
    conn.query.mockRejectedValueOnce(new Error('fail'));
    db.getConnection.mockResolvedValue(conn);

    await expect(
      PortalChat.createConversation({ type: 'direct', created_by: 1, participant_ids: [2] })
    ).rejects.toThrow('fail');

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

// ── isParticipant ─────────────────────────────────────────────────────────────

describe('PortalChat.isParticipant', () => {
  test('returns true when user is a participant', async () => {
    db.query.mockResolvedValue([[{ id: 1 }]]);

    const result = await PortalChat.isParticipant(5, 10);

    expect(result).toBe(true);
  });

  test('returns false when user is not a participant', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await PortalChat.isParticipant(5, 99);

    expect(result).toBe(false);
  });
});

// ── sendMessage ───────────────────────────────────────────────────────────────

describe('PortalChat.sendMessage', () => {
  test('returns the fetched message row', async () => {
    const row = { id: 7, content: 'Hi', sender_name: 'Alice' };
    db.query
      .mockResolvedValueOnce([{ insertId: 7 }])  // INSERT
      .mockResolvedValueOnce([{}])                 // UPDATE timestamp
      .mockResolvedValueOnce([[row]]);              // SELECT

    const result = await PortalChat.sendMessage({
      conversation_id: 3, sender_id: 1, content: 'Hi',
    });

    expect(result).toEqual(row);
  });

  test('defaults type to "text"', async () => {
    db.query
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    await PortalChat.sendMessage({ conversation_id: 3, sender_id: 1, content: 'Hi' });

    const [, params] = db.query.mock.calls[0];
    expect(params[3]).toBe('text');
  });
});

// ── markAsRead ────────────────────────────────────────────────────────────────

describe('PortalChat.markAsRead', () => {
  test('returns 0 when there are no messages', async () => {
    db.query.mockResolvedValueOnce([[]]); // no messages

    const result = await PortalChat.markAsRead(5, 10);

    expect(result).toBe(0);
    expect(db.query).toHaveBeenCalledTimes(1); // no UPDATE
  });

  test('updates last_read_message_id and returns the latest message id', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 25 }]])  // SELECT latest
      .mockResolvedValueOnce([{}]);             // UPDATE

    const result = await PortalChat.markAsRead(5, 10);

    expect(result).toBe(25);
    const [updateSql, params] = db.query.mock.calls[1];
    expect(updateSql).toContain('last_read_message_id = ?');
    expect(params[0]).toBe(25);
  });
});

// ── getTotalUnreadCount ───────────────────────────────────────────────────────

describe('PortalChat.getTotalUnreadCount', () => {
  test('returns the total unread count', async () => {
    db.query.mockResolvedValue([[{ total: 7 }]]);

    const count = await PortalChat.getTotalUnreadCount(5);

    expect(count).toBe(7);
  });
});

// ── getParticipants ───────────────────────────────────────────────────────────

describe('PortalChat.getParticipants', () => {
  test('returns participant rows with user and role info', async () => {
    const rows = [{ id: 1, name: 'Alice', role_name: 'CLIENT_USER' }];
    db.query.mockResolvedValue([rows]);

    const result = await PortalChat.getParticipants(5);

    expect(result).toEqual(rows);
  });
});

// ── getAttachment ─────────────────────────────────────────────────────────────

describe('PortalChat.getAttachment', () => {
  test('returns the attachment when found', async () => {
    const att = { id: 1, file_name: 'img.png' };
    db.query.mockResolvedValue([[att]]);

    const result = await PortalChat.getAttachment(10);

    expect(result).toEqual(att);
  });

  test('returns null when no attachment exists', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await PortalChat.getAttachment(999);

    expect(result).toBeNull();
  });
});

// ── searchMessages ────────────────────────────────────────────────────────────

describe('PortalChat.searchMessages', () => {
  test('wraps the query in LIKE wildcards', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalChat.searchMessages(5, 'deploy');

    const [, params] = db.query.mock.calls[0];
    expect(params[1]).toBe('%deploy%');
  });

  test('excludes deleted messages', async () => {
    db.query.mockResolvedValue([[]]);

    await PortalChat.searchMessages(5, 'test');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('is_deleted = 0');
  });

  test('returns messages in chronological order (reversed from DESC query)', async () => {
    const rows = [{ id: 3 }, { id: 2 }, { id: 1 }];
    db.query.mockResolvedValue([rows]);

    const result = await PortalChat.searchMessages(5, 'hi');

    expect(result[0].id).toBe(1);
    expect(result[2].id).toBe(3);
  });
});

// ── editMessage ───────────────────────────────────────────────────────────────

describe('PortalChat.editMessage', () => {
  test('returns null when message is not found or sender does not match', async () => {
    db.query.mockResolvedValueOnce([[]]); // no rows

    const result = await PortalChat.editMessage(10, 5, 'new');

    expect(result).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1); // no UPDATE
  });

  test('returns updated object on success', async () => {
    const msg = { id: 10, conversation_id: 3 };
    db.query
      .mockResolvedValueOnce([[msg]])  // SELECT
      .mockResolvedValueOnce([{}]);    // UPDATE

    const result = await PortalChat.editMessage(10, 5, 'updated text');

    expect(result).toEqual({ id: 10, content: 'updated text', conversation_id: 3 });
  });

  test('requires is_deleted = 0 in the SELECT', async () => {
    db.query.mockResolvedValueOnce([[]]);

    await PortalChat.editMessage(10, 5, 'new');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('is_deleted = 0');
  });
});

// ── deleteMessage ─────────────────────────────────────────────────────────────

describe('PortalChat.deleteMessage', () => {
  test('returns null when message is not found or sender mismatch', async () => {
    db.query.mockResolvedValueOnce([[]]); // not found

    const result = await PortalChat.deleteMessage(10, 5);

    expect(result).toBeNull();
  });

  test('soft-deletes text message and returns { id, conversation_id }', async () => {
    const msg = { id: 10, type: 'text', conversation_id: 3 };
    db.query
      .mockResolvedValueOnce([[msg]])  // SELECT
      .mockResolvedValueOnce([{}]);    // UPDATE

    const result = await PortalChat.deleteMessage(10, 5);

    expect(result).toEqual({ id: 10, conversation_id: 3 });
    const [updateSql] = db.query.mock.calls[1];
    expect(updateSql).toContain('is_deleted = 1');
  });
});

// ── addMembers ────────────────────────────────────────────────────────────────

describe('PortalChat.addMembers', () => {
  test('uses INSERT IGNORE to avoid duplicate participant rows', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalChat.addMembers(5, [10, 20]);

    expect(db.query).toHaveBeenCalledTimes(2);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT IGNORE');
  });

  test('inserts one row per user id', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalChat.addMembers(5, [10, 20, 30]);

    expect(db.query).toHaveBeenCalledTimes(3);
  });
});

// ── removeMember ──────────────────────────────────────────────────────────────

describe('PortalChat.removeMember', () => {
  test('issues a DELETE by conversationId and userId', async () => {
    db.query.mockResolvedValue([{}]);

    await PortalChat.removeMember(5, 10);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql.trim().toUpperCase()).toMatch(/^DELETE/);
    expect(params).toEqual([5, 10]);
  });
});

// ── getConversation ───────────────────────────────────────────────────────────

describe('PortalChat.getConversation', () => {
  test('returns the conversation row when found', async () => {
    const conv = { id: 5, type: 'direct' };
    db.query.mockResolvedValue([[conv]]);

    const result = await PortalChat.getConversation(5);

    expect(result).toEqual(conv);
  });

  test('returns null when not found', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await PortalChat.getConversation(999);

    expect(result).toBeNull();
  });
});
