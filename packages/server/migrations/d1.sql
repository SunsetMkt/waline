-- Waline D1 (Cloudflare) database schema
-- Compatible with Cloudflare D1 (SQLite dialect)
-- Apply with: wrangler d1 execute waline --file=./migrations/d1.sql

CREATE TABLE IF NOT EXISTS "wl_Comment" (
  "id"         INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id"    INTEGER,
  "comment"    TEXT,
  "insertedAt" DATETIME DEFAULT (datetime('now')),
  "ip"         TEXT,
  "link"       TEXT,
  "mail"       TEXT,
  "nick"       TEXT,
  "rid"        INTEGER,
  "pid"        INTEGER,
  "sticky"     NUMERIC,
  "status"     TEXT NOT NULL DEFAULT 'approved',
  "like"       INTEGER,
  "ua"         TEXT,
  "url"        TEXT,
  "createdAt"  DATETIME DEFAULT (datetime('now')),
  "updatedAt"  DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_comment_url"        ON "wl_Comment" ("url");
CREATE INDEX IF NOT EXISTS "idx_comment_user_id"    ON "wl_Comment" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_comment_status"     ON "wl_Comment" ("status");
CREATE INDEX IF NOT EXISTS "idx_comment_pid_rid"    ON "wl_Comment" ("pid", "rid");
CREATE INDEX IF NOT EXISTS "idx_comment_created_at" ON "wl_Comment" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_comment_updated_at" ON "wl_Comment" ("updatedAt");
CREATE INDEX IF NOT EXISTS "idx_comment_sticky"     ON "wl_Comment" ("sticky");

CREATE TABLE IF NOT EXISTS "wl_Counter" (
  "id"        INTEGER PRIMARY KEY AUTOINCREMENT,
  "time"      INTEGER,
  "reaction0" INTEGER,
  "reaction1" INTEGER,
  "reaction2" INTEGER,
  "reaction3" INTEGER,
  "reaction4" INTEGER,
  "reaction5" INTEGER,
  "reaction6" INTEGER,
  "reaction7" INTEGER,
  "reaction8" INTEGER,
  "url"       TEXT,
  "createdAt" DATETIME DEFAULT (datetime('now')),
  "updatedAt" DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_counter_url"        ON "wl_Counter" ("url");
CREATE INDEX IF NOT EXISTS "idx_counter_time"       ON "wl_Counter" ("time");
CREATE INDEX IF NOT EXISTS "idx_counter_created_at" ON "wl_Counter" ("createdAt");

CREATE TABLE IF NOT EXISTS "wl_Users" (
  "id"           INTEGER PRIMARY KEY AUTOINCREMENT,
  "display_name" TEXT NOT NULL DEFAULT '',
  "email"        TEXT NOT NULL DEFAULT '',
  "password"     TEXT NOT NULL DEFAULT '',
  "type"         TEXT NOT NULL DEFAULT '',
  "label"        TEXT,
  "github"       TEXT,
  "twitter"      TEXT,
  "facebook"     TEXT,
  "google"       TEXT,
  "weibo"        TEXT,
  "qq"           TEXT,
  "oidc"         TEXT,
  "huawei"       TEXT,
  "2fa"          TEXT,
  "avatar"       TEXT,
  "url"          TEXT,
  "createdAt"    DATETIME DEFAULT (datetime('now')),
  "updatedAt"    DATETIME DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_email"      ON "wl_Users" ("email");
CREATE INDEX        IF NOT EXISTS "idx_user_type"       ON "wl_Users" ("type");
CREATE INDEX        IF NOT EXISTS "idx_user_created_at" ON "wl_Users" ("createdAt");
