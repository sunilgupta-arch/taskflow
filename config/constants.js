module.exports = {
  ROLES: {
    CFC_ADMIN: 'CFC_ADMIN',
    CFC_MANAGER: 'CFC_MANAGER',
    OUR_ADMIN: 'OUR_ADMIN',
    OUR_MANAGER: 'OUR_MANAGER',
    OUR_USER: 'OUR_USER'
  },

  ORG_TYPES: {
    CFC: 'CFC',
    OUR: 'OUR'
  },

  TASK_STATUS: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    DEACTIVATED: 'deactivated'
  },

  TASK_TYPE: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    ADHOC: 'adhoc'
  },

  REWARD_STATUS: {
    PENDING: 'pending',
    PAID: 'paid'
  },

  PERMISSIONS: {
    CFC_ADMIN: [
      'task:create', 'task:assign', 'task:reward',
      'report:view', 'dashboard:admin', 'analytics:view'
    ],
    CFC_MANAGER: [
      'task:create', 'task:assign', 'task:reward',
      'report:view', 'dashboard:manager'
    ],
    OUR_ADMIN: [
      'user:create', 'user:manage', 'task:reassign',
      'report:view', 'reward:mark_paid', 'leave:manage',
      'dashboard:admin', 'analytics:view'
    ],
    OUR_MANAGER: [
      'task:reassign', 'report:view', 'dashboard:manager'
    ],
    OUR_USER: [
      'task:view_assigned', 'task:pick', 'task:update_status',
      'task:upload_attachment', 'task:complete', 'dashboard:user'
    ]
  }
};
