import { CATEGORY_ORDER, cleanText, describePiece, type Category } from "./wardrobe";

export const MAX_LOOKS = 3;

export interface StylableItem {
  id: string;
  name: string;
  category: Category;
  colour: string;
}

export interface LookDraft {
  title: string;
  reason: string;
  itemIds: string[];
}

function hasCategory(items: Pick<StylableItem, "category">[], category: Category) {
  return items.some((item) => item.category === category);
}

/** A wardrobe can be styled once it holds a dress, or a top and a bottom. */
export function canStyle(items: Pick<StylableItem, "category">[]): boolean {
  return (
    hasCategory(items, "dress") || (hasCategory(items, "top") && hasCategory(items, "bottom"))
  );
}

/** The categories an outfit is built on; everything else (shoes, outerwear, accessories) is an extra. */
const isBaseCategory = (category: Category) => category === "top" || category === "bottom" || category === "dress";

/**
 * Whether at least one valid outfit containing `anchor` can be built from `items` (which include the
 * anchor): a top needs a bottom, a bottom needs a top, a dress always works, and an extra just needs
 * the pool to be stylable at all.
 */
export function canStyleAround(
  items: Pick<StylableItem, "category">[],
  anchor: Pick<StylableItem, "category">,
): boolean {
  if (anchor.category === "dress") return true;
  if (anchor.category === "top") return hasCategory(items, "bottom");
  if (anchor.category === "bottom") return hasCategory(items, "top");
  return canStyle(items);
}

/** What a pool lacks when canStyleAround() fails, phrased for messages ("Add a bottom..."). */
export function missingAround(anchor: Pick<StylableItem, "category">): string {
  if (anchor.category === "top") return "a bottom";
  if (anchor.category === "bottom") return "a top";
  return "a top and a bottom, or a dress";
}

/**
 * Checks the outfit rules from the stylist brief:
 * (top + bottom) or (dress), plus optional shoes, outerwear and accessories,
 * never a dress with a bottom, and only items the user owns.
 * Returns a reason string when invalid, or null when the outfit is valid.
 */
export function checkOutfit(itemIds: string[], byId: Map<string, StylableItem>): string | null {
  if (itemIds.length === 0) return "empty outfit";
  if (new Set(itemIds).size !== itemIds.length) return "duplicate item";

  const counts: Record<Category, number> = { top: 0, bottom: 0, dress: 0, shoes: 0, outerwear: 0, accessories: 0 };
  for (const id of itemIds) {
    const item = byId.get(id);
    if (!item) return `unknown item ${id}`;
    counts[item.category]++;
  }

  if (counts.shoes > 1 || counts.outerwear > 1) return "more than one pair of shoes or outerwear";
  if (counts.dress > 0) {
    if (counts.dress > 1) return "more than one dress";
    if (counts.bottom > 0 || counts.top > 0) return "a dress can't be combined with a top or bottom";
    return null;
  }
  if (counts.top !== 1 || counts.bottom !== 1) return "needs one top and one bottom, or a dress";
  return null;
}

export function orderItemIds(itemIds: string[], byId: Map<string, StylableItem>): string[] {
  return [...itemIds].sort(
    (a, b) => CATEGORY_ORDER[byId.get(a)!.category] - CATEGORY_ORDER[byId.get(b)!.category],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeItems(itemIds: string[], byId: Map<string, StylableItem>): string {
  const names = itemIds.map((id) => `the ${describePiece(byId.get(id)!).toLowerCase()}`);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export interface LookOptions {
  /** Styling around one piece: every look must include the item with this id. */
  anchorId?: string | null;
}

/**
 * Turns untrusted model output into at most MAX_LOOKS valid, distinct looks.
 * Invalid outfits (unknown ids, broken rules, missing the anchor) are dropped rather than repaired.
 */
export function sanitizeLooks(raw: unknown, items: StylableItem[], { anchorId }: LookOptions = {}): LookDraft[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const entries = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.looks) ? raw.looks : [];

  const seen = new Set<string>();
  const looks: LookDraft[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.itemIds)) continue;
    const itemIds = entry.itemIds.filter((id): id is string => typeof id === "string");
    if (itemIds.length !== entry.itemIds.length || checkOutfit(itemIds, byId)) continue;
    if (anchorId && !itemIds.includes(anchorId)) continue;

    const key = [...itemIds].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const ordered = orderItemIds(itemIds, byId);
    looks.push({
      title: cleanText(entry.title, 60) || `Look ${looks.length + 1}`,
      reason: cleanText(entry.reason, 400) || `Pairs ${describeItems(ordered, byId)}.`,
      itemIds: ordered,
    });
    if (looks.length === MAX_LOOKS) break;
  }
  return looks;
}

const MOCK_TITLES = ["Easy Weekend Edit", "City Day Uniform", "Golden Hour Ease"];

/**
 * Deterministic, rule-following suggestions used when AI_MOCK=true. With an anchor, a top/bottom/dress
 * anchor keeps only the combinations containing it; a shoes/outerwear/accessory anchor replaces the
 * round-robin pick for its category, so it lands in every look.
 */
export function mockLooks(items: StylableItem[], { anchorId }: LookOptions = {}): LookDraft[] {
  const anchor = anchorId ? items.find((item) => item.id === anchorId) : undefined;
  const of = (category: Category) =>
    anchor?.category === category && !isBaseCategory(category)
      ? [anchor]
      : items.filter((item) => item.category === category);
  const [tops, bottoms, dresses, shoes, outerwear, accessories] = [
    of("top"), of("bottom"), of("dress"), of("shoes"), of("outerwear"), of("accessories"),
  ];

  const bases: StylableItem[][] = [
    ...dresses.map((dress) => [dress]),
    ...tops.flatMap((top) => bottoms.map((bottom) => [top, bottom])),
  ].filter((base) => !anchor || !isBaseCategory(anchor.category) || base.includes(anchor));

  const byId = new Map(items.map((item) => [item.id, item]));
  const usage = new Map<string, number>();
  const score = (base: StylableItem[]) => base.reduce((sum, item) => sum + (usage.get(item.id) ?? 0), 0);

  const looks: LookDraft[] = [];
  while (looks.length < MAX_LOOKS && bases.length > 0) {
    // Prefer the combination that reuses the fewest pieces already shown.
    bases.sort((a, b) => score(a) - score(b));
    const base = bases.shift()!;
    const n = looks.length;
    const pieces = [...base];
    if (outerwear.length) pieces.push(outerwear[n % outerwear.length]);
    if (shoes.length) pieces.push(shoes[n % shoes.length]);
    if (accessories.length) pieces.push(accessories[n % accessories.length]);
    pieces.forEach((item) => usage.set(item.id, (usage.get(item.id) ?? 0) + 1));

    const itemIds = orderItemIds(pieces.map((item) => item.id), byId);
    looks.push({
      title: MOCK_TITLES[n],
      reason: `Pairs ${describeItems(itemIds, byId)}. (Mock suggestion - add an OpenRouter key for real styling.)`,
      itemIds,
    });
  }
  return looks;
}
