const db = require('../config/db');

class CompOff {

  static async earn(userId, earnedDate) {
    const [result] = await db.query(
      'INSERT INTO comp_off_credits (user_id, earned_date) VALUES (?, ?)',
      [userId, earnedDate]
    );
    return result.insertId;
  }

  static async getBalance(userId) {
    const [[row]] = await db.query(
      'SELECT COUNT(*) as cnt FROM comp_off_credits WHERE user_id = ? AND status = "available"',
      [userId]
    );
    return row.cnt;
  }

  static async getHistory(userId) {
    const [rows] = await db.query(
      `SELECT * FROM comp_off_credits WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  }

  static async getAllBalanceSummary() {
    const [rows] = await db.query(
      `SELECT u.id, u.name, r.name AS role_name,
              COALESCE(SUM(CASE WHEN c.status = 'available' THEN 1 ELSE 0 END), 0) AS available,
              COALESCE(SUM(CASE WHEN c.status = 'used'      THEN 1 ELSE 0 END), 0) AS used,
              COALESCE(COUNT(c.id), 0)                                              AS total_earned,
              MAX(c.earned_date)                                                    AS last_earned
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN comp_off_credits c ON c.user_id = u.id
       WHERE u.is_active = 1 AND r.name IN ('LOCAL_USER','LOCAL_MANAGER')
       GROUP BY u.id, u.name, r.name
       ORDER BY u.name`
    );
    return rows;
  }

  static async applyCredits(userId, dates) {
    const balance = await CompOff.getBalance(userId);
    if (balance < dates.length) throw new Error('Insufficient comp-off balance');

    const [credits] = await db.query(
      'SELECT id FROM comp_off_credits WHERE user_id = ? AND status = "available" ORDER BY earned_date ASC LIMIT ?',
      [userId, dates.length]
    );

    for (let i = 0; i < dates.length; i++) {
      await db.query(
        'UPDATE comp_off_credits SET status = "used", applied_to_date = ? WHERE id = ?',
        [dates[i], credits[i].id]
      );
      await db.query(
        `INSERT INTO attendance_logs (user_id, date, is_manual, manual_status, manual_remark, updated_by)
         VALUES (?, ?, 1, 'comp_off', 'Comp-off applied', ?)
         ON DUPLICATE KEY UPDATE
           is_manual = 1, manual_status = 'comp_off',
           manual_remark = 'Comp-off applied', updated_by = ?`,
        [userId, dates[i], userId, userId]
      );
    }
  }

  static async revokeCredit(creditId) {
    const today = new Date().toISOString().split('T')[0];

    const [[credit]] = await db.query(
      'SELECT id, user_id, status, earned_date, applied_to_date FROM comp_off_credits WHERE id = ?',
      [creditId]
    );

    if (!credit) throw new Error('Credit not found');
    if (credit.status === 'revoked') throw new Error('Credit is already revoked');

    // If applied to a future/present date, remove that leave from attendance
    if (credit.status === 'used' && credit.applied_to_date && credit.applied_to_date >= today) {
      await db.query(
        `DELETE FROM attendance_logs
         WHERE user_id = ? AND date = ? AND is_manual = 1 AND manual_status = 'comp_off'`,
        [credit.user_id, credit.applied_to_date]
      );
    }

    // Remove the "worked on off day" attendance entry so the day reverts to week-off
    await db.query(
      `DELETE FROM attendance_logs
       WHERE user_id = ? AND date = ? AND is_manual = 1 AND manual_status = 'comp_off'`,
      [credit.user_id, credit.earned_date]
    );

    await db.query(
      'UPDATE comp_off_credits SET status = "revoked", applied_to_date = NULL WHERE id = ?',
      [creditId]
    );

    return credit;
  }

  static async cancelCredit(creditId, userId) {
    const today = new Date().toISOString().split('T')[0];

    const [[credit]] = await db.query(
      'SELECT id, status, applied_to_date FROM comp_off_credits WHERE id = ? AND user_id = ?',
      [creditId, userId]
    );

    if (!credit) throw new Error('Credit not found');
    if (credit.status !== 'used') throw new Error('Only applied comp-offs can be cancelled');
    if (!credit.applied_to_date) throw new Error('No applied date on this credit');
    if (credit.applied_to_date < today) throw new Error('Cannot cancel a comp-off that has already passed');

    await db.query(
      'UPDATE comp_off_credits SET status = "available", applied_to_date = NULL WHERE id = ?',
      [creditId]
    );

    await db.query(
      `DELETE FROM attendance_logs
       WHERE user_id = ? AND date = ? AND is_manual = 1 AND manual_status = 'comp_off'`,
      [userId, credit.applied_to_date]
    );

    return credit.applied_to_date;
  }

  static async hasActionToday(userId, dateStr) {
    const [[earnRow]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM comp_off_credits WHERE user_id = ? AND earned_date = ?',
      [userId, dateStr]
    );
    if (earnRow.cnt > 0) return true;

    const [[logRow]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM attendance_logs
       WHERE user_id = ? AND date = ? AND is_manual = 1
         AND manual_status IN ('check_in','half_day')`,
      [userId, dateStr]
    );
    return logRow.cnt > 0;
  }
}

module.exports = CompOff;
