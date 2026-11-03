import { describe, expect, it } from "vitest";
import {
  canStyle,
  canStyleAround,
  checkOutfit,
  missingPieces,
  mockLooks,
  pickStylingPool,
  sanitizeLooks,
  type StylableItem,
} from "@/lib/outfits";

const items: StylableItem[] = [
  { id: "t1", name: "Blue shirt", category: "top", colour: "blue" },
  { id: "t2", name: "Striped tee", category: "top", colour: "white" },
  { id: "b1", name: "Wide-leg trousers", category: "bottom", colour: "pink" },
  { id: "d1", name: "Slip dress", category: "dress", colour: "green" },
  { id: "s1", name: "Espadrilles", category: "shoes", colour: "tan" },
  { id: "s2", name: "Heels", category: "shoes", colour: "lime" },
  { id: "o1", name: "Utility jacket", category: "outerwear", colour: "beige" },
  { id: "k1", name: "Leather belt", category: "belt", colour: "brown" },
  { id: "k2", name: "Woven belt", category: "belt", colour: "tan" },
  { id: "g1", name: "Tote bag", category: "bag", colour: "black" },
  { id: "g2", name: "Clutch", category: "bag", colour: "gold" },
  { id: "a1", name: "Gold hoop earrings", category: "accessories", colour: "gold" },
  { id: "a2", name: "Leather watch", category: "accessories", colour: "brown" },
];
const byId = new Map(items.map((item) => [item.id, item]));

describe("checkOutfit", () => {
  it("accepts a top and a bottom with a belt and a bag, and optional shoes and outerwear", () => {
    expect(checkOutfit(["t1", "b1", "k1", "g1"], byId)).toBeNull();
    expect(checkOutfit(["t1", "b1", "k1", "g1", "s1", "o1"], byId)).toBeNull();
  });

  it("accepts a dress on its own or with extras", () => {
    expect(checkOutfit(["d1", "k1", "g1"], byId)).toBeNull();
    expect(checkOutfit(["d1", "k1", "g1", "s2", "o1"], byId)).toBeNull();
  });

  it("allows any number of accessories", () => {
    expect(checkOutfit(["t1", "b1", "k1", "g1", "a1"], byId)).toBeNull();
    expect(checkOutfit(["t1", "b1", "k1", "g1", "a1", "a2"], byId)).toBeNull();
    expect(checkOutfit(["d1", "k1", "g1", "a1", "a2"], byId)).toBeNull();
  });

  it("requires exactly one belt and one bag", () => {
    expect(checkOutfit(["t1", "b1", "g1"], byId)).toMatch(/belt/);
    expect(checkOutfit(["t1", "b1", "k1"], byId)).toMatch(/bag/);
    expect(checkOutfit(["d1"], byId)).toMatch(/belt/);
    expect(checkOutfit(["t1", "b1", "k1", "k2", "g1"], byId)).toMatch(/belt/);
    expect(checkOutfit(["t1", "b1", "k1", "g1", "g2"], byId)).toMatch(/bag/);
  });

  it("never combines a dress with a bottom or a top", () => {
    expect(checkOutfit(["d1", "b1", "k1", "g1"], byId)).toMatch(/dress/);
    expect(checkOutfit(["d1", "t1", "k1", "g1"], byId)).toMatch(/dress/);
  });

  it("rejects incomplete, duplicated, doubled-up or unknown pieces", () => {
    expect(checkOutfit([], byId)).not.toBeNull();
    expect(checkOutfit(["t1"], byId)).not.toBeNull();
    expect(checkOutfit(["b1", "s1"], byId)).not.toBeNull();
    expect(checkOutfit(["t1", "t2", "b1"], byId)).not.toBeNull();
    expect(checkOutfit(["t1", "b1", "k1", "g1", "s1", "s2"], byId)).not.toBeNull();
    expect(checkOutfit(["t1", "b1", "b1"], byId)).not.toBeNull();
    expect(checkOutfit(["t1", "made-up"], byId)).not.toBeNull();
  });
});

describe("sanitizeLooks", () => {
  it("keeps valid looks, drops invalid and duplicate ones, caps at three and orders pieces", () => {
    const raw = {
      looks: [
        { title: "Dress with trousers", itemIds: ["d1", "b1", "k1", "g1"], reason: "Breaks the rules." },
        { title: "No bag or belt", itemIds: ["t1", "b1", "s1"], reason: "Missing required pieces." },
        { title: "Resort", itemIds: ["s1", "k1", "g1", "b1", "t1"], reason: "Pink and blue." },
        { title: "Same again", itemIds: ["t1", "b1", "s1", "k1", "g1"], reason: "Duplicate." },
        { title: "Hallucinated", itemIds: ["t9", "b1", "k1", "g1"], reason: "Item does not exist." },
        { title: "Evening", itemIds: ["d1", "s2", "k2", "g2"], reason: "Green and lime." },
        { title: "Layered", itemIds: ["o1", "t2", "b1", "k1", "g2"], reason: "" },
        { title: "One too many", itemIds: ["t2", "b1", "s2", "k2", "g1"], reason: "Fourth look." },
      ],
    };

    const looks = sanitizeLooks(raw, items);

    expect(looks.map((look) => look.title)).toEqual(["Resort", "Evening", "Layered"]);
    expect(looks[0].itemIds).toEqual(["t1", "b1", "k1", "s1", "g1"]);
    expect(looks[2].itemIds).toEqual(["o1", "t2", "b1", "k1", "g2"]);
    expect(looks[2].reason).toContain("beige utility jacket");
  });

  it("tolerates malformed model output", () => {
    expect(sanitizeLooks(null, items)).toEqual([]);
    expect(sanitizeLooks("not json", items)).toEqual([]);
    expect(sanitizeLooks({ looks: "nope" }, items)).toEqual([]);
    expect(sanitizeLooks([{ itemIds: ["t1", 5, "b1", "k1", "g1"] }], items)).toEqual([]);
  });
});

describe("mockLooks and canStyle", () => {
  it("builds up to three distinct looks that follow the rules", () => {
    const looks = mockLooks(items);
    expect(looks).toHaveLength(3);
    for (const look of looks) expect(checkOutfit(look.itemIds, byId)).toBeNull();
    expect(new Set(looks.map((look) => [...look.itemIds].sort().join("|"))).size).toBe(3);
  });

  it("accessorizes every look when accessories are available", () => {
    const looks = mockLooks(items);
    for (const look of looks) {
      expect(look.itemIds.some((id) => byId.get(id)?.category === "accessories")).toBe(true);
    }
  });

  it("puts exactly one belt and one bag in every look", () => {
    for (const look of mockLooks(items)) {
      const categories = look.itemIds.map((id) => byId.get(id)?.category);
      expect(categories.filter((c) => c === "belt")).toHaveLength(1);
      expect(categories.filter((c) => c === "bag")).toHaveLength(1);
    }
  });

  it("doesn't repeat a colour the item name already mentions", () => {
    const named: StylableItem[] = [
      { id: "a", name: "Blue shirt", category: "top", colour: "blue" },
      { id: "b", name: "Jeans", category: "bottom", colour: "indigo" },
      { id: "c", name: "Belt", category: "belt", colour: "black" },
      { id: "d", name: "Tote", category: "bag", colour: "tan" },
    ];
    const [look] = mockLooks(named);
    expect(look.reason).toContain("the blue shirt, the indigo jeans");
    expect(look.reason).not.toMatch(/blue blue/i);
  });

  it("needs a dress, or a top and a bottom, plus a belt and a bag", () => {
    const belt = { category: "belt" as const };
    const bag = { category: "bag" as const };
    expect(canStyle([{ category: "top" }, { category: "shoes" }, belt, bag])).toBe(false);
    expect(canStyle([{ category: "top" }, { category: "bottom" }, belt, bag])).toBe(true);
    expect(canStyle([{ category: "dress" }, belt, bag])).toBe(true);
    expect(canStyle([{ category: "dress" }, bag])).toBe(false);
    expect(canStyle([{ category: "dress" }, belt])).toBe(false);
    expect(mockLooks(items.filter((item) => item.category === "top"))).toEqual([]);
    expect(mockLooks(items.filter((item) => item.category !== "bag"))).toEqual([]);
    expect(mockLooks(items.filter((item) => item.category !== "belt"))).toEqual([]);
  });
});

describe("styling around one item", () => {
  const anchored = (anchorId: string) => {
    const looks = mockLooks(items, { anchorId });
    for (const look of looks) {
      expect(checkOutfit(look.itemIds, byId)).toBeNull();
      expect(look.itemIds).toContain(anchorId);
    }
    return looks;
  };

  it("knows when a piece can anchor an outfit", () => {
    const rest = [{ category: "belt" as const }, { category: "bag" as const }];
    expect(canStyleAround([{ category: "top" }, { category: "bottom" }, ...rest], { category: "top" })).toBe(true);
    expect(canStyleAround([{ category: "top" }, { category: "dress" }, ...rest], { category: "top" })).toBe(false);
    expect(canStyleAround([{ category: "bottom" }, { category: "top" }, ...rest], { category: "bottom" })).toBe(true);
    expect(canStyleAround([{ category: "bottom" }, ...rest], { category: "bottom" })).toBe(false);
    expect(canStyleAround([{ category: "dress" }, ...rest], { category: "dress" })).toBe(true);
    expect(canStyleAround([{ category: "shoes" }, { category: "dress" }, ...rest], { category: "shoes" })).toBe(true);
    expect(canStyleAround([{ category: "accessories" }, { category: "top" }, ...rest], { category: "accessories" })).toBe(false);
    expect(canStyleAround([{ category: "dress" }, { category: "belt" }], { category: "dress" })).toBe(false);
    expect(canStyleAround([{ category: "belt" }, { category: "bag" }, { category: "dress" }], { category: "belt" })).toBe(true);
    expect(missingPieces([{ category: "top" }, ...rest], { category: "top" })).toBe("a bottom");
    expect(missingPieces([{ category: "outerwear" }, ...rest], { category: "outerwear" })).toMatch(/dress/);
    expect(missingPieces([{ category: "dress" }])).toBe("a belt and a bag");
    expect(missingPieces([{ category: "top" }], { category: "top" })).toBe("a bottom, plus a belt and a bag");
    expect(missingPieces([{ category: "dress" }, ...rest])).toBe("");
  });

  it("drops model looks that leave the anchor out", () => {
    const raw = {
      looks: [
        { title: "With it", reason: "r", itemIds: ["t1", "b1", "s1", "k1", "g1"] },
        { title: "Without it", reason: "r", itemIds: ["d1", "k1", "g1"] },
        { title: "Also with it", reason: "r", itemIds: ["t1", "b1", "k1", "g1"] },
      ],
    };
    expect(sanitizeLooks(raw, items, { anchorId: "t1" }).map((look) => look.title)).toEqual(["With it", "Also with it"]);
    expect(sanitizeLooks(raw, items)).toHaveLength(3);
  });

  it("only uses combinations containing a top, bottom or dress anchor", () => {
    expect(anchored("t1")).toHaveLength(1); // one bottom to pair it with
    expect(anchored("b1")).toHaveLength(2); // either top
    expect(anchored("d1")).toHaveLength(1);
  });

  it("puts a shoes or outerwear anchor into every look", () => {
    expect(anchored("s2")).toHaveLength(3);
    for (const look of anchored("s2")) expect(look.itemIds).not.toContain("s1");
    expect(anchored("o1")).toHaveLength(3);
  });

  it("puts a belt or bag anchor into every look, in place of the round-robin pick", () => {
    for (const look of anchored("k2")) expect(look.itemIds).not.toContain("k1");
    for (const look of anchored("g2")) expect(look.itemIds).not.toContain("g1");
  });

  it("adds an accessory anchor once, instead of the round-robin accessory", () => {
    for (const look of anchored("a2")) {
      expect(look.itemIds.filter((id) => id === "a2")).toHaveLength(1);
      expect(look.itemIds).not.toContain("a1");
    }
  });
});

describe("pickStylingPool", () => {
  type Piece = StylableItem & { last_offered_at: number | null };
  const piece = (id: string, category: Piece["category"], last: number | null = null): Piece => ({
    id, name: id, category, colour: "blue", last_offered_at: last,
  });
  const many: Piece[] = [
    ...Array.from({ length: 30 }, (_, i) => piece(`t${i}`, "top")),
    ...Array.from({ length: 30 }, (_, i) => piece(`b${i}`, "bottom")),
    ...Array.from({ length: 12 }, (_, i) => piece(`s${i}`, "shoes")),
    ...Array.from({ length: 12 }, (_, i) => piece(`o${i}`, "outerwear")),
    ...Array.from({ length: 6 }, (_, i) => piece(`a${i}`, "accessories")),
    ...Array.from({ length: 2 }, (_, i) => piece(`k${i}`, "belt")),
    ...Array.from({ length: 2 }, (_, i) => piece(`g${i}`, "bag")),
    ...Array.from({ length: 3 }, (_, i) => piece(`d${i}`, "dress")),
  ]; // 93 pieces
  const ids = (pool: Piece[]) => pool.map((p) => p.id);
  const count = (pool: Piece[], category: Piece["category"]) => pool.filter((p) => p.category === category).length;

  it("returns everything when under the cap, anchor first", () => {
    expect(pickStylingPool(many.slice(0, 20), 40)).toHaveLength(20);
    expect(pickStylingPool(many.slice(0, 20), 40, "t5")[0].id).toBe("t5");
  });

  it("fills the cap with a proportional share of every category", () => {
    const pool = pickStylingPool(many, 40);
    expect(pool).toHaveLength(40);
    expect(new Set(ids(pool)).size).toBe(40);
    for (const category of ["top", "bottom", "dress", "shoes", "outerwear", "belt", "bag", "accessories"] as const) {
      expect(count(pool, category)).toBeGreaterThanOrEqual(1);
    }
    expect(count(pool, "top")).toBeGreaterThan(count(pool, "shoes"));
  });

  it("always includes the anchor, first, even when it was offered recently", () => {
    const recent = many.map((p) => (p.id === "b29" ? { ...p, last_offered_at: Date.now() } : p));
    const pool = pickStylingPool(recent, 40, "b29");
    expect(pool[0].id).toBe("b29");
    expect(pool).toHaveLength(40);
  });

  it("prefers never-offered and long-ago pieces over recently offered ones", () => {
    const aged = many.map((p) => ({ ...p, last_offered_at: p.id.startsWith("t") ? (p.id === "t0" ? 1 : 1000) : null }));
    const tops = pickStylingPool(aged, 40).filter((p) => p.category === "top");
    expect(ids(tops)).toContain("t0");
    expect(tops.every((p) => p.id === "t0" || p.last_offered_at === 1000)).toBe(true);
  });

  it("gives every piece a turn within ceil(N / max) requests", () => {
    let wardrobe = many;
    const seen = new Set<string>();
    for (let round = 1; round <= 3; round++) {
      const pool = pickStylingPool(wardrobe, 40);
      const picked = new Set(ids(pool));
      pool.forEach((p) => seen.add(p.id));
      wardrobe = wardrobe.map((p) => (picked.has(p.id) ? { ...p, last_offered_at: round } : p));
    }
    expect(seen.size).toBe(many.length);
  });

  it("is deterministic for a fixed random source", () => {
    expect(ids(pickStylingPool(many, 40, null, () => 0.5))).toEqual(ids(pickStylingPool(many, 40, null, () => 0.5)));
  });
});
