import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { COLOUR_WORDS } from "./wardrobe";

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
  category   TEXT NOT NULL CHECK (category IN ('top', 'bottom', 'dress', 'shoes', 'outerwear', 'accessories')),
  colour     TEXT NOT NULL,
  image_path TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS items_user ON items (user_id, created_at DESC);

-- Known colour vocabulary: seeded from wardrobe.ts's COLOUR_WORDS and grown whenever
-- tagging or editing an item introduces one the table doesn't have yet.
CREATE TABLE IF NOT EXISTS colours (
  name TEXT PRIMARY KEY COLLATE NOCASE
);

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

-- Named, user-owned groups of items ("Work", "Travel capsule"). An item can sit in any number of
-- collections; deleting either side removes the membership rows through the cascading FKs.
CREATE TABLE IF NOT EXISTS collections (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, name COLLATE NOCASE)
);
CREATE INDEX IF NOT EXISTS collections_user ON collections (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, item_id)
);
CREATE INDEX IF NOT EXISTS collection_items_item ON collection_items (item_id);
`;

declare global {
  // Survives Next.js dev hot reloads so we keep a single connection.
  var __styledDb: DatabaseSync | undefined;
}

/**
 * SQLite CHECK constraints can't be widened with ALTER TABLE, so a database created before
 * the "accessories" category existed needs its `items` table rebuilt in place, preserving rows.
 */
function migrateAccessoriesCategory(db: DatabaseSync): void {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'").get() as
    | { sql?: string }
    | undefined;
  if (!table?.sql || table.sql.includes("accessories")) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("ALTER TABLE items RENAME TO items_pre_accessories");
    db.exec(`
      CREATE TABLE items (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        category   TEXT NOT NULL CHECK (category IN ('top', 'bottom', 'dress', 'shoes', 'outerwear', 'accessories')),
        colour     TEXT NOT NULL,
        image_path TEXT NOT NULL,
        mime_type  TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    db.exec(`
      INSERT INTO items (id, user_id, name, category, colour, image_path, mime_type, created_at)
      SELECT id, user_id, name, category, colour, image_path, mime_type, created_at FROM items_pre_accessories
    `);
    db.exec("DROP TABLE items_pre_accessories");
    db.exec("CREATE INDEX IF NOT EXISTS items_user ON items (user_id, created_at DESC)");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Looks gained a nullable `occasion` column after the first release; plain ADD COLUMN is enough (no CHECK). */
function migrateLookOccasion(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(looks)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "occasion")) db.exec("ALTER TABLE looks ADD COLUMN occasion TEXT");
}

/**
 * Looks also remember the name of the collection they were styled from (a snapshot, like
 * `tryons.look_title`, so the label survives the collection being renamed or deleted).
 */
function migrateLookCollection(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(looks)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "collection_name")) {
    db.exec("ALTER TABLE looks ADD COLUMN collection_name TEXT");
  }
}

function seedColours(db: DatabaseSync): void {
  const insert = db.prepare("INSERT OR IGNORE INTO colours (name) VALUES (?)");
  const seen = new Set<string>();
  for (const word of COLOUR_WORDS) {
    const canonical = word === "gray" ? "grey" : word;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    insert.run(canonical);
  }
}

export function getDb(): DatabaseSync {
  if (!globalThis.__styledDb) {
    const dir = dataDir();
    fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(/*turbopackIgnore: true*/ dir, "styled.db"));
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    db.exec(SCHEMA);
    migrateAccessoriesCategory(db);
    migrateLookOccasion(db);
    migrateLookCollection(db);
    seedColours(db);
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
