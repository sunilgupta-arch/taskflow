const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Transporter — created once, reused across all sends
// ---------------------------------------------------------------------------
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
  return _transporter;
}

// ---------------------------------------------------------------------------
// Base HTML wrapper — all notification emails share this shell
// ---------------------------------------------------------------------------
function wrapHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#f4f4f4; font-family:Arial,sans-serif; }
    .wrapper { max-width:600px; margin:32px auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.08); }
    .header { background:#1a1a2e; padding:24px 32px; }
    .header h1 { margin:0; color:#ffffff; font-size:20px; font-weight:600; }
    .header span { color:#a0a0b0; font-size:13px; }
    .body { padding:28px 32px; color:#333333; font-size:15px; line-height:1.6; }
    .body p { margin:0 0 16px; }
    .label { display:inline-block; background:#f0f0f5; border-radius:4px; padding:2px 10px; font-size:13px; color:#555; font-weight:600; }
    .divider { border:none; border-top:1px solid #eeeeee; margin:20px 0; }
    .btn { display:inline-block; background:#1a1a2e; color:#ffffff !important; text-decoration:none; padding:10px 24px; border-radius:6px; font-size:14px; font-weight:600; margin-top:4px; }
    .footer { background:#f9f9f9; padding:16px 32px; font-size:12px; color:#999999; border-top:1px solid #eeeeee; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>TaskFlow</h1>
      <span>Internal Management System</span>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      This is an automated notification from TaskFlow. Do not reply to this email.
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Templates
// Each returns { subject, html, text }
// ---------------------------------------------------------------------------
const templates = {

  generic({ title, message, link, linkLabel }) {
    const subject = title;
    const html = wrapHtml(title, `
      <p><strong>${title}</strong></p>
      <p>${message}</p>
      ${link ? `<hr class="divider"><a class="btn" href="${link}">${linkLabel || 'View Details'}</a>` : ''}
    `);
    const text = `${title}\n\n${message}${link ? `\n\n${linkLabel || 'View Details'}: ${link}` : ''}`;
    return { subject, html, text };
  },

  taskAssigned({ taskTitle, assignedBy, dueDate, link }) {
    const subject = `Task Assigned: ${taskTitle}`;
    const html = wrapHtml(subject, `
      <p>You have been assigned a new task.</p>
      <p><span class="label">Task</span>&nbsp; ${taskTitle}</p>
      ${assignedBy ? `<p><span class="label">Assigned by</span>&nbsp; ${assignedBy}</p>` : ''}
      ${dueDate   ? `<p><span class="label">Due date</span>&nbsp; ${dueDate}</p>` : ''}
      <hr class="divider">
      <a class="btn" href="${link || '#'}">View Task</a>
    `);
    const text = `Task Assigned: ${taskTitle}\n\nYou have been assigned a new task.${assignedBy ? `\nAssigned by: ${assignedBy}` : ''}${dueDate ? `\nDue: ${dueDate}` : ''}`;
    return { subject, html, text };
  },

  leaveUpdate({ userName, fromDate, toDate, status, remark, link }) {
    const statusLabel = status === 'approved' ? 'Approved ✓' : status === 'rejected' ? 'Rejected ✗' : status;
    const subject = `Leave Request ${status === 'approved' ? 'Approved' : 'Rejected'}: ${fromDate} – ${toDate}`;
    const html = wrapHtml(subject, `
      <p>Your leave request has been <strong>${status}</strong>.</p>
      <p><span class="label">Period</span>&nbsp; ${fromDate} – ${toDate}</p>
      <p><span class="label">Status</span>&nbsp; ${statusLabel}</p>
      ${remark ? `<p><span class="label">Remark</span>&nbsp; ${remark}</p>` : ''}
      <hr class="divider">
      <a class="btn" href="${link || '/admin/leaves'}">View Leave</a>
    `);
    const text = `Leave ${status}: ${fromDate} to ${toDate}${remark ? `\nRemark: ${remark}` : ''}`;
    return { subject, html, text };
  },

  leaveRequest({ userName, fromDate, toDate, reason, link }) {
    const subject = `Leave Request from ${userName}: ${fromDate} – ${toDate}`;
    const html = wrapHtml(subject, `
      <p><strong>${userName}</strong> has submitted a leave request.</p>
      <p><span class="label">Period</span>&nbsp; ${fromDate} – ${toDate}</p>
      ${reason ? `<p><span class="label">Reason</span>&nbsp; ${reason}</p>` : ''}
      <hr class="divider">
      <a class="btn" href="${link || '/admin/leaves'}">Review Request</a>
    `);
    const text = `Leave request from ${userName}: ${fromDate} to ${toDate}${reason ? `\nReason: ${reason}` : ''}`;
    return { subject, html, text };
  },

  compOffApplied({ userName, compOffDate, link }) {
    const subject = `Comp-Off Applied by ${userName}`;
    const html = wrapHtml(subject, `
      <p><strong>${userName}</strong> has applied a comp-off day.</p>
      <p><span class="label">Date</span>&nbsp; ${compOffDate}</p>
      <hr class="divider">
      <a class="btn" href="${link || '/admin/attendance'}">View Attendance</a>
    `);
    const text = `${userName} applied a comp-off on ${compOffDate}.`;
    return { subject, html, text };
  },

  halfDayOnOffDay({ userName, link }) {
    const subject = `${userName} is working a half day today (their off day)`;
    const html = wrapHtml(subject, `
      <p><strong>${userName}</strong> has checked in for a half day on their weekly off day.</p>
      <hr class="divider">
      <a class="btn" href="${link || '/admin/attendance'}">View Attendance</a>
    `);
    const text = `${userName} is working a half day on their off day.`;
    return { subject, html, text };
  },

};

// ---------------------------------------------------------------------------
// Core send method
// Always non-blocking — logs errors but never throws so callers don't crash
// ---------------------------------------------------------------------------
class EmailService {

  static async send({ to, templateName, templateData }) {
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
      logger.warn('EmailService: MAIL_USER / MAIL_PASS not configured — skipping email');
      return;
    }

    const builder = templates[templateName];
    if (!builder) {
      logger.error(`EmailService: unknown template "${templateName}"`);
      return;
    }

    const { subject, html, text } = builder(templateData);

    try {
      const info = await getTransporter().sendMail({
        from: `"TaskFlow" <${process.env.MAIL_USER}>`,
        to,
        subject,
        html,
        text,
      });
      logger.info(`EmailService: sent "${subject}" → ${to} (${info.messageId})`);
    } catch (err) {
      logger.error(`EmailService: failed to send "${subject}" → ${to}`, { error: err.message });
    }
  }

  // Convenience: send to multiple recipients at once (one email per recipient)
  static async sendToMany(recipients, templateName, templateData) {
    await Promise.allSettled(
      recipients.map(to => EmailService.send({ to, templateName, templateData }))
    );
  }

}

module.exports = EmailService;
