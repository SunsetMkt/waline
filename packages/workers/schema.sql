-- Waline Cloudflare D1 database schema
-- Compatible with Waline's existing SQL schema used by MySQL/SQLite/PostgreSQL adapters

CREATE TABLE IF NOT EXISTS wl_Comment (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  url        TEXT,
  comment    TEXT,
  nick       TEXT,
  mail       TEXT,
  link       TEXT,
  ip         TEXT,
  ua         TEXT,
  pid        INTEGER,
  rid        INTEGER,
  status     TEXT DEFAULT 'approved',
  user_id    TEXT,
  sticky     INTEGER DEFAULT 0,
  like       INTEGER DEFAULT 0,
  at         TEXT,
  insertedAt DATETIME,
  createdAt  DATETIME,
  updatedAt  DATETIME
);

CREATE INDEX IF NOT EXISTS idx_comment_url ON wl_Comment(url);
CREATE INDEX IF NOT EXISTS idx_comment_rid ON wl_Comment(rid);
CREATE INDEX IF NOT EXISTS idx_comment_status ON wl_Comment(status);

CREATE TABLE IF NOT EXISTS wl_Users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT,
  email        TEXT UNIQUE,
  url          TEXT,
  avatar       TEXT,
  password     TEXT,
  type         TEXT DEFAULT 'guest',
  label        TEXT,
  "2fa"        TEXT,
  github       TEXT,
  twitter      TEXT,
  facebook     TEXT,
  google       TEXT,
  weibo        TEXT,
  qq           TEXT,
  createdAt    DATETIME,
  updatedAt    DATETIME
);

CREATE INDEX IF NOT EXISTS idx_users_email ON wl_Users(email);
CREATE INDEX IF NOT EXISTS idx_users_type ON wl_Users(type);

CREATE TABLE IF NOT EXISTS wl_Counter (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  url       TEXT UNIQUE,
  time      INTEGER DEFAULT 0,
  like      INTEGER DEFAULT 0,
  createdAt DATETIME,
  updatedAt DATETIME
);

CREATE INDEX IF NOT EXISTS idx_counter_url ON wl_Counter(url);
