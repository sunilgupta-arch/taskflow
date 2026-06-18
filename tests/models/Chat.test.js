jest.mock('../../config/db', () => ({
  query:         jest.fn(),
  getConnection: jest.fn(),
}));

const db        = require('../../config/db');
const ChatModel = require('../../models/Chat');

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

// ── findDirectConversation ────────────────────────────────────────────────────

describe('ChatModel.findDirectConversation', () => {
  test('returns the conversation row when found', async () => {
    const row = { id: 3 };
    db.query.mockResolvedValue([[row]]);

    const result = await ChatModel.findDirectConversation(1, 2);

    expect(result).toEqual(row);
  });

  test('returns null when no direct conversation exists', async () => {
    db.query.mockResolvedValue([[]]); // empty

    const result = await ChatModel.findDirectConversation(1, 2);

    expect(result).toBeNull();
  });

  test('queries for type = "direct"', async () => {
    db.query.mockResolvedValue([[]]);

    await ChatModel.findDirectConversation(1, 2);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("type = 'direct'");
  });
});

// ── createConversation ────────────────────────────────────────────────────────

describe('ChatModel.createConversation', () => {
  test('returns the new conversationId', async () => {
    const conn = makeConn([
      [{ insertId: 10 }],  // INSERT conversation
      [{}],                 // INSERT participant 1
      [{}],                 // INSERT participant 2
    ]);
    db.getConnection.mockResolvedValue(conn);

    const id = await ChatModel.createConversation({
      type: 'direct', name: null, created_by: 1, participant_ids: [2],
    });

    expect(id).toBe(10);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('deduplicates created_by from participant_ids', async () => {
    // creator (1) also in participant_ids → should only insert once
    const conn = makeConn([
      [{ insertId: 10 }],  // INSERT conversation
      [{}],                 // INSERT participant 1 (creator)
      [{}],                 // INSERT participant 2
    ]);
    db.getConnection.mockResolvedValue(conn);

    await ChatModel.createConversation({
      type: 'group', name: 'Test', created_by: 1, participant_ids: [1, 2],
    });

    // Two participant inserts (deduped), not three
    const participantInserts = conn.query.mock.calls.filter(
      ([sql]) => sql.includes('chat_participants')
    );
    expect(participantInserts).toHaveLength(2);
  });

  test('rolls back and rethrows on error', async () => {
    const conn = makeConn();
    conn.query.mockRejectedValueOnce(new Error('DB error'));
    db.getConnection.mockResolvedValue(conn);

    await expect(
      ChatModel.createConversation({ type: 'direct', created_by: 1, participant_ids: [2] })
    ).rejects.toThrow('DB error');

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

// ── isParticipant ─────────────────────────────────────────────────────────────

describe('ChatModel.isParticipant', () => {
  test('returns true when user is a participant', async () => {
    db.query.mockResolvedValue([[{ 1: 1 }]]);

    const result = await ChatModel.isParticipant(5, 10);

    expect(result).toBe(true);
  });

  test('returns false when user is not a participant', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await ChatModel.isParticipant(5, 10);

    expect(result).toBe(false);
  });
});

// ── markAsRead ────────────────────────────────────────────────────────────────

describe('ChatModel.markAsRead', () => {
  test('returns null when there are no messages in the conversation', async () => {
    db.query.mockResolvedValue([[{ max_id: null }]]);

    const result = await ChatModel.markAsRead(5, 10);

    expect(result).toBeNull();
  });

  test('returns the latest message id after marking as read', async () => {
    db.query
      .mockResolvedValueOnce([[{ max_id: 99 }]])  // SELECT MAX
      .mockResolvedValueOnce([{}]);                // UPSERT

    const result = await ChatModel.markAsRead(5, 10);

    expect(result).toBe(99);
  });

  test('uses ON DUPLICATE KEY UPDATE to upsert read status', async () => {
    db.query
      .mockResolvedValueOnce([[{ max_id: 5 }]])
      .mockResolvedValueOnce([{}]);

    await ChatModel.markAsRead(5, 10);

    const [upsertSql] = db.query.mock.calls[1];
    expect(upsertSql).toContain('ON DUPLICATE KEY UPDATE');
  });
});

// ── getChatableUsers ──────────────────────────────────────────────────────────

describe('ChatModel.getChatableUsers', () => {
  test('excludes the current user from results', async () => {
    db.query.mockResolvedValue([[]]);

    await ChatModel.getChatableUsers(7);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('u.id != ?');
    expect(params[0]).toBe(7);
  });

  test('only returns active users', async () => {
    db.query.mockResolvedValue([[]]);

    await ChatModel.getChatableUsers(7);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('u.is_active = 1');
  });
});

// ── getTotalUnreadCount ───────────────────────────────────────────────────────

describe('ChatModel.getTotalUnreadCount', () => {
  test('returns the total unread count', async () => {
    db.query.mockResolvedValue([[{ total_unread: 12 }]]);

    const count = await ChatModel.getTotalUnreadCount(5);

    expect(count).toBe(12);
  });
});

// ── getParticipantIds ─────────────────────────────────────────────────────────

describe('ChatModel.getParticipantIds', () => {
  test('returns an array of user_id values', async () => {
    db.query.mockResolvedValue([[{ user_id: 1 }, { user_id: 2 }, { user_id: 3 }]]);

    const result = await ChatModel.getParticipantIds(5);

    expect(result).toEqual([1, 2, 3]);
  });

  test('returns empty array when no participants', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await ChatModel.getParticipantIds(99);

    expect(result).toEqual([]);
  });
});

// ── getSystemUserId ───────────────────────────────────────────────────────────

describe('ChatModel.getSystemUserId', () => {
  test('returns the system user id when found', async () => {
    db.query.mockResolvedValue([[{ id: 999 }]]);

    const id = await ChatModel.getSystemUserId();

    expect(id).toBe(999);
  });

  test('returns null when system user does not exist', async () => {
    db.query.mockResolvedValue([[undefined]]);

    const id = await ChatModel.getSystemUserId();

    expect(id).toBeNull();
  });

  test('queries by system@taskflow.local email', async () => {
    db.query.mockResolvedValue([[undefined]]);

    await ChatModel.getSystemUserId();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('system@taskflow.local');
  });
});

// ── editMessage ───────────────────────────────────────────────────────────────

describe('ChatModel.editMessage', () => {
  function mockMsg(overrides = {}) {
    return { sender_id: 5, is_deleted: 0, message_type: 'text', ...overrides };
  }

  test('throws "Message not found" when message does not exist', async () => {
    db.query.mockResolvedValue([[undefined]]);

    await expect(ChatModel.editMessage(99, 5, 'new')).rejects.toThrow('Message not found');
  });

  test('throws when sender does not match', async () => {
    db.query.mockResolvedValue([[mockMsg({ sender_id: 99 })]]);

    await expect(ChatModel.editMessage(10, 5, 'new')).rejects.toThrow('edit your own messages');
  });

  test('throws for a deleted message', async () => {
    db.query.mockResolvedValue([[mockMsg({ is_deleted: 1 })]]);

    await expect(ChatModel.editMessage(10, 5, 'new')).rejects.toThrow('deleted');
  });

  test('throws for non-text message_type', async () => {
    db.query.mockResolvedValue([[mockMsg({ message_type: 'file' })]]);

    await expect(ChatModel.editMessage(10, 5, 'new')).rejects.toThrow('text messages');
  });

  test('throws when new content is empty string', async () => {
    db.query.mockResolvedValue([[mockMsg()]]);

    await expect(ChatModel.editMessage(10, 5, '   ')).rejects.toThrow('empty');
  });

  test('returns updated message on success', async () => {
    const updated = { id: 10, content: 'updated', sender_name: 'Alice' };
    db.query
      .mockResolvedValueOnce([[mockMsg()]])  // SELECT
      .mockResolvedValueOnce([{}])            // UPDATE
      .mockResolvedValueOnce([[updated]]);    // SELECT updated

    const result = await ChatModel.editMessage(10, 5, 'updated');

    expect(result).toEqual(updated);
  });

  test('trims the new content before saving', async () => {
    const updated = { id: 10, content: 'trimmed' };
    db.query
      .mockResolvedValueOnce([[mockMsg()]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[updated]]);

    await ChatModel.editMessage(10, 5, '  trimmed  ');

    const [, params] = db.query.mock.calls[1]; // UPDATE call
    expect(params[0]).toBe('trimmed');
  });
});

// ── deleteMessage ─────────────────────────────────────────────────────────────

describe('ChatModel.deleteMessage', () => {
  test('throws "Message not found" when message does not exist', async () => {
    db.query.mockResolvedValue([[undefined]]);

    await expect(ChatModel.deleteMessage(99, 5, 'LOCAL_USER')).rejects.toThrow('Message not found');
  });

  test('throws "already deleted" for a soft-deleted message', async () => {
    db.query.mockResolvedValue([[{ sender_id: 5, is_deleted: 1 }]]);

    await expect(ChatModel.deleteMessage(10, 5, 'LOCAL_USER')).rejects.toThrow('already deleted');
  });

  test('throws when non-admin tries to delete another user\'s message', async () => {
    db.query.mockResolvedValue([[{ sender_id: 99, is_deleted: 0 }]]);

    await expect(ChatModel.deleteMessage(10, 5, 'LOCAL_USER')).rejects.toThrow('your own messages');
  });

  test('LOCAL_ADMIN can delete another user\'s message', async () => {
    db.query
      .mockResolvedValueOnce([[{ sender_id: 99, is_deleted: 0 }]])
      .mockResolvedValueOnce([{}]);

    await expect(ChatModel.deleteMessage(10, 5, 'LOCAL_ADMIN')).resolves.not.toThrow();
  });

  test('LOCAL_MANAGER can delete another user\'s message', async () => {
    db.query
      .mockResolvedValueOnce([[{ sender_id: 99, is_deleted: 0 }]])
      .mockResolvedValueOnce([{}]);

    await expect(ChatModel.deleteMessage(10, 5, 'LOCAL_MANAGER')).resolves.not.toThrow();
  });

  test('soft-deletes the message (UPDATE is_deleted = 1)', async () => {
    db.query
      .mockResolvedValueOnce([[{ sender_id: 5, is_deleted: 0 }]])
      .mockResolvedValueOnce([{}]);

    await ChatModel.deleteMessage(10, 5, 'LOCAL_USER');

    const [updateSql] = db.query.mock.calls[1];
    expect(updateSql).toContain('is_deleted = 1');
  });
});

// ── toggleReaction ────────────────────────────────────────────────────────────

describe('ChatModel.toggleReaction', () => {
  test('returns { action: "added" } when reaction does not exist yet', async () => {
    db.query
      .mockResolvedValueOnce([[undefined]]) // no existing reaction
      .mockResolvedValueOnce([{}]);          // INSERT

    const result = await ChatModel.toggleReaction(10, 5, '👍');

    expect(result).toEqual({ action: 'added' });
  });

  test('returns { action: "removed" } when reaction already exists', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 3 }]]) // existing reaction found
      .mockResolvedValueOnce([{}]);           // DELETE

    const result = await ChatModel.toggleReaction(10, 5, '👍');

    expect(result).toEqual({ action: 'removed' });
  });

  test('DELETE query is issued when removing', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 3 }]])
      .mockResolvedValueOnce([{}]);

    await ChatModel.toggleReaction(10, 5, '❤️');

    const [removeSql] = db.query.mock.calls[1];
    expect(removeSql.trim().toUpperCase()).toMatch(/^DELETE/);
  });
});

// ── getReactions ──────────────────────────────────────────────────────────────

describe('ChatModel.getReactions', () => {
  test('returns empty object when messageIds is empty', async () => {
    const result = await ChatModel.getReactions([]);

    expect(result).toEqual({});
    expect(db.query).not.toHaveBeenCalled();
  });

  test('groups reactions by message_id and emoji', async () => {
    db.query.mockResolvedValue([[
      { message_id: 1, emoji: '👍', user_id: 5, user_name: 'Alice' },
      { message_id: 1, emoji: '👍', user_id: 9, user_name: 'Bob' },
      { message_id: 2, emoji: '❤️',  user_id: 5, user_name: 'Alice' },
    ]]);

    const result = await ChatModel.getReactions([1, 2]);

    expect(result[1]['👍']).toHaveLength(2);
    expect(result[2]['❤️']).toHaveLength(1);
  });
});

// ── sendCallMessage ───────────────────────────────────────────────────────────

describe('ChatModel.sendCallMessage', () => {
  function setupInsertAndFetch(row) {
    db.query
      .mockResolvedValueOnce([{ insertId: 1 }])  // INSERT
      .mockResolvedValueOnce([{}])                 // UPDATE timestamp
      .mockResolvedValueOnce([[row]]);              // SELECT
  }

  test('uses "Outgoing call" label for call_outgoing', async () => {
    setupInsertAndFetch({ id: 1, content: 'Outgoing call' });

    await ChatModel.sendCallMessage({ conversation_id: 1, sender_id: 5, message_type: 'call_outgoing' });

    const [, params] = db.query.mock.calls[0];
    expect(params[2]).toContain('Outgoing call');
  });

  test('uses "Missed call" label for call_missed', async () => {
    setupInsertAndFetch({ id: 1, content: 'Missed call' });

    await ChatModel.sendCallMessage({ conversation_id: 1, sender_id: 5, message_type: 'call_missed' });

    const [, params] = db.query.mock.calls[0];
    expect(params[2]).toContain('Missed call');
  });

  test('appends formatted duration when call_duration is provided', async () => {
    setupInsertAndFetch({ id: 1 });

    await ChatModel.sendCallMessage({
      conversation_id: 1, sender_id: 5, message_type: 'call_outgoing', call_duration: 90,
    });

    const [, params] = db.query.mock.calls[0];
    expect(params[2]).toContain('1m');
    expect(params[2]).toContain('30s');
  });

  test('does not append duration when call_duration is absent', async () => {
    setupInsertAndFetch({ id: 1 });

    await ChatModel.sendCallMessage({ conversation_id: 1, sender_id: 5, message_type: 'call_outgoing' });

    const [, params] = db.query.mock.calls[0];
    expect(params[2]).not.toContain('(');
  });

  test('returns the fetched message row', async () => {
    const row = { id: 1, content: 'Outgoing call', sender_name: 'Alice' };
    setupInsertAndFetch(row);

    const result = await ChatModel.sendCallMessage({
      conversation_id: 1, sender_id: 5, message_type: 'call_outgoing',
    });

    expect(result).toEqual(row);
  });
});

// ── renameGroup ───────────────────────────────────────────────────────────────

describe('ChatModel.renameGroup', () => {
  test('throws when conversation does not exist', async () => {
    db.query.mockResolvedValue([[undefined]]);

    await expect(ChatModel.renameGroup(99, 'New', 1, 'LOCAL_ADMIN')).rejects.toThrow('Conversation not found');
  });

  test('throws when conversation type is not group', async () => {
    db.query.mockResolvedValue([[{ type: 'direct', created_by: 1 }]]);

    await expect(ChatModel.renameGroup(5, 'New', 1, 'LOCAL_ADMIN')).rejects.toThrow('rename group');
  });

  test('throws when caller is neither creator nor admin', async () => {
    db.query.mockResolvedValue([[{ type: 'group', created_by: 99 }]]); // creator is 99

    await expect(ChatModel.renameGroup(5, 'New', 5, 'LOCAL_USER')).rejects.toThrow('admin can rename');
  });

  test('throws when new name is empty', async () => {
    db.query.mockResolvedValue([[{ type: 'group', created_by: 1 }]]);

    await expect(ChatModel.renameGroup(5, '   ', 1, 'LOCAL_ADMIN')).rejects.toThrow('empty');
  });

  test('updates the name when creator renames', async () => {
    db.query
      .mockResolvedValueOnce([[{ type: 'group', created_by: 5 }]])
      .mockResolvedValueOnce([{}]);

    await ChatModel.renameGroup(5, 'New Name', 5, 'LOCAL_USER');

    const [updateSql, params] = db.query.mock.calls[1];
    expect(updateSql).toContain('SET name = ?');
    expect(params[0]).toBe('New Name');
  });
});

// ── toggleMute ────────────────────────────────────────────────────────────────

describe('ChatModel.toggleMute', () => {
  test('throws when user is not a participant', async () => {
    db.query.mockResolvedValue([[undefined]]);

    await expect(ChatModel.toggleMute(5, 10)).rejects.toThrow('Not a participant');
  });

  test('returns { muted: true } when toggling from unmuted', async () => {
    db.query
      .mockResolvedValueOnce([[{ is_muted: 0 }]])
      .mockResolvedValueOnce([{}]);

    const result = await ChatModel.toggleMute(5, 10);

    expect(result).toEqual({ muted: true });
  });

  test('returns { muted: false } when toggling from muted', async () => {
    db.query
      .mockResolvedValueOnce([[{ is_muted: 1 }]])
      .mockResolvedValueOnce([{}]);

    const result = await ChatModel.toggleMute(5, 10);

    expect(result).toEqual({ muted: false });
  });
});

// ── leaveGroup ────────────────────────────────────────────────────────────────

describe('ChatModel.leaveGroup', () => {
  test('throws when conversation does not exist', async () => {
    db.query.mockResolvedValue([[undefined]]);

    await expect(ChatModel.leaveGroup(5, 10)).rejects.toThrow('Conversation not found');
  });

  test('throws when conversation type is not group', async () => {
    db.query.mockResolvedValue([[{ type: 'direct', created_by: 1 }]]);

    await expect(ChatModel.leaveGroup(5, 10)).rejects.toThrow('leave group');
  });

  test('throws when user is not a participant', async () => {
    db.query
      .mockResolvedValueOnce([[{ type: 'group', created_by: 1 }]])
      .mockResolvedValueOnce([[]]); // isParticipant → false

    await expect(ChatModel.leaveGroup(5, 10)).rejects.toThrow('not a member');
  });

  test('removes the user from participants', async () => {
    db.query
      .mockResolvedValueOnce([[{ type: 'group', created_by: 1 }]])     // conv
      .mockResolvedValueOnce([[{ 1: 1 }]])                               // isParticipant → true
      .mockResolvedValueOnce([{}])                                       // DELETE participant
      .mockResolvedValueOnce([[{ cnt: 2 }]]);                            // COUNT remaining

    await ChatModel.leaveGroup(5, 10);

    const [deleteSql] = db.query.mock.calls[2];
    expect(deleteSql).toContain('DELETE FROM chat_participants');
  });

  test('deletes the conversation when last member leaves', async () => {
    db.query
      .mockResolvedValueOnce([[{ type: 'group', created_by: 1 }]])
      .mockResolvedValueOnce([[{ 1: 1 }]])  // isParticipant
      .mockResolvedValueOnce([{}])           // DELETE participant
      .mockResolvedValueOnce([[{ cnt: 0 }]]) // no members left
      .mockResolvedValueOnce([{}])           // DELETE messages
      .mockResolvedValueOnce([{}]);          // DELETE conversation

    await ChatModel.leaveGroup(5, 10);

    const callSqls = db.query.mock.calls.map(([sql]) => sql);
    expect(callSqls.some(s => s.includes('DELETE FROM chat_messages'))).toBe(true);
    expect(callSqls.some(s => s.includes('DELETE FROM chat_conversations'))).toBe(true);
  });
});

// ── deleteGroup ───────────────────────────────────────────────────────────────

describe('ChatModel.deleteGroup', () => {
  test('throws when conversation does not exist', async () => {
    db.query.mockResolvedValue([[undefined]]);

    await expect(ChatModel.deleteGroup(5, 1, 'LOCAL_ADMIN')).rejects.toThrow('Conversation not found');
  });

  test('throws when caller is neither creator nor admin', async () => {
    db.query.mockResolvedValue([[{ type: 'group', created_by: 99 }]]);

    await expect(ChatModel.deleteGroup(5, 7, 'LOCAL_USER')).rejects.toThrow('admin can delete');
  });

  test('deletes participants, messages, and conversation on success', async () => {
    db.query
      .mockResolvedValueOnce([[{ type: 'group', created_by: 1 }]])
      .mockResolvedValueOnce([{}])  // DELETE participants
      .mockResolvedValueOnce([{}])  // DELETE messages
      .mockResolvedValueOnce([{}]); // DELETE conversation

    await ChatModel.deleteGroup(5, 1, 'LOCAL_USER');

    expect(db.query).toHaveBeenCalledTimes(4);
    const sqls = db.query.mock.calls.map(([sql]) => sql);
    expect(sqls[1]).toContain('DELETE FROM chat_participants');
    expect(sqls[2]).toContain('DELETE FROM chat_messages');
    expect(sqls[3]).toContain('DELETE FROM chat_conversations');
  });
});

// ── removeMember ──────────────────────────────────────────────────────────────

describe('ChatModel.removeMember', () => {
  test('throws when trying to remove the group creator', async () => {
    db.query.mockResolvedValue([[{ type: 'group', created_by: 10 }]]); // target IS creator

    await expect(ChatModel.removeMember(5, 10, 1, 'LOCAL_ADMIN')).rejects.toThrow('creator cannot be removed');
  });

  test('throws when target user is not in the group', async () => {
    db.query
      .mockResolvedValueOnce([[{ type: 'group', created_by: 1 }]])
      .mockResolvedValueOnce([[]]); // isParticipant → false

    await expect(ChatModel.removeMember(5, 99, 1, 'LOCAL_ADMIN')).rejects.toThrow('not a member');
  });

  test('removes the member when authorised', async () => {
    db.query
      .mockResolvedValueOnce([[{ type: 'group', created_by: 1 }]])
      .mockResolvedValueOnce([[{ 1: 1 }]])  // isParticipant
      .mockResolvedValueOnce([{}]);           // DELETE

    await ChatModel.removeMember(5, 20, 1, 'LOCAL_USER');

    const [removeSql, params] = db.query.mock.calls[2];
    expect(removeSql).toContain('DELETE FROM chat_participants');
    expect(params).toContain(20); // targetUserId
  });
});
