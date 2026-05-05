const Notification = require('../models/Notification');

class NotificationController {
  static async list(req, res) {
    try {
      const notifications = await Notification.getForUser(req.user.id, 30);
      const unreadCount   = await Notification.getUnreadCount(req.user.id);
      return res.json({ success: true, data: { notifications, unreadCount } });
    } catch (err) {
      return res.json({ success: false, message: err.message });
    }
  }

  static async markRead(req, res) {
    try {
      await Notification.markRead(req.params.id, req.user.id);
      return res.json({ success: true });
    } catch (err) {
      return res.json({ success: false, message: err.message });
    }
  }

  static async markAllRead(req, res) {
    try {
      await Notification.markAllRead(req.user.id);
      return res.json({ success: true });
    } catch (err) {
      return res.json({ success: false, message: err.message });
    }
  }
}

module.exports = NotificationController;
