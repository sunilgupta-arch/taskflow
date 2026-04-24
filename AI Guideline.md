# AI Guideline — TaskFlow

Read this file before writing code in this repo. These rules exist because we have already been bitten by ignoring them.

---

## 1. Database column types — always `INT UNSIGNED` for ids and FKs

Every `id` (primary key) and every foreign-key column in this project is declared `INT UNSIGNED`. See [utils/schema.sql](utils/schema.sql) — there are no exceptions.

**When you write a migration that adds a foreign key, you MUST declare the column as `INT UNSIGNED` (not plain `INT`).**

MySQL refuses to create a foreign key across signed/unsigned types and throws:
```
ERROR 3780: Referencing column '<col>' and referenced column 'id' in foreign key
constraint '<name>' are incompatible.
```

Before writing the FK, confirm the referenced column's type — either grep [utils/schema.sql](utils/schema.sql) or run:
```sql
SHOW COLUMNS FROM <referenced_table> LIKE 'id';
```
Then match it exactly.

**Bad:**
```sql
CREATE TABLE foo (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)   -- ❌ FK creation fails
);
```

**Good:**
```sql
CREATE TABLE foo (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)   -- ✅ types match
);
```

---

## 2. Always test a migration locally before committing

The auto-migrator at [utils/auto-migrate.js](utils/auto-migrate.js) runs every pending `.sql` file at server startup and **stops on the first failure**. A single broken migration silently blocks every later migration — the user sees random pages crash with no obvious cause.

Before committing a new migration:
```bash
npm run migrate:latest
```
or apply it directly:
```bash
mysql -u <user> -p <db> < migrations/NNN_<name>_YYYY-MM-DD.sql
```

If it errors, fix the migration — do not commit it broken.

---

## 3. Ship the migration in the same commit as the code that reads it

If your application code does `SELECT new_column FROM users` or `INSERT INTO new_table`, the migration that creates that column/table must land in the **same commit**. Otherwise:

- A teammate pulls and restarts → migration runs → fine.
- A teammate pulls without restarting → app reads a column that does not exist → page crashes.
- The migration fails for an unrelated reason → app code references something that was never created → page crashes.

One commit = one atomic unit of "schema + code that depends on it."

---

## 4. Migration filename convention

Files in [migrations/](migrations/) are named:
```
NNN_short_description_YYYY-MM-DD.sql
```
- `NNN` is a zero-padded sequence number (next free number — check the directory).
- `YYYY-MM-DD` is the date you wrote it.
- They are applied in alphabetical (== numerical) order.

Never reuse a number. Never edit a migration that has already been applied in production — write a new migration instead. (The one exception: a migration that has **never** successfully run anywhere can be edited in place.)

---

## 5. Defensive code at boundaries, not inside

Trust internal code and the schema. Do not add fallbacks like "if the column doesn't exist, return empty" — that hides real bugs (a missing migration is a bug, not a runtime condition to handle). Validate only at system boundaries (HTTP input, external APIs).

---

## 6. Other project conventions worth knowing

- **Two-org model**: every user belongs to either a `CLIENT` org or a `LOCAL` org. Routes under `/portal/*` are CLIENT-side; routes under `/tasks`, `/chat`, `/drive`, `/help` are LOCAL-side. Role names are prefixed accordingly (`CLIENT_ADMIN`, `LOCAL_MANAGER`, etc.).
- **Timezones**: org-level timezone is stored on the `organizations` table; do not hardcode UTC or server-local time in user-facing displays. Use the helpers in [utils/timezone.js](utils/timezone.js).
- **Sockets**: get the IO instance via `getIO()` from [config/socket.js](config/socket.js), not `req.app.get('io')`. Emit to both the main namespace and the portal namespace when an event affects both sides.
- **No emojis in code or commit messages** unless explicitly asked.
- **No new markdown docs** unless explicitly asked. Update existing files first.
