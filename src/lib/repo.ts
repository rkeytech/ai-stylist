import { randomUUID } from "node:crypto";
import { getDb, transaction } from "./db";
import type { ImageMime } from "./image-mime";
import type { LookDraft } from "./outfits";
import type { Category, Collection, Look, TryOnResult, WardrobeItem } from "./wardrobe";

// Every query that touches user content is scoped by user_id, so one account
// can never read or change another account's wardrobe, looks or photos.

type Param = string | number | null;

function one<T>(sql: string, ...params: Param[]): T | undefined {
  return getDb().prepare(sql).get(...params) as unknown as T | undefined;
}

function many<T>(sql: string, ...params: Param[]): T[] {
  return getDb().prepare(sql).all(...params) as unknown as T[];
}

function run(sql: string, ...params: Param[]): number {
  return Number(getDb().prepare(sql).run(...params).changes);
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
}

export interface ItemRow {
  id: string;
  user_id: string;
  name: string;
  category: Category;
  colour: string;
  image_path: string;
  mime_type: ImageMime;
  created_at: number;
}

export interface LookRow {
  id: string;
  user_id: string;
  position: number;
  title: string;
  reason: string;
  item_ids: string;
  occasion: string | null;
  collection_name: string | null;
  created_at: number;
}

export interface CollectionRow {
  id: string;
  user_id: string;
  name: string;
  created_at: number;
}

/** A collection row plus its member item ids (newest item first). */
export interface CollectionWithItems extends CollectionRow {
  item_ids: string[];
}

export interface TryOnRow {
  id: string;
  user_id: string;
  look_id: string | null;
  look_title: string;
  image_path: string;
  mime_type: ImageMime;
  saved: number;
  created_at: number;
}

// ---- users & sessions -------------------------------------------------------

export function createUser(email: string, passwordHash: string): UserRow {
  const row: UserRow = { id: randomUUID(), email, password_hash: passwordHash, created_at: Date.now() };
  run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    row.id, row.email, row.password_hash, row.created_at,
  );
  return row;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return one<UserRow>("SELECT * FROM users WHERE email = ?", email);
}

export function insertSession(tokenHash: string, userId: string, expiresAt: number): void {
  run("DELETE FROM sessions WHERE expires_at <= ?", Date.now());
  run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", tokenHash, userId, expiresAt);
}

export function findSessionUser(tokenHash: string, now = Date.now()) {
  return one<{ id: string; email: string }>(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    tokenHash, now,
  );
}

export function deleteSession(tokenHash: string): void {
  run("DELETE FROM sessions WHERE token_hash = ?", tokenHash);
}

// ---- wardrobe items ---------------------------------------------------------

export function listItems(userId: string): ItemRow[] {
  return many<ItemRow>("SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC, rowid DESC", userId);
}

export function getItem(userId: string, id: string): ItemRow | undefined {
  return one<ItemRow>("SELECT * FROM items WHERE user_id = ? AND id = ?", userId, id);
}

export function insertItem(row: Omit<ItemRow, "created_at">): ItemRow {
  const full: ItemRow = { ...row, created_at: Date.now() };
  run(
    `INSERT INTO items (id, user_id, name, category, colour, image_path, mime_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    full.id, full.user_id, full.name, full.category, full.colour, full.image_path, full.mime_type, full.created_at,
  );
  return full;
}

/** Updates the editable fields of an item (name, category, colour). Returns the updated row, or undefined if not found. */
export function updateItem(
  userId: string,
  id: string,
  changes: { name: string; category: Category; colour: string },
): ItemRow | undefined {
  const changed = run(
    "UPDATE items SET name = ?, category = ?, colour = ? WHERE user_id = ? AND id = ?",
    changes.name, changes.category, changes.colour, userId, id,
  );
  return changed > 0 ? getItem(userId, id) : undefined;
}

/** Deletes the item and any saved stylist look that relied on it. Returns the removed row. */
export function deleteItem(userId: string, id: string): ItemRow | undefined {
  return transaction(() => {
    const item = getItem(userId, id);
    if (!item) return undefined;
    run("DELETE FROM items WHERE user_id = ? AND id = ?", userId, id);
    run(
      `DELETE FROM looks WHERE user_id = ?
       AND EXISTS (SELECT 1 FROM json_each(looks.item_ids) WHERE json_each.value = ?)`,
      userId, id,
    );
    return item;
  });
}

// ---- known colours -----------------------------------------------------------
// Shared across all users: a growing vocabulary, seeded from wardrobe.ts's COLOUR_WORDS
// and extended whenever tagging or editing an item introduces one the table doesn't have.

export function listColours(): string[] {
  return many<{ name: string }>("SELECT name FROM colours ORDER BY name").map((row) => row.name);
}

export function addColour(name: string): void {
  const value = name.trim().toLowerCase();
  if (value) run("INSERT OR IGNORE INTO colours (name) VALUES (?)", value);
}

// ---- collections ------------------------------------------------------------

function memberIds(userId: string, collectionIds: string[]): Map<string, string[]> {
  const byCollection = new Map<string, string[]>(collectionIds.map((id) => [id, []]));
  const rows = many<{ collection_id: string; item_id: string }>(
    `SELECT ci.collection_id, ci.item_id FROM collection_items ci
     JOIN collections c ON c.id = ci.collection_id
     JOIN items i ON i.id = ci.item_id
     WHERE c.user_id = ? AND i.user_id = ?
     ORDER BY i.created_at DESC, i.rowid DESC`,
    userId, userId,
  );
  for (const row of rows) byCollection.get(row.collection_id)?.push(row.item_id);
  return byCollection;
}

export function listCollections(userId: string): CollectionWithItems[] {
  const rows = many<CollectionRow>(
    "SELECT * FROM collections WHERE user_id = ? ORDER BY created_at DESC, rowid DESC",
    userId,
  );
  const members = memberIds(userId, rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, item_ids: members.get(row.id) ?? [] }));
}

export function getCollection(userId: string, id: string): CollectionWithItems | undefined {
  const row = one<CollectionRow>("SELECT * FROM collections WHERE user_id = ? AND id = ?", userId, id);
  return row && { ...row, item_ids: memberIds(userId, [row.id]).get(row.id) ?? [] };
}

/** Names are unique per user, ignoring case; pass `exceptId` when renaming so a collection doesn't clash with itself. */
export function collectionNameTaken(userId: string, name: string, exceptId: string | null = null): boolean {
  return (
    one(
      "SELECT 1 FROM collections WHERE user_id = ? AND name = ? COLLATE NOCASE AND id IS NOT ?",
      userId, name, exceptId,
    ) !== undefined
  );
}

export function createCollection(userId: string, name: string): CollectionWithItems {
  const row: CollectionRow = { id: randomUUID(), user_id: userId, name, created_at: Date.now() };
  run(
    "INSERT INTO collections (id, user_id, name, created_at) VALUES (?, ?, ?, ?)",
    row.id, row.user_id, row.name, row.created_at,
  );
  return { ...row, item_ids: [] };
}

export function renameCollection(userId: string, id: string, name: string): CollectionWithItems | undefined {
  const changed = run("UPDATE collections SET name = ? WHERE user_id = ? AND id = ?", name, userId, id);
  return changed > 0 ? getCollection(userId, id) : undefined;
}

/** Removes the collection and its memberships; the items themselves stay in the wardrobe. */
export function deleteCollection(userId: string, id: string): boolean {
  return run("DELETE FROM collections WHERE user_id = ? AND id = ?", userId, id) > 0;
}

/**
 * Replaces the collection's membership wholesale. Only ids of the user's own items are ever linked
 * (the INSERT selects from `items` scoped by user_id), so a foreign id is silently skipped here -
 * routes should reject unknown ids up front to give the caller a clear error.
 */
export function setCollectionItems(userId: string, id: string, itemIds: string[]): CollectionWithItems | undefined {
  return transaction(() => {
    if (!one("SELECT 1 FROM collections WHERE user_id = ? AND id = ?", userId, id)) return undefined;
    run("DELETE FROM collection_items WHERE collection_id = ?", id);
    for (const itemId of new Set(itemIds)) {
      run(
        "INSERT INTO collection_items (collection_id, item_id) SELECT ?, id FROM items WHERE user_id = ? AND id = ?",
        id, userId, itemId,
      );
    }
    return getCollection(userId, id);
  });
}

/** The full item rows in a collection, for the stylist to draw from. */
export function listCollectionItems(userId: string, collectionId: string): ItemRow[] {
  return many<ItemRow>(
    `SELECT i.* FROM items i
     JOIN collection_items ci ON ci.item_id = i.id
     JOIN collections c ON c.id = ci.collection_id
     WHERE i.user_id = ? AND c.user_id = ? AND c.id = ?
     ORDER BY i.created_at DESC, i.rowid DESC`,
    userId, userId, collectionId,
  );
}

// ---- stylist looks ----------------------------------------------------------

/**
 * The stylist keeps the latest set of looks per user; a new "Style me" replaces it. `occasion` and
 * `collectionName` record what produced the batch so the UI can label it.
 */
export function replaceLooks(
  userId: string,
  drafts: LookDraft[],
  occasion: string | null = null,
  collectionName: string | null = null,
): LookRow[] {
  return transaction(() => {
    run("DELETE FROM looks WHERE user_id = ?", userId);
    const now = Date.now();
    return drafts.map((draft, position) => {
      const row: LookRow = {
        id: randomUUID(),
        user_id: userId,
        position,
        title: draft.title,
        reason: draft.reason,
        item_ids: JSON.stringify(draft.itemIds),
        occasion,
        collection_name: collectionName,
        created_at: now,
      };
      run(
        `INSERT INTO looks (id, user_id, position, title, reason, item_ids, occasion, collection_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id, row.user_id, row.position, row.title, row.reason, row.item_ids, row.occasion, row.collection_name,
        row.created_at,
      );
      return row;
    });
  });
}

export function listLooks(userId: string): LookRow[] {
  return many<LookRow>("SELECT * FROM looks WHERE user_id = ? ORDER BY position", userId);
}

export function getLook(userId: string, id: string): LookRow | undefined {
  return one<LookRow>("SELECT * FROM looks WHERE user_id = ? AND id = ?", userId, id);
}

// ---- try-on results ---------------------------------------------------------

export function insertTryOn(row: Omit<TryOnRow, "created_at" | "saved">): TryOnRow {
  const full: TryOnRow = { ...row, saved: 0, created_at: Date.now() };
  run(
    `INSERT INTO tryons (id, user_id, look_id, look_title, image_path, mime_type, saved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    full.id, full.user_id, full.look_id, full.look_title, full.image_path, full.mime_type, full.created_at,
  );
  return full;
}

export function getTryOn(userId: string, id: string): TryOnRow | undefined {
  return one<TryOnRow>("SELECT * FROM tryons WHERE user_id = ? AND id = ?", userId, id);
}

export function listTryOns(userId: string, saved: boolean): TryOnRow[] {
  return many<TryOnRow>(
    "SELECT * FROM tryons WHERE user_id = ? AND saved = ? ORDER BY created_at DESC, rowid DESC",
    userId, saved ? 1 : 0,
  );
}

export function markTryOnSaved(userId: string, id: string): boolean {
  return run("UPDATE tryons SET saved = 1 WHERE user_id = ? AND id = ?", userId, id) > 0;
}

export function deleteTryOn(userId: string, id: string): TryOnRow | undefined {
  const row = getTryOn(userId, id);
  if (row) run("DELETE FROM tryons WHERE user_id = ? AND id = ?", userId, id);
  return row;
}

// ---- API shapes -------------------------------------------------------------

export function toWardrobeItem(row: ItemRow): WardrobeItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    colour: row.colour,
    imageUrl: `/api/images/item/${row.id}`,
    createdAt: row.created_at,
  };
}

export function toLook(row: LookRow): Look {
  return {
    id: row.id,
    title: row.title,
    reason: row.reason,
    itemIds: JSON.parse(row.item_ids) as string[],
    occasion: row.occasion,
    collection: row.collection_name,
    createdAt: row.created_at,
  };
}

export function toCollection(row: CollectionWithItems): Collection {
  return { id: row.id, name: row.name, itemIds: row.item_ids, createdAt: row.created_at };
}

export function toTryOn(row: TryOnRow): TryOnResult {
  return {
    id: row.id,
    lookId: row.look_id,
    lookTitle: row.look_title,
    imageUrl: `/api/images/tryon/${row.id}`,
    saved: row.saved === 1,
    createdAt: row.created_at,
  };
}
