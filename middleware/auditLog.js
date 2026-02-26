const db = require('../config/db');

const auditLog = (action, entityType) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      if (body?.success && req.user?.id) {
        try {
          const entityId = body?.data?.id || req.params?.id || null;
          await db.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              req.user.id,
              action,
              entityType,
              entityId ? parseInt(entityId) : null,
              JSON.stringify({ body: req.body, query: req.query }),
              req.ip
            ]
          );
        } catch (err) {
          console.error('Audit log error:', err.message);
        }
      }
      return originalJson(body);
    };
    next();
  };
};

module.exports = auditLog;
