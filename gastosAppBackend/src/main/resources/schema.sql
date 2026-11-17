CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users (username COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users (id),
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_user_name ON categories (user_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users (id),
    category_id  INTEGER NOT NULL REFERENCES categories (id),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    description  TEXT NOT NULL,
    date         TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_expenses_user_date ON expenses (user_id, date);

CREATE TABLE IF NOT EXISTS tags (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users (id),
    name    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tags_user_name ON tags (user_id, name);

CREATE TABLE IF NOT EXISTS expense_tags (
    expense_id INTEGER NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags (id),
    PRIMARY KEY (expense_id, tag_id)
);

CREATE TABLE IF NOT EXISTS expense_limits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users (id),
    period      TEXT NOT NULL CHECK (period IN ('DAY', 'WEEK', 'FORTNIGHT', 'MONTH', 'YEAR')),
    limit_cents INTEGER NOT NULL CHECK (limit_cents > 0),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_expense_limits_user_period ON expense_limits (user_id, period);
