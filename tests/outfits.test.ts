import { describe, expect, it } from "vitest";
import { canStyle, checkOutfit, mockLooks, sanitizeLooks, type StylableItem } from "@/lib/outfits";

const items: StylableItem[] = [
  { id: "t1", name: "Blue shirt", category: "top", colour: "blue" },
  { id: "t2", name: "Striped tee", category: "top", colour: "white" },
  { id: "b1", name: "Wide-leg trousers", category: "bottom", colour: "pink" },
  { id: "d1", name: "Slip dress", category: "dress", colour: "green" },
  { id: "s1", name: "Espadrilles", category: "shoes", colour: "tan" },
  { id: "s2", name: "Heels", category: "shoes", colour: "lime" },
  { id: "o1", name: "Utility jacket", category: "outerwear", colour: "beige" },
  { id: "a1", name: "Gold hoop earrings", category: "accessories", colour: "gold" },
  { id: "a2", name: "Leather watch", category: "accessories", colour: "brown" },
];
const byId = new Map(items.map((item) => [item.id, item]));

describe("checkOutfit", () => {
  it("accepts a top and a bottom, with optional shoes and outerwear", () => {
    expect(checkOutfit(["t1", "b1"], byId)).toBeNull();
    expect(checkOutfit(["t1", "b1", "s1", "o1"], byId)).toBeNull();
  });

  it("accepts a dress on its own or with extras", () => {
    expect(checkOutfit(["d1"], byId)).toBeNull();
    expect(checkOutfit(["d1", "s2", "o1"], byId)).toBeNull();
  });

  it("allows any number of accessories", () => {
    expect(checkOutfit(["t1", "b1", "a1"], byId)).toBeNull();
    expect(checkOutfit(["t1", "b1", "a1", "a2"], byId)).toBeNull();
    expect(checkOutfit(["d1", "a1", "a2"], byId)).toBeNull();
  });

  it("never combines a dress with a bottom or a top", () => {
    expect(checkOutfit(["d1", "b1"], byId)).toMatch(/dress/);
    expect(checkOutfit(["d1", "t1"], byId)).toMatch(/dress/);
  });

  it("rejects incomplete, duplicated, doubled-up or unknown pieces", () => {
    expect(checkOutfit([], byId)).not.toBeNull();
    expect(checkOutfit(["t1"], byId)).not.toBeNull();
    expect(checkOutfit(["b1", "s1"], byId)).not.toBeNull();
    expect(checkOutfit(["t1", "t2", "b1"], byId)).not.toBeNull();
    expect(checkOutfit(["t1", "b1", "s1", "s2"], byId)).not.toBeNull();
    expect(checkOutfit(["t1", "b1", "b1"], byId)).not.toBeNull();
    expect(checkOutfit(["t1", "made-up"], byId)).not.toBeNull();
  });
});

describe("sanitizeLooks", () => {
  it("keeps valid looks, drops invalid and duplicate ones, caps at three and orders pieces", () => {
    const raw = {
      looks: [
        { title: "Dress with trousers", itemIds: ["d1", "b1"], reason: "Breaks the rules." },
        { title: "Resort", itemIds: ["s1", "b1", "t1"], reason: "Pink and blue." },
        { title: "Same again", itemIds: ["t1", "b1", "s1"], reason: "Duplicate." },
        { title: "Hallucinated", itemIds: ["t9", "b1"], reason: "Item does not exist." },
        { title: "Evening", itemIds: ["d1", "s2"], reason: "Green and lime." },
        { title: "Layered", itemIds: ["o1", "t2", "b1"], reason: "" },
        { title: "One too many", itemIds: ["t2", "b1", "s2"], reason: "Fourth look." },
      ],
    };

    const looks = sanitizeLooks(raw, items);

    expect(looks.map((look) => look.title)).toEqual(["Resort", "Evening", "Layered"]);
    expect(looks[0].itemIds).toEqual(["t1", "b1", "s1"]);
    expect(looks[2].itemIds).toEqual(["o1", "t2", "b1"]);
    expect(looks[2].reason).toContain("beige utility jacket");
  });

  it("tolerates malformed model output", () => {
    expect(sanitizeLooks(null, items)).toEqual([]);
    expect(sanitizeLooks("not json", items)).toEqual([]);
    expect(sanitizeLooks({ looks: "nope" }, items)).toEqual([]);
    expect(sanitizeLooks([{ itemIds: ["t1", 5, "b1"] }], items)).toEqual([]);
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

  it("doesn't repeat a colour the item name already mentions", () => {
    const named: StylableItem[] = [
      { id: "a", name: "Blue shirt", category: "top", colour: "blue" },
      { id: "b", name: "Jeans", category: "bottom", colour: "indigo" },
    ];
    const [look] = mockLooks(named);
    expect(look.reason).toContain("the blue shirt and the indigo jeans");
    expect(look.reason).not.toMatch(/blue blue/i);
  });

  it("needs a dress, or a top and a bottom", () => {
    expect(canStyle([{ category: "top" }, { category: "shoes" }])).toBe(false);
    expect(canStyle([{ category: "top" }, { category: "bottom" }])).toBe(true);
    expect(canStyle([{ category: "dress" }])).toBe(true);
    expect(mockLooks(items.filter((item) => item.category === "top"))).toEqual([]);
  });
});
