const Break = require('../models/Break');
const { ApiResponse } = require('../utils/response');
const { getIO } = require('../config/socket');
const { getToday } = require('../utils/timezone');
const { BREAK_TYPES } = require('../config/constants');

function isOverdue(breakType, startedAt) {
  const cfg = BREAK_TYPES[breakType];
  if (!cfg || cfg.idealMax == null) return false;
  const elapsedMinutes = (Date.now() - new Date(startedAt).getTime()) / 60000;
  return elapsedMinutes > cfg.idealMax;
}

class BreakController {
  static async myBreaksPage(req, res) {
    try {
      const active = await Break.getActive(req.user.id);
      res.render('admin/breaks', {
        title: 'Breaks', layout: 'admin/layout', section: 'breaks',
        breakTypes: BREAK_TYPES, active
      });
    } catch (err) {
      console.error('BreakController myBreaksPage error:', err);
      res.status(500).send('Server error');
    }
  }

  static async status(req, res) {
    try {
      const today = getToday();
      const [active, history] = await Promise.all([
        Break.getActive(req.user.id),
        Break.getTodayForUser(req.user.id, today)
      ]);
      const totalMinutesToday = history.reduce((sum, b) => sum + (b.duration_minutes || 0), 0);
      return ApiResponse.success(res, { active, history, totalMinutesToday });
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async start(req, res) {
    try {
      const { break_type, note } = req.body;
      if (!BREAK_TYPES[break_type]) {
        return ApiResponse.error(res, 'Invalid break type', 400);
      }
      await Break.start(req.user.id, break_type, note ? String(note).trim().slice(0, 255) : null);
      const active = await Break.getActive(req.user.id);

      const io = getIO();
      io.to('admins').emit('break:started', {
        userId: req.user.id, userName: req.user.name,
        breakType: break_type, startedAt: active.started_at
      });

      return ApiResponse.success(res, active, 'Break started', 201);
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async end(req, res) {
    try {
      const ended = await Break.end(req.user.id);
      if (!ended) return ApiResponse.error(res, 'No active break to end', 400);

      const io = getIO();
      io.to('admins').emit('break:ended', { userId: req.user.id, userName: req.user.name });

      return ApiResponse.success(res, {}, 'Break ended');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async teamBreaksPage(req, res) {
    res.render('admin/team-breaks', { title: 'Break Status', layout: 'admin/layout', section: 'team' });
  }

  static async teamStatus(req, res) {
    try {
      const rows = await Break.getActiveForTeam();
      const active = rows.map(b => ({
        userId: b.user_id, name: b.name, avatar: b.avatar,
        breakType: b.break_type, note: b.note, startedAt: b.started_at,
        isOverdue: isOverdue(b.break_type, b.started_at)
      }));
      return ApiResponse.success(res, { active, serverTime: new Date() });
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }
}

module.exports = BreakController;
