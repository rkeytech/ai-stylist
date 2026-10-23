import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/lib/db";
import {
  addColour,
  createUser,
  deleteItem,
  deleteSession,
  findSessionUser,
  findUserByEmail,
  getItem,
  getTryOn,
  insertItem,
  insertSession,
  insertTryOn,
  listColours,
  listItems,
  listLooks,
  listTryOns,
  markTryOnSaved,
  replaceLooks,
  toLook,
  updateItem,
} from "@/lib/repo";

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "styled-test-"));
  process.env.DATA_DIR = dir;
});

afterAll(() => {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

function addItem(
  userId: string,
  id: string,
  category: "top" | "bottom" | "dress" | "shoes" | "outerwear" | "accessories",
) {
  return insertItem({
    id,
    user_id: userId,
    name: id,
    category,
    colour: "blue",
    image_path: `${userId}/${id}.jpg`,
    mime_type: "image/jpeg",
  });
}

describe("users and sessions", () => {
  it("finds users by email case-insensitively and blocks duplicates", () => {
    const user = createUser("ania@example.com", "hash");
    expect(findUserByEmail("ANIA@example.com")?.id).toBe(user.id);
    expect(() => createUser("Ania@Example.com", "hash")).toThrow();
  });

  it("only resolves unexpired sessions", () => {
    const user = createUser("session@example.com", "hash");
    insertSession("live-token", user.id, Date.now() + 60_000);
    insertSession("old-token", user.id, Date.now() + 10);
    expect(findSessionUser("live-token")).toEqual({ id: user.id, email: "session@example.com" });
    expect(findSessionUser("old-token", Date.now() + 1_000)).toBeUndefined();
    deleteSession("live-token");
    expect(findSessionUser("live-token")).toBeUndefined();
  });
});

describe("per-user privacy", () => {
  it("never exposes or deletes another user's items or try-ons", () => {
    const alice = createUser("alice@example.com", "hash");
    const bob = createUser("bob@example.com", "hash");
    addItem(alice.id, "alice-top", "top");

    expect(listItems(bob.id)).toEqual([]);
    expect(getItem(bob.id, "alice-top")).toBeUndefined();
    expect(deleteItem(bob.id, "alice-top")).toBeUndefined();
    expect(getItem(alice.id, "alice-top")).toBeDefined();

    insertTryOn({
      id: "alice-tryon",
      user_id: alice.id,
      look_id: null,
      look_title: "Look",
      image_path: `${alice.id}/alice-tryon.png`,
      mime_type: "image/png",
    });
    expect(getTryOn(bob.id, "alice-tryon")).toBeUndefined();
    expect(markTryOnSaved(bob.id, "alice-tryon")).toBe(false);
    expect(markTryOnSaved(alice.id, "alice-tryon")).toBe(true);
    expect(listTryOns(alice.id, true).map((row) => row.id)).toEqual(["alice-tryon"]);
    expect(listTryOns(bob.id, true)).toEqual([]);
  });
});

describe("editing items", () => {
  it("updates name, category and colour, scoped to the owner", () => {
    const alice = createUser("editor@example.com", "hash");
    const bob = createUser("editor-bob@example.com", "hash");
    addItem(alice.id, "editable", "top");

    expect(updateItem(bob.id, "editable", { name: "Nope", category: "bottom", colour: "red" })).toBeUndefined();
    expect(getItem(alice.id, "editable")?.name).toBe("editable");

    const updated = updateItem(alice.id, "editable", { name: "Gold hoop earrings", category: "accessories", colour: "gold" });
    expect(updated).toMatchObject({ name: "Gold hoop earrings", category: "accessories", colour: "gold" });
    expect(updateItem(alice.id, "missing", { name: "x", category: "top", colour: "blue" })).toBeUndefined();
  });
});

describe("colours", () => {
  it("seeds a known vocabulary and grows it without duplicates", () => {
    expect(listColours()).toEqual(expect.arrayContaining(["blue", "black", "grey"]));
    expect(listColours()).not.toContain("gray");

    addColour("Cerulean");
    addColour("cerulean");
    expect(listColours().filter((colour) => colour === "cerulean")).toHaveLength(1);
  });
});

describe("looks", () => {
  it("replaces the previous set and drops looks whose items were deleted", () => {
    const user = createUser("looks@example.com", "hash");
    addItem(user.id, "top-a", "top");
    addItem(user.id, "bottom-a", "bottom");
    addItem(user.id, "dress-a", "dress");

    replaceLooks(user.id, [{ title: "Old", reason: "r", itemIds: ["dress-a"] }]);
    replaceLooks(user.id, [
      { title: "Separates", reason: "r", itemIds: ["top-a", "bottom-a"] },
      { title: "Dress", reason: "r", itemIds: ["dress-a"] },
    ]);
    expect(listLooks(user.id).map((look) => look.title)).toEqual(["Separates", "Dress"]);

    deleteItem(user.id, "top-a");
    expect(listLooks(user.id).map((look) => look.title)).toEqual(["Dress"]);
  });

  it("stores the occasion a batch was styled for, and null when none was given", () => {
    const user = createUser("occasion@example.com", "hash");
    addItem(user.id, "dress-b", "dress");

    replaceLooks(user.id, [{ title: "Dinner look", reason: "r", itemIds: ["dress-b"] }], "Dinner");
    expect(toLook(listLooks(user.id)[0]).occasion).toBe("Dinner");

    replaceLooks(user.id, [{ title: "Any look", reason: "r", itemIds: ["dress-b"] }]);
    expect(toLook(listLooks(user.id)[0]).occasion).toBeNull();
  });
});
