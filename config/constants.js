// Minutes after shift start before a login is marked late.
// Change without touching code: set LATE_GRACE_MINUTES in .env, then restart the server.
const graceEnv = parseInt(process.env.LATE_GRACE_MINUTES, 10);

module.exports = {
  LATE_GRACE_MINUTES: Number.isFinite(graceEnv) && graceEnv >= 0 ? graceEnv : 5,

  ROLES: {
    CLIENT_ADMIN: 'CLIENT_ADMIN',
    CLIENT_MANAGER: 'CLIENT_MANAGER',
    LOCAL_ADMIN: 'LOCAL_ADMIN',
    LOCAL_MANAGER: 'LOCAL_MANAGER',
    LOCAL_USER: 'LOCAL_USER',
    CLIENT_USER: 'CLIENT_USER'
  },

  ORG_TYPES: {
    CLIENT: 'CLIENT',
    LOCAL: 'LOCAL'
  },

  TASK_STATUS: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    DEACTIVATED: 'deactivated'
  },

  TASK_TYPE: {
    ONCE: 'once',
    RECURRING: 'recurring'
  },

  RECURRENCE_PATTERN: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly'
  },

  REWARD_STATUS: {
    PENDING: 'pending',
    PAID: 'paid'
  },

  BREAK_TYPES: {
    tea:          { label: 'Tea Break',      idealMin: 10, idealMax: 15 },
    lunch_dinner: { label: 'Lunch / Dinner', idealMin: 20, idealMax: 30 },
    washroom:     { label: 'Washroom',       idealMin: 4,  idealMax: 5  },
    meeting:      { label: 'Meeting',        idealMin: null, idealMax: null },
    other:        { label: 'Other',          idealMin: null, idealMax: null }
  },

  PERMISSIONS: {
    CLIENT_ADMIN: [
      'task:create', 'task:assign', 'task:reward',
      'report:view', 'dashboard:admin', 'analytics:view'
    ],
    CLIENT_MANAGER: [
      'task:create', 'task:assign', 'task:reward',
      'report:view', 'dashboard:manager'
    ],
    LOCAL_ADMIN: [
      'user:create', 'user:manage', 'task:create', 'task:reassign',
      'report:view', 'reward:mark_paid', 'leave:manage',
      'dashboard:admin', 'analytics:view'
    ],
    LOCAL_MANAGER: [
      'task:create', 'task:reassign', 'user:create', 'report:view', 'dashboard:manager'
    ],
    LOCAL_USER: [
      'task:view_assigned', 'task:pick', 'task:update_status',
      'task:upload_attachment', 'task:complete', 'task:create_self', 'dashboard:user'
    ],
    CLIENT_USER: [
      'task:create', 'task:assign', 'task:view_created', 'dashboard:user'
    ]
  }
};
