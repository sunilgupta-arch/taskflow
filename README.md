# TaskFlow — Multi-Organization Task Management & Reward System

A production-ready system for managing tasks across two organizations (CFC & OUR Team) with built-in reward tracking, attendance monitoring, and role-based access control.

---

## 🏗️ Architecture

```
taskflow/
├── config/           # DB, Multer, Constants
├── controllers/      # Request handlers (MVC)
├── models/           # Database models
├── routes/           # Express route definitions
├── middleware/       # Auth, RBAC, Audit logging
├── services/         # Business logic layer
├── utils/            # Logger, Response helpers, Cron, Seeder
├── views/            # EJS templates
│   ├── layouts/      # Main layout
│   ├── auth/         # Login
│   ├── dashboard/    # Role-based dashboards
│   ├── tasks/        # Task CRUD + detail
│   ├── users/        # User management
│   ├── rewards/      # Reward ledger
│   ├── reports/      # Completion + reward reports
│   └── attendance/   # Attendance dashboard
├── public/src/       # Vite source (JS/CSS)
├── uploads/          # File attachments
├── server.js         # Entry point
└── vite.config.js    # Frontend build config
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Run Database Migration
```bash
npm run migrate
```

### 4. Seed Sample Data
```bash
npm run seed
```

### 5. Start Server
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

### 6. Build Frontend Assets (Optional)
```bash
cd public/src && npm install && npm run build
```

Server runs at: **http://localhost:3000**

---

## 👥 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| CFC Admin | cfc.admin@taskflow.com | Password@123 |
| CFC Manager | cfc.manager@taskflow.com | Password@123 |
| OUR Admin | our.admin@taskflow.com | Password@123 |
| OUR Manager | our.manager@taskflow.com | Password@123 |
| OUR User | our.user1@taskflow.com | Password@123 |

---

## 🔒 Role Permissions Matrix

| Feature | CFC_ADMIN | CFC_MANAGER | OUR_ADMIN | OUR_MANAGER | OUR_USER |
|---------|-----------|-------------|-----------|-------------|----------|
| Create Tasks | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign Tasks | ✅ | ✅ | ✅ | ✅ | ❌ |
| Pick Tasks | ❌ | ❌ | ❌ | ❌ | ✅ |
| Complete Tasks | ❌ | ❌ | ✅ | ✅ | ✅ |
| Create Users | ❌ | ❌ | ✅ | ❌ | ❌ |
| Mark Rewards Paid | ❌ | ❌ | ✅ | ❌ | ❌ |
| View Reports | ✅ | ✅ | ✅ | ✅ | ❌ |
| Admin Dashboard | ✅ | ❌ | ✅ | ❌ | ❌ |

---

## 📡 Key API Routes

```
POST   /auth/login              Login
GET    /auth/logout             Logout

GET    /dashboard               Role-based dashboard
GET    /tasks                   Task list (filtered by role)
POST   /tasks/create            Create task (CFC only)
POST   /tasks/assign            Assign task
POST   /tasks/pick/:id          Pick unassigned task (OUR_USER)
POST   /tasks/complete/:id      Mark task complete
POST   /tasks/:id/upload        Upload attachments

GET    /users                   User list (OUR_ADMIN only)
POST   /users                   Create user
PUT    /users/:id               Update user
PATCH  /users/:id/toggle        Toggle active status

GET    /rewards                 Reward ledger
POST   /rewards/mark-paid/:id   Mark reward paid (OUR_ADMIN)

GET    /reports/completion      Completion analytics
GET    /reports/rewards         Reward report
GET    /attendance              Attendance dashboard
```

---

## ⚙️ Business Rules

1. **Only CFC organization** can create tasks
2. **OUR team cannot create tasks**
3. If a task is unassigned, **OUR_USER** can self-assign ("pick")
4. When a task is completed **with a reward amount**, an entry is auto-created in `rewards_ledger`
5. Rewards must be **manually marked as paid** by OUR_ADMIN
6. Tasks are **soft-deleted** (never permanently removed)
7. Attendance is **auto-logged on login**
8. **Cron jobs** regenerate daily/weekly recurring tasks automatically

---

## 🔄 Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Daily Task Regen | Midnight daily | Recreates completed daily tasks |
| Weekly Task Regen | Midnight Monday | Recreates completed weekly tasks |
| Attendance Cleanup | 11:59 PM daily | Sets logout time for open sessions |

---

## 🛡️ Security Features

- JWT stored in **HTTP-only cookies**
- **bcrypt** password hashing (12 rounds)
- Role-based middleware on every protected route
- **Audit logging** on create/assign/complete actions
- File upload validation (type + size limits)
- SQL injection prevention via parameterized queries
