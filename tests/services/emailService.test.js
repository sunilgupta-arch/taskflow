// ── mock nodemailer BEFORE requiring EmailService ─────────────────────────────
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'msg-001' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const EmailService = require('../../services/emailService');

// ── Env helpers ───────────────────────────────────────────────────────────────

function enableMail() {
  process.env.MAIL_ENABLED = 'true';
  process.env.MAIL_USER    = 'noreply@test.com';
  process.env.MAIL_PASS    = 'test-pass';
}

function disableMail() {
  delete process.env.MAIL_ENABLED;
  delete process.env.MAIL_USER;
  delete process.env.MAIL_PASS;
}

afterEach(() => {
  disableMail();
});

// ── EmailService.send — guard conditions ──────────────────────────────────────

describe('EmailService.send — guards', () => {
  test('skips sending when MAIL_ENABLED is not set to "true"', async () => {
    process.env.MAIL_ENABLED = 'false';

    await EmailService.send({
      to: 'user@test.com',
      templateName: 'generic',
      templateData: { title: 'Hi', message: 'Hello' },
    });

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('skips sending when MAIL_ENABLED is absent', async () => {
    // MAIL_ENABLED not set at all
    await EmailService.send({
      to: 'user@test.com',
      templateName: 'generic',
      templateData: { title: 'Hi', message: 'Hello' },
    });

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('skips sending when MAIL_USER is not configured', async () => {
    process.env.MAIL_ENABLED = 'true';
    delete process.env.MAIL_USER;

    await EmailService.send({
      to: 'user@test.com',
      templateName: 'generic',
      templateData: { title: 'Hi', message: 'Hello' },
    });

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('skips and logs error for an unknown template name', async () => {
    enableMail();
    const logger = require('../../utils/logger');

    await EmailService.send({
      to: 'user@test.com',
      templateName: 'nonExistentTemplate',
      templateData: {},
    });

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('nonExistentTemplate')
    );
  });

  test('does NOT throw when sendMail rejects (non-blocking contract)', async () => {
    enableMail();
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));

    await expect(
      EmailService.send({
        to: 'user@test.com',
        templateName: 'generic',
        templateData: { title: 'Test', message: 'Body' },
      })
    ).resolves.toBeUndefined();
  });

  test('passes the to address to sendMail', async () => {
    enableMail();
    await EmailService.send({
      to: 'recipient@example.com',
      templateName: 'generic',
      templateData: { title: 'T', message: 'M' },
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'recipient@example.com' })
    );
  });
});

// ── Template: generic ─────────────────────────────────────────────────────────

describe('template: generic', () => {
  beforeEach(enableMail);

  test('uses the title as the email subject', async () => {
    await EmailService.send({
      to: 'u@t.com',
      templateName: 'generic',
      templateData: { title: 'System Alert', message: 'Something happened.' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.subject).toBe('System Alert');
  });

  test('includes the message in the plain-text body', async () => {
    await EmailService.send({
      to: 'u@t.com',
      templateName: 'generic',
      templateData: { title: 'Alert', message: 'Disk full on server.' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.text).toContain('Disk full on server.');
  });

  test('includes the link label and URL in plain text when provided', async () => {
    await EmailService.send({
      to: 'u@t.com',
      templateName: 'generic',
      templateData: { title: 'T', message: 'M', link: 'https://app/task/1', linkLabel: 'View Task' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.text).toContain('https://app/task/1');
    expect(mail.text).toContain('View Task');
  });

  test('omits link section from plain text when no link given', async () => {
    await EmailService.send({
      to: 'u@t.com',
      templateName: 'generic',
      templateData: { title: 'T', message: 'M' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.text).not.toContain('http');
  });
});

// ── Template: taskAssigned ────────────────────────────────────────────────────

describe('template: taskAssigned', () => {
  beforeEach(enableMail);

  test('subject includes the task title', async () => {
    await EmailService.send({
      to: 'u@t.com',
      templateName: 'taskAssigned',
      templateData: { taskTitle: 'Fix login bug', link: '/tasks/1' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.subject).toBe('Task Assigned: Fix login bug');
  });

  test('plain text includes assignedBy when provided', async () => {
    await EmailService.send({
      to: 'u@t.com',
      templateName: 'taskAssigned',
      templateData: { taskTitle: 'Deploy', assignedBy: 'Alice', link: '/tasks/1' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.text).toContain('Alice');
  });

  test('plain text includes dueDate when provided', async () => {
    await EmailService.send({
      to: 'u@t.com',
      templateName: 'taskAssigned',
      templateData: { taskTitle: 'Deploy', dueDate: '2024-07-01', link: '/tasks/1' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.text).toContain('2024-07-01');
  });

  test('does not throw when optional fields are omitted', async () => {
    await expect(
      EmailService.send({
        to: 'u@t.com',
        templateName: 'taskAssigned',
        templateData: { taskTitle: 'Task' },
      })
    ).resolves.toBeUndefined();
  });
});

// ── Template: leaveUpdate ─────────────────────────────────────────────────────

describe('template: leaveUpdate', () => {
  beforeEach(enableMail);

  const base = { userName: 'Bob', fromDate: '2024-07-01', toDate: '2024-07-05' };

  test('subject says "Approved" when status is approved', async () => {
    await EmailService.send({
      to: 'u@t.com',
      templateName: 'leaveUpdate',
      templateData: { ...base, status: 'approved' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.subject).toContain('Approved');
    expect(mail.subject).not.toContain('Rejected');
  });

  test('subject says "Rejected" when status is rejected', async () => {
    await EmailService.send({
      to: 'u@t.com',
      templateName: 'leaveUpdate',
      templateData: { ...base, status: 'rejected' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.subject).toContain('Rejected');
  });

  test('plain text includes the date range', async () => {
    await EmailService.send({
      to: 'u@t.com',
      templateName: 'leaveUpdate',
      templateData: { ...base, status: 'approved' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.text).toContain('2024-07-01');
    expect(mail.text).toContain('2024-07-05');
  });

  test('includes remark in plain text when provided', async () => {
    await EmailService.send({
      to: 'u@t.com',
      templateName: 'leaveUpdate',
      templateData: { ...base, status: 'approved', remark: 'Enjoy your break' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.text).toContain('Enjoy your break');
  });
});

// ── Template: leaveRequest ────────────────────────────────────────────────────

describe('template: leaveRequest', () => {
  beforeEach(enableMail);

  test('subject includes the user name and date range', async () => {
    await EmailService.send({
      to: 'manager@t.com',
      templateName: 'leaveRequest',
      templateData: { userName: 'Charlie', fromDate: '2024-08-01', toDate: '2024-08-03' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.subject).toContain('Charlie');
    expect(mail.subject).toContain('2024-08-01');
  });

  test('plain text includes the reason when provided', async () => {
    await EmailService.send({
      to: 'manager@t.com',
      templateName: 'leaveRequest',
      templateData: { userName: 'Charlie', fromDate: '2024-08-01', toDate: '2024-08-03', reason: 'Family event' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.text).toContain('Family event');
  });
});

// ── Template: compOffApplied ──────────────────────────────────────────────────

describe('template: compOffApplied', () => {
  beforeEach(enableMail);

  test('subject includes the user name', async () => {
    await EmailService.send({
      to: 'admin@t.com',
      templateName: 'compOffApplied',
      templateData: { userName: 'Dana', compOffDate: '2024-06-15' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.subject).toContain('Dana');
  });

  test('plain text includes the comp-off date', async () => {
    await EmailService.send({
      to: 'admin@t.com',
      templateName: 'compOffApplied',
      templateData: { userName: 'Dana', compOffDate: '2024-06-15' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.text).toContain('2024-06-15');
  });
});

// ── Template: halfDayOnOffDay ─────────────────────────────────────────────────

describe('template: halfDayOnOffDay', () => {
  beforeEach(enableMail);

  test('subject includes the user name', async () => {
    await EmailService.send({
      to: 'admin@t.com',
      templateName: 'halfDayOnOffDay',
      templateData: { userName: 'Eve' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.subject).toContain('Eve');
  });
});

// ── Template: requestRescheduled ──────────────────────────────────────────────

describe('template: requestRescheduled', () => {
  beforeEach(enableMail);

  test('subject includes the request title', async () => {
    await EmailService.send({
      to: 'client@t.com',
      templateName: 'requestRescheduled',
      templateData: { creatorName: 'Frank', requestTitle: 'Logo Design', newDate: '2024-09-01' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.subject).toContain('Logo Design');
  });

  test('plain text includes the new date and creator name', async () => {
    await EmailService.send({
      to: 'client@t.com',
      templateName: 'requestRescheduled',
      templateData: { creatorName: 'Frank', requestTitle: 'Logo Design', newDate: '2024-09-01' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.text).toContain('2024-09-01');
    expect(mail.text).toContain('Frank');
  });

  test('includes reason in plain text when provided', async () => {
    await EmailService.send({
      to: 'client@t.com',
      templateName: 'requestRescheduled',
      templateData: { creatorName: 'Frank', requestTitle: 'Logo', newDate: '2024-09-01', reason: 'Team unavailable' },
    });

    const [mail] = mockSendMail.mock.calls[0];
    expect(mail.text).toContain('Team unavailable');
  });
});

// ── EmailService.sendToMany ───────────────────────────────────────────────────

describe('EmailService.sendToMany', () => {
  beforeEach(enableMail);

  test('calls sendMail once per recipient', async () => {
    await EmailService.sendToMany(
      ['a@t.com', 'b@t.com', 'c@t.com'],
      'generic',
      { title: 'Broadcast', message: 'Hello everyone' }
    );

    expect(mockSendMail).toHaveBeenCalledTimes(3);
  });

  test('does not throw when one recipient fails', async () => {
    mockSendMail
      .mockRejectedValueOnce(new Error('bounce'))
      .mockResolvedValue({ messageId: 'ok' });

    await expect(
      EmailService.sendToMany(
        ['bad@t.com', 'good@t.com'],
        'generic',
        { title: 'T', message: 'M' }
      )
    ).resolves.toBeUndefined();
  });

  test('delivers to all recipients even if some fail', async () => {
    mockSendMail
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue({ messageId: 'ok' });

    await EmailService.sendToMany(
      ['fail@t.com', 'ok@t.com'],
      'generic',
      { title: 'T', message: 'M' }
    );

    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });
});
