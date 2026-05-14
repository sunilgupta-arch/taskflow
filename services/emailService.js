const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Transporter — created once, reused across all sends
// Prefers OAuth2 (GMAIL_REFRESH_TOKEN) over App Password (MAIL_PASS)
// ---------------------------------------------------------------------------
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const auth = process.env.GMAIL_REFRESH_TOKEN
    ? {
        type: 'OAuth2',
        user: process.env.MAIL_USER,
        clientId: process.env.GDRIVE_CLIENT_ID,
        clientSecret: process.env.GDRIVE_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      }
    : {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      };

  _transporter = nodemailer.createTransport({ service: 'gmail', auth });
  return _transporter;
}

// ---------------------------------------------------------------------------
// Base HTML wrapper — all notification emails share this shell
// ---------------------------------------------------------------------------
function wrapHtml(title, bodyHtml, maxWidth = '600px') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#f4f4f4; font-family:Arial,sans-serif; }
    .wrapper { max-width:${maxWidth}; margin:32px auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.08); }
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

// Full-width wrapper — used for wide reports. Fills the email client window
// with a min-width so columns don't collapse on narrow clients.
function wrapHtmlFull(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;min-width:680px">
    <tr><td style="padding:24px 16px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);min-width:648px">
        <tr>
          <td style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0">
            <div style="margin:0;color:#ffffff;font-size:20px;font-weight:600">TaskFlow</div>
            <div style="color:#a0a0b0;font-size:13px;margin-top:2px">Internal Management System</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;color:#333333;font-size:15px;line-height:1.6">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f9;padding:16px 32px;font-size:12px;color:#999999;border-top:1px solid #eeeeee;border-radius:0 0 8px 8px">
            This is an automated notification from TaskFlow. Do not reply to this email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
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

  dailyRequestsReport({ reportDate, stats, requests }) {
    const fmt = d => { if (!d) return '—'; const p = d.split('-'), m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${m[parseInt(p[1])-1]} ${parseInt(p[2])}, ${p[0]}`; };
    const subject = `Daily Requests Report — ${fmt(reportDate)}`;

    const card = (label, count, color) =>
      `<td style="text-align:center;padding:16px 8px;background:${color}18;border-radius:8px;width:16.6%">
        <div style="font-size:26px;font-weight:700;color:${color}">${count}</div>
        <div style="font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:.5px">${label}</div>
      </td>`;

    const statusStyle = s => {
      const map = { open:'#f97316', picked:'#3b82f6', done:'#10b981', missed:'#ef4444', rescheduled:'#8b5cf6', approved:'#10b981', rejected:'#f43f5e', cancelled:'#4b5563' };
      return `display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${(map[s]||'#888')}20;color:${map[s]||'#888'};text-transform:uppercase;letter-spacing:.4px`;
    };
    const statusLabel = s => ({ open:'Open', picked:'In Progress', done:'Done', missed:'Missed', rescheduled:'Rescheduled', approved:'Approved', rejected:'Rejected', cancelled:'Cancelled' }[s] || s);
    const priorityColor = p => ({ high:'#f97316', urgent:'#ef4444' }[p] || '#888');

    const rows = (requests || []).map((r, i) =>
      `<tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:10px 8px;text-align:center;color:#999;font-size:12px">${i + 1}</td>
        <td style="padding:10px 8px">
          <div style="font-weight:600;font-size:13px;color:#1a1a2e">${r.title || '—'}</div>
          ${r.description ? `<div style="font-size:11px;color:#888;margin-top:2px">${r.description.substring(0, 80)}${r.description.length > 80 ? '…' : ''}</div>` : ''}
        </td>
        <td style="padding:10px 8px;font-size:12px;color:#555;white-space:nowrap">${r.created_by_name || '—'}</td>
        <td style="padding:10px 8px"><span style="${statusStyle(r.status)}">${statusLabel(r.status)}</span></td>
        <td style="padding:10px 8px;font-size:12px;white-space:nowrap"><span style="color:${priorityColor(r.priority)};font-weight:600">${(r.priority||'normal').charAt(0).toUpperCase()+(r.priority||'normal').slice(1)}</span></td>
        <td style="padding:10px 8px;font-size:12px;color:#555">${r.picked_by_name || '—'}</td>
        <td style="padding:10px 8px;font-size:11px;color:#777;max-width:180px">${r.latest_comment ? r.latest_comment.substring(0, 80) + (r.latest_comment.length > 80 ? '…' : '') : '—'}</td>
      </tr>`
    ).join('');

    const html = wrapHtmlFull(subject, `
      <p style="margin:0 0 20px;color:#333">Here is the daily client requests summary for <strong>${fmt(reportDate)}</strong>.</p>

      <table width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate;table-layout:fixed;margin-bottom:28px">
        <tr>
          ${card('Total', stats.total || 0, '#1a1a2e')}
          ${card('Done', stats.done || 0, '#10b981')}
          ${card('In Progress', stats.picked || 0, '#3b82f6')}
          ${card('Open', stats.open || 0, '#f97316')}
          ${card('Missed', stats.missed || 0, '#ef4444')}
          ${card('Rescheduled', stats.rescheduled || 0, '#8b5cf6')}
        </tr>
      </table>

      ${requests && requests.length > 0 ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f5f5f8">
            <th style="padding:8px;text-align:center;font-size:11px;color:#888;font-weight:600;width:32px">#</th>
            <th style="padding:8px;text-align:left;font-size:11px;color:#888;font-weight:600">Request</th>
            <th style="padding:8px;text-align:left;font-size:11px;color:#888;font-weight:600">Created By</th>
            <th style="padding:8px;text-align:left;font-size:11px;color:#888;font-weight:600">Status</th>
            <th style="padding:8px;text-align:left;font-size:11px;color:#888;font-weight:600">Priority</th>
            <th style="padding:8px;text-align:left;font-size:11px;color:#888;font-weight:600">Handled By</th>
            <th style="padding:8px;text-align:left;font-size:11px;color:#888;font-weight:600">Latest Comment</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>` : '<p style="color:#999;text-align:center;padding:20px 0">No requests were recorded for this date.</p>'}
    `);

    const text = `Daily Requests Report — ${fmt(reportDate)}\n\nTotal: ${stats.total||0} | Done: ${stats.done||0} | In Progress: ${stats.picked||0} | Open: ${stats.open||0} | Missed: ${stats.missed||0}${(stats.rescheduled||0)>0?' | Rescheduled: '+stats.rescheduled:''}\n\n`
      + (requests||[]).map((r,i) => `${i+1}. [${(r.status||'').toUpperCase()}] ${r.title} — ${r.org_name||''} (${r.picked_by_name||'unassigned'})`).join('\n');

    return { subject, html, text };
  },

  requestRescheduled({ creatorName, requestTitle, newDate, rescheduledBy, reason }) {
    const subject = `Your request has been rescheduled: ${requestTitle}`;
    const html = wrapHtml(subject, `
      <p>Hi ${creatorName},</p>
      <p>Your request has been rescheduled to a new date by our team.</p>
      <p><span class="label">Request</span>&nbsp; ${requestTitle}</p>
      <p><span class="label">New Date</span>&nbsp; ${newDate}</p>
      ${rescheduledBy ? `<p><span class="label">Rescheduled by</span>&nbsp; ${rescheduledBy}</p>` : ''}
      ${reason ? `<hr class="divider"><p><span class="label">Reason</span></p><p>${reason}</p>` : ''}
    `);
    const text = `Hi ${creatorName},\n\nYour request "${requestTitle}" has been rescheduled to ${newDate}.${rescheduledBy ? `\nRescheduled by: ${rescheduledBy}` : ''}${reason ? `\nReason: ${reason}` : ''}`;
    return { subject, html, text };
  },

};

// ---------------------------------------------------------------------------
// Core send method
// Always non-blocking — logs errors but never throws so callers don't crash
// ---------------------------------------------------------------------------
class EmailService {

  static async send({ to, templateName, templateData }) {
    if (process.env.MAIL_ENABLED !== 'true') {
      logger.info(`EmailService: MAIL_ENABLED is not true — skipped "${templateName}" to ${to}`);
      return;
    }
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
