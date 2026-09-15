import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function dataDir(): string {
  // Runtime-configurable location; tell Turbopack not to trace it into the build.
  return path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(process.cwd(), "data"));
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('top', 'bottom', 'dress', 'shoes', 'outerwear')),
  colour     TEXT NOT NULL,
  image_path TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS items_user ON items (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS looks (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  title      TEXT NOT NULL,
  reason     TEXT NOT NULL,
  item_ids   TEXT NOT NULL, -- JSON array of item ids
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS looks_user ON looks (user_id, position);

CREATE TABLE IF NOT EXISTS tryons (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  look_id    TEXT,
  look_title TEXT NOT NULL,
  image_path TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  saved      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tryons_user ON tryons (user_id, created_at DESC);
`;

declare global {
  // Survives Next.js dev hot reloads so we keep a single connection.
  var __styledDb: DatabaseSync | undefined;
}

export function getDb(): DatabaseSync {
  if (!globalThis.__styledDb) {
    const dir = dataDir();
    fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(/*turbopackIgnore: true*/ dir, "styled.db"));
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    db.exec(SCHEMA);
    globalThis.__styledDb = db;
  }
  return globalThis.__styledDb;
}

/** Test helper: close the connection so the next getDb() can open a fresh DATA_DIR. */
export function closeDb(): void {
  globalThis.__styledDb?.close();
  globalThis.__styledDb = undefined;
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
