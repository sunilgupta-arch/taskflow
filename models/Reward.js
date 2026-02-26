const db = require('../config/db');

class RewardModel {
  static async create(userId, taskId, amount) {
    const [result] = await db.query(
      `INSERT INTO rewards_ledger (user_id, task_id, reward_amount, status)
       VALUES (?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE reward_amount = VALUES(reward_amount)`,
      [userId, taskId, amount]
    );
    return result.insertId;
  }

  static async markPaid(id, paidBy) {
    const [result] = await db.query(
      `UPDATE rewards_ledger SET status = 'paid', paid_at = NOW(), paid_by = ?
       WHERE id = ? AND status = 'pending'`,
      [paidBy, id]
    );
    return result.affectedRows > 0;
  }

  static async getUserSummary(userId) {
    const [[summary]] = await db.query(
      `SELECT 
        COALESCE(SUM(reward_amount), 0) as total_earned,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN reward_amount END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN reward_amount END), 0) as paid_amount,
        COUNT(*) as total_entries,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count
       FROM rewards_ledger WHERE user_id = ?`, [userId]
    );
    return summary;
  }

  static async getAll({ user_id, status, page = 1, limit = 20 } = {}) {
    let where = [];
    let params = [];

    if (user_id) { where.push('rl.user_id = ?'); params.push(user_id); }
    if (status) { where.push('rl.status = ?'); params.push(status); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [rows] = await db.query(
      `SELECT rl.*, u.name as user_name, t.title as task_title, t.type as task_type,
              p.name as paid_by_name
       FROM rewards_ledger rl
       JOIN users u ON rl.user_id = u.id
       JOIN tasks t ON rl.task_id = t.id
       LEFT JOIN users p ON rl.paid_by = p.id
       ${whereClause}
       ORDER BY rl.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM rewards_ledger rl ${whereClause}`, params
    );

    return { rows, total };
  }

  static async getGlobalSummary() {
    const [[summary]] = await db.query(
      `SELECT 
        COALESCE(SUM(reward_amount), 0) as total,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN reward_amount END), 0) as pending,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN reward_amount END), 0) as paid
       FROM rewards_ledger`
    );
    return summary;
  }

  static async getPerUserSummary() {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email,
        COALESCE(SUM(rl.reward_amount), 0) as total_earned,
        COALESCE(SUM(CASE WHEN rl.status = 'pending' THEN rl.reward_amount END), 0) as pending,
        COALESCE(SUM(CASE WHEN rl.status = 'paid' THEN rl.reward_amount END), 0) as paid
       FROM users u
       LEFT JOIN rewards_ledger rl ON u.id = rl.user_id
       WHERE u.is_active = 1
       GROUP BY u.id
       ORDER BY total_earned DESC`
    );
    return rows;
  }
}

module.exports = RewardModel;
