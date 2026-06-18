jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db       = require('../../config/db');
const Download = require('../../models/Download');

// ── getAll ────────────────────────────────────────────────────────────────────

describe('Download.getAll', () => {
  test('returns all rows when no search term given', async () => {
    const rows = [{ id: 1, name: 'SRS' }, { id: 2, name: 'Changelog' }];
    db.query.mockResolvedValue([rows]);

    const result = await Download.getAll();

    expect(result).toEqual(rows);
  });

  test('does not add WHERE clause when search is empty', async () => {
    db.query.mockResolvedValue([[]]);

    await Download.getAll('');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toContain('WHERE');
    expect(params).toHaveLength(0);
  });

  test('adds LIKE WHERE clause when search term provided', async () => {
    db.query.mockResolvedValue([[]]);

    await Download.getAll('report');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('WHERE name LIKE ?');
    expect(params).toEqual(['%report%', '%report%', '%report%']);
  });

  test('orders by name ASC then created_at DESC', async () => {
    db.query.mockResolvedValue([[]]);

    await Download.getAll();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY name ASC, created_at DESC');
  });
});

// ── getPublicFiles ────────────────────────────────────────────────────────────

describe('Download.getPublicFiles', () => {
  test('returns only public and enabled files', async () => {
    const rows = [{ id: 1, name: 'Public Doc' }];
    db.query.mockResolvedValue([rows]);

    const result = await Download.getPublicFiles();

    expect(result).toEqual(rows);
  });

  test('filters by is_public = 1 AND is_disabled = 0', async () => {
    db.query.mockResolvedValue([[]]);

    await Download.getPublicFiles();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('is_public = 1');
    expect(sql).toContain('is_disabled = 0');
  });
});

// ── getPublicById ─────────────────────────────────────────────────────────────

describe('Download.getPublicById', () => {
  test('returns the row when it is public and enabled', async () => {
    const row = { id: 5, name: 'Doc', is_public: 1, is_disabled: 0 };
    db.query.mockResolvedValue([[row]]);

    const result = await Download.getPublicById(5);

    expect(result).toEqual(row);
  });

  test('returns null when not found', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await Download.getPublicById(999);

    expect(result).toBeNull();
  });

  test('query includes is_public = 1 AND is_disabled = 0 guard', async () => {
    db.query.mockResolvedValue([[]]);

    await Download.getPublicById(1);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('is_public = 1');
    expect(sql).toContain('is_disabled = 0');
    expect(params[0]).toBe(1);
  });
});

// ── getById ───────────────────────────────────────────────────────────────────

describe('Download.getById', () => {
  test('returns the row when found', async () => {
    const row = { id: 3, name: 'Invoice' };
    db.query.mockResolvedValue([[row]]);

    const result = await Download.getById(3);

    expect(result).toEqual(row);
  });

  test('returns null when not found', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await Download.getById(999);

    expect(result).toBeNull();
  });
});

// ── create ────────────────────────────────────────────────────────────────────

describe('Download.create', () => {
  test('returns the insertId', async () => {
    db.query.mockResolvedValue([{ insertId: 10 }]);

    const id = await Download.create({
      name: 'Policy', original_name: 'policy.pdf', stored_name: 'abc.pdf',
      file_size: 1024, mime_type: 'application/pdf',
      uploaded_by: 1, uploader_name: 'Admin', uploader_side: 'LOCAL', is_public: true,
    });

    expect(id).toBe(10);
  });

  test('always sets drive_file_id to NULL in the INSERT', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await Download.create({
      name: 'Doc', original_name: 'doc.pdf', stored_name: 's.pdf',
      file_size: 512, mime_type: 'application/pdf',
      uploaded_by: 1, uploader_name: 'U', uploader_side: 'LOCAL', is_public: false,
    });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('drive_file_id, ');
    expect(sql).toContain('NULL,');
  });

  test('coerces is_public=true to 1', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await Download.create({
      name: 'D', original_name: 'o.pdf', stored_name: 's.pdf',
      file_size: 100, mime_type: 'application/pdf',
      uploaded_by: 1, uploader_name: 'U', uploader_side: 'LOCAL', is_public: true,
    });

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(1);
  });

  test('coerces is_public=false to 0', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await Download.create({
      name: 'D', original_name: 'o.pdf', stored_name: 's.pdf',
      file_size: 100, mime_type: 'application/pdf',
      uploaded_by: 1, uploader_name: 'U', uploader_side: 'LOCAL', is_public: false,
    });

    const [, params] = db.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(0);
  });

  test('defaults description and version to null', async () => {
    db.query.mockResolvedValue([{ insertId: 1 }]);

    await Download.create({
      name: 'D', original_name: 'o.pdf', stored_name: 's.pdf',
      file_size: 100, mime_type: 'application/pdf',
      uploaded_by: 1, uploader_name: 'U', uploader_side: 'LOCAL', is_public: false,
    });

    const [, params] = db.query.mock.calls[0];
    expect(params[1]).toBeNull(); // description
    expect(params[2]).toBeNull(); // version
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('Download.update', () => {
  test('passes name, description, version, and id', async () => {
    db.query.mockResolvedValue([{}]);

    await Download.update(5, { name: 'Updated', description: 'New desc', version: '2.0' });

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual(['Updated', 'New desc', '2.0', 5]);
  });

  test('defaults description to null when not provided', async () => {
    db.query.mockResolvedValue([{}]);

    await Download.update(3, { name: 'File' });

    const [, params] = db.query.mock.calls[0];
    expect(params[1]).toBeNull();
  });

  test('defaults version to null when not provided', async () => {
    db.query.mockResolvedValue([{}]);

    await Download.update(3, { name: 'File' });

    const [, params] = db.query.mock.calls[0];
    expect(params[2]).toBeNull();
  });
});

// ── updateDriveId ─────────────────────────────────────────────────────────────

describe('Download.updateDriveId', () => {
  test('sets drive_file_id for the given id', async () => {
    db.query.mockResolvedValue([{}]);

    await Download.updateDriveId(7, 'drive-abc-123');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('drive_file_id = ?');
    expect(params).toEqual(['drive-abc-123', 7]);
  });
});

// ── clearLocalFile ────────────────────────────────────────────────────────────

describe('Download.clearLocalFile', () => {
  test('sets stored_name = NULL for the given id', async () => {
    db.query.mockResolvedValue([{}]);

    await Download.clearLocalFile(4);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('stored_name = NULL');
    expect(params).toEqual([4]);
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe('Download.delete', () => {
  test('returns null when the record does not exist', async () => {
    db.query.mockResolvedValue([[]]);

    const result = await Download.delete(999);

    expect(result).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1); // SELECT only, no DELETE
  });

  test('returns {stored_name, drive_file_id} after successful delete', async () => {
    const row = { stored_name: 'abc.pdf', drive_file_id: 'drive-x' };
    db.query
      .mockResolvedValueOnce([[row]])  // SELECT
      .mockResolvedValueOnce([{}]);    // DELETE

    const result = await Download.delete(5);

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('issues DELETE after finding the record', async () => {
    db.query
      .mockResolvedValueOnce([[{ stored_name: 'f.pdf', drive_file_id: null }]])
      .mockResolvedValueOnce([{}]);

    await Download.delete(8);

    const [deleteSql, deleteParams] = db.query.mock.calls[1];
    expect(deleteSql.trim().toUpperCase()).toMatch(/^DELETE/);
    expect(deleteParams).toEqual([8]);
  });
});

// ── toggleDisabled / togglePublic ─────────────────────────────────────────────

describe('Download.toggleDisabled', () => {
  test('returns the new is_disabled value', async () => {
    db.query
      .mockResolvedValueOnce([{}])                     // UPDATE
      .mockResolvedValueOnce([[{ is_disabled: 1 }]]);  // SELECT

    const result = await Download.toggleDisabled(3);

    expect(result).toBe(1);
  });

  test('UPDATE uses NOT is_disabled', async () => {
    db.query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ is_disabled: 0 }]]);

    await Download.toggleDisabled(5);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('NOT is_disabled');
    expect(params).toEqual([5]);
  });
});

describe('Download.togglePublic', () => {
  test('returns the new is_public value', async () => {
    db.query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ is_public: 0 }]]);

    const result = await Download.togglePublic(2);

    expect(result).toBe(0);
  });

  test('UPDATE uses NOT is_public', async () => {
    db.query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ is_public: 1 }]]);

    await Download.togglePublic(6);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('NOT is_public');
    expect(params).toEqual([6]);
  });
});

// ── incrementDownload ─────────────────────────────────────────────────────────

describe('Download.incrementDownload', () => {
  test('increments download_count by 1', async () => {
    db.query.mockResolvedValue([{}]);

    await Download.incrementDownload(9);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('download_count = download_count + 1');
    expect(params).toEqual([9]);
  });
});

// ── getPendingLocalCleanup ────────────────────────────────────────────────────

describe('Download.getPendingLocalCleanup', () => {
  test('returns rows with drive_file_id set and stored_name set', async () => {
    const rows = [{ id: 1, stored_name: 'old.pdf' }];
    db.query.mockResolvedValue([rows]);

    const result = await Download.getPendingLocalCleanup();

    expect(result).toEqual(rows);
  });

  test('SQL requires drive_file_id IS NOT NULL and stored_name IS NOT NULL', async () => {
    db.query.mockResolvedValue([[]]);

    await Download.getPendingLocalCleanup();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('drive_file_id IS NOT NULL');
    expect(sql).toContain('stored_name IS NOT NULL');
    expect(sql).toContain('INTERVAL 1 DAY');
  });
});

// ── getPendingDriveUpload ─────────────────────────────────────────────────────

describe('Download.getPendingDriveUpload', () => {
  test('returns rows where drive_file_id is NULL and stored_name is set', async () => {
    const rows = [{ id: 2, stored_name: 'upload_me.pdf', original_name: 'doc.pdf' }];
    db.query.mockResolvedValue([rows]);

    const result = await Download.getPendingDriveUpload();

    expect(result).toEqual(rows);
  });

  test('SQL requires drive_file_id IS NULL and stored_name IS NOT NULL', async () => {
    db.query.mockResolvedValue([[]]);

    await Download.getPendingDriveUpload();

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('drive_file_id IS NULL');
    expect(sql).toContain('stored_name IS NOT NULL');
  });
});
