module.exports = {
  ROLES: {
    CLIENT_ADMIN: 'CLIENT_ADMIN',
    CLIENT_MANAGER: 'CLIENT_MANAGER',
    LOCAL_ADMIN: 'LOCAL_ADMIN',
    LOCAL_MANAGER: 'LOCAL_MANAGER',
    LOCAL_USER: 'LOCAL_USER'
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
    DAILY: 'daily',
    WEEKLY: 'weekly',
    ADHOC: 'adhoc'
  },

  REWARD_STATUS: {
    PENDING: 'pending',
    PAID: 'paid'
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
    ]
  }
};
