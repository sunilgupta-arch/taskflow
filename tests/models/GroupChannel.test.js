jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db           = require('../../config/db');
const GroupChannel = require('../../models/GroupChannel');

// ── searchMessages ────────────────────────────────────────────────────────────

describe('GroupChannel.searchMessages', () => {
  test('returns empty array for empty string query', async () => {
    const result = await GroupChannel.searchMessages('');

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns empty array for whitespace-only query', async () => {
    const result = await GroupChannel.searchMessages('   ');

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns empty array when query is null/undefined', async () => {
    const result = await GroupChannel.searchMessages(null);

    expect(result).toEqual([]);
  });

  test('returns matching messages for a valid query', async () => {
    const rows = [{ id: 1, content: 'hello world', type: 'text' }];
    db.query.mockResolvedValue([rows]);

    const result = await GroupChannel.searchMessages('hello');

    expect(result).toEqual(rows);
  });

  test('wraps the query in LIKE wildcards', async () => {
    db.query.mockResolvedValue([[]]);

    await GroupChannel.searchMessages('deploy');

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe('%deploy%');
  });

  test('only searches non-deleted text messages', async () => {
    db.query.mockResolvedValue([[]]);

    await GroupChannel.searchMessages('something');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("is_deleted = 0");
    expect(sql).toContain("type = 'text'");
  });

  test('uses the provided limit', async () => {
    db.query.mockResolvedValue([[]]);

    await GroupChannel.searchMessages('x', 10);

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(10);
  });

  test('defaults to limit 30', async () => {
    db.query.mockResolvedValue([[]]);

    await GroupChannel.searchMessages('x');

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(30);
  });
});

// ── togglePin ─────────────────────────────────────────────────────────────────

describe('GroupChannel.togglePin', () => {
  test('returns { error: "Not found" } when message does not exist', async () => {
    db.query.mockResolvedValueOnce([[]]); // SELECT returns nothing

    const result = await GroupChannel.togglePin(999, 1);

    expect(result).toEqual({ error: 'Not found' });
    expect(db.query).toHaveBeenCalledTimes(1); // no UPDATE
  });

  test('returns { error: ... } for a deleted message', async () => {
    db.query.mockResolvedValueOnce([[{ id: 5, is_pinned: 0, is_deleted: 1 }]]);

    const result = await GroupChannel.togglePin(5, 1);

    expect(result.error).toBeTruthy();
    expect(db.query).toHaveBeenCalledTimes(1); // no UPDATE
  });

  test('returns { message, pinned: true } when message is unpinned → pinned', async () => {
    const msg = { id: 5, is_pinned: 0, is_deleted: 0 };
    const updated = { id: 5, content: 'hi', sender_name: 'Alice' };
    db.query
      .mockResolvedValueOnce([[msg]])     // SELECT
      .mockResolvedValueOnce([{}])        // UPDATE
      .mockResolvedValueOnce([[updated]]); // SELECT updated

    const result = await GroupChannel.togglePin(5, 1);

    expect(result.pinned).toBe(true);
    expect(result.message).toEqual(updated);
  });

  test('returns { message, pinned: false } when message is pinned → unpinned', async () => {
    const msg = { id: 5, is_pinned: 1, is_deleted: 0 };
    const updated = { id: 5, content: 'hi', sender_name: 'Alice' };
    db.query
      .mockResolvedValueOnce([[msg]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[updated]]);

    const result = await GroupChannel.togglePin(5, 1);

    expect(result.pinned).toBe(false);
  });
});

// ── editMessage ───────────────────────────────────────────────────────────────

describe('GroupChannel.editMessage', () => {
  function makeMsg(overrides = {}) {
    return {
      id: 10,
      sender_id: 5,
      type: 'text',
      is_deleted: 0,
      created_at: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
      ...overrides,
    };
  }

  test('returns { error: "Message not found" } when message does not exist', async () => {
    db.query.mockResolvedValueOnce([[]]); // no rows

    const result = await GroupChannel.editMessage(999, 5, 'new content');

    expect(result).toEqual({ error: 'Message not found' });
  });

  test('returns { error: "Not your message" } when sender does not match', async () => {
    db.query.mockResolvedValueOnce([[makeMsg({ sender_id: 99 })]]);

    const result = await GroupChannel.editMessage(10, 5, 'new content');

    expect(result.error).toBe('Not your message');
  });

  test('returns { error: ... } for a deleted message', async () => {
    db.query.mockResolvedValueOnce([[makeMsg({ is_deleted: 1 })]]);

    const result = await GroupChannel.editMessage(10, 5, 'new content');

    expect(result.error).toMatch(/deleted/i);
  });

  test('returns { error: ... } for a non-text message type', async () => {
    db.query.mockResolvedValueOnce([[makeMsg({ type: 'file' })]]);

    const result = await GroupChannel.editMessage(10, 5, 'new content');

    expect(result.error).toMatch(/text/i);
  });

  test('returns { error: "Edit window expired" } for a message older than 15 min', async () => {
    const oldCreatedAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    db.query.mockResolvedValueOnce([[makeMsg({ created_at: oldCreatedAt })]]);

    const result = await GroupChannel.editMessage(10, 5, 'new');

    expect(result.error).toMatch(/15 min/i);
  });

  test('returns { message: updatedMsg } on successful edit', async () => {
    const updated = { id: 10, content: 'new content', sender_name: 'Alice' };
    db.query
      .mockResolvedValueOnce([[makeMsg()]])  // SELECT
      .mockResolvedValueOnce([{}])           // UPDATE
      .mockResolvedValueOnce([[updated]]);   // SELECT updated

    const result = await GroupChannel.editMessage(10, 5, 'new content');

    expect(result).toEqual({ message: updated });
  });

  test('passes new content to the UPDATE query', async () => {
    const updated = { id: 10, content: 'patched' };
    db.query
      .mockResolvedValueOnce([[makeMsg()]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[updated]]);

    await GroupChannel.editMessage(10, 5, 'patched');

    const [updateSql, updateParams] = db.query.mock.calls[1];
    expect(updateSql).toContain('content = ?');
    expect(updateParams[0]).toBe('patched');
  });
});

// ── deleteMessage ─────────────────────────────────────────────────────────────

describe('GroupChannel.deleteMessage', () => {
  const textMsg = { id: 7, type: 'text', sender_id: 5 };

  test('returns null when message is not found (or sender mismatch for non-admin)', async () => {
    db.query.mockResolvedValueOnce([[]]); // not found

    const result = await GroupChannel.deleteMessage(7, 5);

    expect(result).toBeNull();
  });

  test('soft-deletes the message via UPDATE (not a hard DELETE)', async () => {
    db.query
      .mockResolvedValueOnce([[textMsg]]) // find
      .mockResolvedValueOnce([{}]);        // UPDATE

    await GroupChannel.deleteMessage(7, 5);

    const [updateSql] = db.query.mock.calls[1];
    expect(updateSql).toContain('is_deleted = 1');
  });

  test('returns { id } on successful deletion', async () => {
    db.query
      .mockResolvedValueOnce([[textMsg]])
      .mockResolvedValueOnce([{}]);

    const result = await GroupChannel.deleteMessage(7, 5);

    expect(result).toEqual({ id: 7 });
  });

  test('admin can delete any message (bypasses sender check)', async () => {
    db.query
      .mockResolvedValueOnce([[textMsg]])
      .mockResolvedValueOnce([{}]);

    const result = await GroupChannel.deleteMessage(7, 99, true); // isAdmin = true

    expect(result).toEqual({ id: 7 });
    // Admin query does NOT include sender_id in WHERE
    const [selectSql] = db.query.mock.calls[0];
    expect(selectSql).not.toContain('sender_id');
  });

  test('non-admin query includes sender_id in WHERE', async () => {
    db.query.mockResolvedValueOnce([[]]); // not found

    await GroupChannel.deleteMessage(7, 5, false);

    const [selectSql, selectParams] = db.query.mock.calls[0];
    expect(selectSql).toContain('sender_id = ?');
    expect(selectParams).toContain(5);
  });
});

// ── resolveMentionedUserIds ───────────────────────────────────────────────────

describe('GroupChannel.resolveMentionedUserIds', () => {
  test('returns empty array when content has no @[Name] patterns', async () => {
    const result = await GroupChannel.resolveMentionedUserIds('Hello everyone');

    expect(result).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns empty array for empty string', async () => {
    const result = await GroupChannel.resolveMentionedUserIds('');

    expect(result).toEqual([]);
  });

  test('extracts names from @[Name] patterns and queries DB', async () => {
    db.query.mockResolvedValue([[{ id: 5 }, { id: 9 }]]);

    const result = await GroupChannel.resolveMentionedUserIds('Hey @[Alice] and @[Bob]!');

    expect(result).toEqual([5, 9]);
    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toEqual(['Alice', 'Bob']);
  });

  test('handles a single mention', async () => {
    db.query.mockResolvedValue([[{ id: 3 }]]);

    const result = await GroupChannel.resolveMentionedUserIds('@[Charlie] please check');

    expect(result).toEqual([3]);
  });

  test('excludes CLIENT_SALES from resolved mentions', async () => {
    db.query.mockResolvedValue([[{ id: 5 }]]);

    await GroupChannel.resolveMentionedUserIds('@[Alice]');

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("CLIENT_SALES");
  });
});

// ── saveMentions ──────────────────────────────────────────────────────────────

describe('GroupChannel.saveMentions', () => {
  test('skips the DB query when userIds array is empty', async () => {
    await GroupChannel.saveMentions(10, []);

    expect(db.query).not.toHaveBeenCalled();
  });

  test('inserts mention rows for each userId', async () => {
    db.query.mockResolvedValue([{}]);

    await GroupChannel.saveMentions(10, [5, 9]);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT IGNORE');
    expect(params[0]).toEqual([[10, 5], [10, 9]]);
  });
});

// ── getReactionSummary ────────────────────────────────────────────────────────

describe('GroupChannel.getReactionSummary', () => {
  test('groups reactions by emoji and counts them', async () => {
    db.query.mockResolvedValue([[
      { emoji: '👍', user_id: 1, name: 'Alice' },
      { emoji: '👍', user_id: 2, name: 'Bob' },
      { emoji: '❤️',  user_id: 3, name: 'Carol' },
    ]]);

    const result = await GroupChannel.getReactionSummary(10);

    const thumbs = result.find(r => r.emoji === '👍');
    const heart  = result.find(r => r.emoji === '❤️');

    expect(thumbs.count).toBe(2);
    expect(thumbs.users).toHaveLength(2);
    expect(heart.count).toBe(1);
  });

  test('returns empty array when no reactions exist', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await GroupChannel.getReactionSummary(99);

    expect(result).toEqual([]);
  });
});

// ── getUnseenMentionCount ─────────────────────────────────────────────────────

describe('GroupChannel.getUnseenMentionCount', () => {
  test('returns the count of unseen mentions', async () => {
    db.query.mockResolvedValue([[{ cnt: 3 }]]);

    const count = await GroupChannel.getUnseenMentionCount(5);

    expect(count).toBe(3);
  });

  test('filters by seen_at IS NULL', async () => {
    db.query.mockResolvedValue([[{ cnt: 0 }]]);

    await GroupChannel.getUnseenMentionCount(5);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('seen_at IS NULL');
  });
});

// ── markAllMentionsSeen ───────────────────────────────────────────────────────

describe('GroupChannel.markAllMentionsSeen', () => {
  test('issues an UPDATE setting seen_at = NOW() for unseen mentions', async () => {
    db.query.mockResolvedValue([{}]);

    await GroupChannel.markAllMentionsSeen(5);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('seen_at = NOW()');
    expect(sql).toContain('seen_at IS NULL');
    expect(params[0]).toBe(5);
  });
});
