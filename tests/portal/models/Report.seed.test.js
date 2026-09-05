jest.mock('../../../config/db', () => ({ query: jest.fn() }));
jest.mock('../../../config/portalDefaultLinks', () => ({ getDefaultLinksForRole: jest.fn() }));

const db = require('../../../config/db');
const { getDefaultLinksForRole } = require('../../../config/portalDefaultLinks');
const PortalReport = require('../../../portal/models/Report');

const LINK_A = { key: 'CLIENT_USER:alpha', name: 'Alpha', url: 'https://a.example', color: 'blue' };
const LINK_B = { key: 'ALL:beta', name: 'Beta', url: 'https://b.example', color: 'green' };

// create() runs a MAX(sort_order) SELECT then an INSERT
const mockCreateOk = () => {
  db.query
    .mockResolvedValueOnce([[{ maxOrder: 0 }]])
    .mockResolvedValueOnce([{ insertId: 10 }]);
};

beforeEach(() => {
  db.query.mockReset();
  getDefaultLinksForRole.mockReset();
});

describe('PortalReport.seedDefaultsForUser', () => {
  test('does nothing when the role has no defaults', async () => {
    getDefaultLinksForRole.mockReturnValue([]);

    const added = await PortalReport.seedDefaultsForUser(5, 'CLIENT_USER');

    expect(added).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('creates a link for a default the user has never been given', async () => {
    getDefaultLinksForRole.mockReturnValue([LINK_A]);
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // seed claimed
    mockCreateOk();

    const added = await PortalReport.seedDefaultsForUser(5, 'CLIENT_USER');

    expect(added).toBe(1);
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT IGNORE INTO portal_report_seeds'),
      [5, 'CLIENT_USER:alpha']
    );
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO portal_reports'),
      [5, 'Alpha', 'https://a.example', 'blue', 1]
    );
  });

  test('skips a default the user already received — deletes stay deleted', async () => {
    getDefaultLinksForRole.mockReturnValue([LINK_A]);
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]); // seed row already there

    const added = await PortalReport.seedDefaultsForUser(5, 'CLIENT_USER');

    expect(added).toBe(0);
    expect(db.query).toHaveBeenCalledTimes(1); // claim only, no link created
  });

  test('seeds only the new one when a second link is added later', async () => {
    getDefaultLinksForRole.mockReturnValue([LINK_A, LINK_B]);
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]); // A: already seeded
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // B: new
    mockCreateOk();

    const added = await PortalReport.seedDefaultsForUser(5, 'CLIENT_USER');

    expect(added).toBe(1);
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO portal_reports'),
      [5, 'Beta', 'https://b.example', 'green', 1]
    );
  });
});
