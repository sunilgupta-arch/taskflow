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

  monthlyRequestsReport({ yearMonth, stats, requests, employees }) {
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const [y, m] = yearMonth.split('-');
    const monthLabel = `${monthNames[parseInt(m) - 1]} ${y}`;
    const subject = `Monthly Requests Report — ${monthLabel}`;

    const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const card = (label, value, color, sub) =>
      `<td style="text-align:center;padding:14px 8px;background:${color}15;border-radius:10px;border:1px solid ${color}30;vertical-align:top">
        <div style="font-size:26px;font-weight:700;color:${color};line-height:1">${value}</div>
        <div style="font-size:10px;color:#555;margin-top:5px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;font-weight:600">${label}</div>
        ${sub ? `<div style="font-size:10px;color:#999;margin-top:2px">${sub}</div>` : ''}
      </td>
      <td style="width:8px"></td>`;

    const statusColor = { open:'#f97316', picked:'#3b82f6', done:'#10b981', missed:'#ef4444', rescheduled:'#8b5cf6', approved:'#059669', rejected:'#f43f5e', cancelled:'#6b7280' };
    const statusLabel = { open:'Open', picked:'In Progress', done:'Done', missed:'Missed', rescheduled:'Rescheduled', approved:'Approved ✓', rejected:'Rejected ✗', cancelled:'Cancelled' };
    const statusBadge = s => {
      const c = statusColor[s] || '#888';
      return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:${c}20;color:${c};text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">${statusLabel[s]||s}</span>`;
    };
    const priorityColor = p => ({ urgent:'#ef4444', high:'#f97316', normal:'#6b7280' }[p] || '#6b7280');
    const priorityLabel = p => ({ urgent:'🔴 Urgent', high:'🟠 High', normal:'Normal' }[p] || p);
    const recLabel     = r => ({ none:'One-time', daily:'Daily', weekly:'Weekly', monthly:'Monthly' }[r] || r);
    const fmtDate = d => {
      if (!d) return '—';
      const p = String(d).split('T')[0].split('-');
      const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${mn[parseInt(p[1])-1]} ${parseInt(p[2])}`;
    };
    const fmtDateTime = d => {
      if (!d) return '—';
      const dt = new Date(d);
      const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${mn[dt.getMonth()]} ${dt.getDate()}, ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    };
    const fmtTime = t => t ? String(t).substring(0, 5) : '—';

    const resolved  = (stats.done || 0) + (stats.approved || 0);
    const notPicked = (stats.open || 0) + (stats.missed || 0);
    const rate      = stats.completionRate || 0;

    // ── Completion rate bar ──────────────────────────────────────────────
    const rateBar = `
      <div style="margin:0 0 28px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:12px;font-weight:700;color:#333;text-transform:uppercase;letter-spacing:.5px">Completion Rate</span>
          <span style="font-size:20px;font-weight:700;color:${rate >= 70 ? '#059669' : rate >= 40 ? '#f97316' : '#ef4444'}">${rate}%</span>
        </div>
        <div style="background:#e5e7eb;border-radius:6px;height:10px;overflow:hidden">
          <div style="height:10px;border-radius:6px;width:${rate}%;background:${rate >= 70 ? '#059669' : rate >= 40 ? '#f97316' : '#ef4444'};max-width:100%"></div>
        </div>
        <div style="font-size:11px;color:#888;margin-top:5px">${resolved} resolved out of ${stats.total||0} total requests</div>
      </div>`;

    // ── Alert banners ────────────────────────────────────────────────────
    const alerts = [];
    if ((stats.missed || 0) > 0) alerts.push(`<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:10px 14px;border-radius:4px;margin-bottom:8px;font-size:12px;color:#991b1b"><strong>${stats.missed} request${stats.missed>1?'s':''} were missed</strong> — not picked up within the scheduled day.</div>`);
    if ((stats.rejected || 0) > 0) alerts.push(`<div style="background:#fff7ed;border-left:4px solid #f43f5e;padding:10px 14px;border-radius:4px;margin-bottom:8px;font-size:12px;color:#9f1239"><strong>${stats.rejected} request${stats.rejected>1?'s':''} were rejected</strong> by the client — rework required.</div>`);
    if ((stats.open || 0) > 0) alerts.push(`<div style="background:#fffbeb;border-left:4px solid #f97316;padding:10px 14px;border-radius:4px;margin-bottom:8px;font-size:12px;color:#92400e"><strong>${stats.open} request${stats.open>1?'s':''} still open</strong> — not yet picked up.</div>`);

    // ── Employee performance table ────────────────────────────────────────
    const empTable = employees && employees.length > 0 ? `
      <div style="margin-bottom:28px">
        <div style="font-size:13px;font-weight:700;color:#1a1a2e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e5e7eb">Team Performance</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#f5f5f8">
              <th style="padding:8px 10px;text-align:left;font-size:10px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Team Member</th>
              <th style="padding:8px 10px;text-align:center;font-size:10px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Total Picked</th>
              <th style="padding:8px 10px;text-align:center;font-size:10px;color:#059669;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Completed</th>
              <th style="padding:8px 10px;text-align:center;font-size:10px;color:#f97316;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Late Done</th>
              <th style="padding:8px 10px;text-align:center;font-size:10px;color:#3b82f6;font-weight:700;text-transform:uppercase;letter-spacing:.4px">In Progress</th>
              <th style="padding:8px 10px;text-align:center;font-size:10px;color:#f43f5e;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Rejected</th>
              <th style="padding:8px 10px;text-align:center;font-size:10px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Rate</th>
            </tr>
          </thead>
          <tbody>
            ${employees.map((e, i) => {
              const empRate = e.total_handled > 0 ? Math.round((e.completed / e.total_handled) * 100) : 0;
              return `<tr style="border-bottom:1px solid #f0f0f0;background:${i%2===0?'#fff':'#fafafa'}">
                <td style="padding:9px 10px;font-weight:600;color:#1a1a2e">${esc(e.name)}</td>
                <td style="padding:9px 10px;text-align:center;color:#555;font-weight:600">${e.total_handled}</td>
                <td style="padding:9px 10px;text-align:center;color:#059669;font-weight:700">${e.completed}</td>
                <td style="padding:9px 10px;text-align:center;color:${e.completed_late > 0 ? '#f97316' : '#aaa'};font-weight:600">${e.completed_late || 0}</td>
                <td style="padding:9px 10px;text-align:center;color:${e.in_progress > 0 ? '#3b82f6' : '#aaa'}">${e.in_progress || 0}</td>
                <td style="padding:9px 10px;text-align:center;color:${e.rejected > 0 ? '#f43f5e' : '#aaa'};font-weight:${e.rejected > 0 ? '700' : '400'}">${e.rejected || 0}</td>
                <td style="padding:9px 10px;text-align:center;color:${empRate >= 70 ? '#059669' : empRate >= 40 ? '#f97316' : '#ef4444'};font-weight:700">${empRate}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '';

    // ── Full request detail table ─────────────────────────────────────────
    const detailRows = (requests || []).map((r, i) => {
      const rowBg = { missed:'#fef2f2', open:'#fffbeb', rejected:'#fff0f3' }[r.status] || (i%2===0 ? '#fff' : '#fafafa');
      const handledBy = r.completed_by_name || r.picked_by_name || '—';
      const completedAt = r.completed_at ? fmtDateTime(r.completed_at) + (r.completed_late ? ' <span style="color:#f97316;font-size:10px">(late)</span>' : '') : '—';
      return `<tr style="border-bottom:1px solid #f0f0f0;background:${rowBg}">
        <td style="padding:8px;text-align:center;color:#999;font-size:11px;white-space:nowrap">${i + 1}</td>
        <td style="padding:8px;font-size:11px;color:#555;white-space:nowrap">${fmtDate(r.instance_date)}</td>
        <td style="padding:8px">
          <div style="font-weight:600;font-size:12px;color:#1a1a2e">${esc(r.title)}</div>
          <div style="font-size:10px;color:#888;margin-top:1px">${esc(r.task_type||'General')} · ${recLabel(r.recurrence||'none')}</div>
          ${r.description ? `<div style="font-size:10px;color:#aaa;margin-top:1px">${esc(r.description.substring(0,80))}${r.description.length>80?'…':''}</div>` : ''}
        </td>
        <td style="padding:8px;font-size:11px;white-space:nowrap"><span style="color:${priorityColor(r.priority)};font-weight:600">${priorityLabel(r.priority)}</span></td>
        <td style="padding:8px;font-size:11px;color:#555;white-space:nowrap">${fmtTime(r.due_time)}</td>
        <td style="padding:8px">${statusBadge(r.status)}</td>
        <td style="padding:8px;font-size:11px;color:#555;white-space:nowrap">${esc(r.created_by_name||'—')}</td>
        <td style="padding:8px;font-size:11px;color:#555;white-space:nowrap">${esc(handledBy)}</td>
        <td style="padding:8px;font-size:10px;color:#777;white-space:nowrap">${completedAt}</td>
        <td style="padding:8px;font-size:10px;color:#777;max-width:140px">${r.latest_comment ? `<span title="${esc(r.latest_comment)}">${esc(r.latest_comment.substring(0,60))}${r.latest_comment.length>60?'…':''}</span>${r.latest_comment_by ? `<div style="font-size:9px;color:#aaa">${esc(r.latest_comment_by)}</div>` : ''}` : '<span style="color:#ccc">—</span>'}</td>
      </tr>`;
    }).join('');

    const html = wrapHtmlFull(subject, `
      <p style="margin:0 0 6px;color:#333;font-size:14px">Monthly client requests summary for <strong>${monthLabel}</strong>.</p>
      <p style="margin:0 0 24px;font-size:12px;color:#888">${stats.total||0} total requests · ${resolved} resolved · ${notPicked} not picked</p>

      <!-- Stats row 1: primary -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin-bottom:8px">
        <tr>
          ${card('Total', stats.total||0, '#1a1a2e')}
          ${card('Resolved', resolved, '#059669', 'Done + Approved')}
          ${card('Done', stats.done||0, '#10b981')}
          ${card('Approved', stats.approved||0, '#059669')}
        </tr>
      </table>
      <!-- Stats row 2: problems -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin-bottom:24px">
        <tr>
          ${card('Missed', stats.missed||0, '#ef4444', 'Never picked')}
          ${card('Not Picked', stats.open||0, '#f97316', 'Still open')}
          ${card('In Progress', stats.picked||0, '#3b82f6')}
          ${card('Rejected', stats.rejected||0, '#f43f5e', 'Client rejected')}
        </tr>
      </table>
      <!-- Stats row 3: other -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin-bottom:24px">
        <tr>
          ${card('Rescheduled', stats.rescheduled||0, '#8b5cf6')}
          ${card('Cancelled', stats.cancelled||0, '#6b7280')}
          <td></td><td></td><td></td><td></td>
        </tr>
      </table>

      ${rateBar}

      ${alerts.length > 0 ? `<div style="margin-bottom:24px">${alerts.join('')}</div>` : ''}

      ${empTable}

      <!-- Full detail table -->
      <div style="margin-bottom:10px">
        <div style="font-size:13px;font-weight:700;color:#1a1a2e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e5e7eb">All Requests — ${monthLabel}</div>
      </div>
      ${requests && requests.length > 0 ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#f5f5f8">
            <th style="padding:7px 8px;text-align:center;font-size:10px;color:#888;font-weight:700;text-transform:uppercase;white-space:nowrap">#</th>
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:700;text-transform:uppercase;white-space:nowrap">Date</th>
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:700;text-transform:uppercase">Request / Type</th>
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:700;text-transform:uppercase;white-space:nowrap">Priority</th>
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:700;text-transform:uppercase;white-space:nowrap">Due</th>
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:700;text-transform:uppercase;white-space:nowrap">Status</th>
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:700;text-transform:uppercase;white-space:nowrap">Created By</th>
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:700;text-transform:uppercase;white-space:nowrap">Handled By</th>
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:700;text-transform:uppercase;white-space:nowrap">Completed At</th>
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#888;font-weight:700;text-transform:uppercase">Latest Comment</th>
          </tr>
        </thead>
        <tbody>${detailRows}</tbody>
      </table>` : '<p style="color:#999;text-align:center;padding:20px 0">No requests were recorded for this month.</p>'}
    `);

    const text = `Monthly Requests Report — ${monthLabel}

SUMMARY
Total: ${stats.total||0} | Resolved: ${resolved} | Completion Rate: ${rate}%
Done: ${stats.done||0} | Approved: ${stats.approved||0} | In Progress: ${stats.picked||0}
Missed: ${stats.missed||0} | Not Picked (Open): ${stats.open||0} | Rejected: ${stats.rejected||0}
Rescheduled: ${stats.rescheduled||0} | Cancelled: ${stats.cancelled||0}

${employees && employees.length > 0 ? 'TEAM PERFORMANCE\n' + employees.map(e => `  ${e.name}: ${e.total_handled} picked, ${e.completed} completed, ${e.completed_late||0} late, ${e.rejected||0} rejected`).join('\n') + '\n\n' : ''}ALL REQUESTS
${(requests||[]).map((r,i) => `${i+1}. [${(r.status||'').toUpperCase()}] ${fmtDate(r.instance_date)} — ${esc(r.title)} (${r.picked_by_name||'unassigned'}) ${r.completed_at ? '| Done: '+fmtDateTime(r.completed_at) : ''}`).join('\n')}`;

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
