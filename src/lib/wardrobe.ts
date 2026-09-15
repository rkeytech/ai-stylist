export const CATEGORIES = ["top", "bottom", "dress", "shoes", "outerwear"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  top: "Top",
  bottom: "Bottom",
  dress: "Dress",
  shoes: "Shoes",
  outerwear: "Outerwear",
};

/** Display order of pieces inside an outfit. */
export const CATEGORY_ORDER: Record<Category, number> = {
  outerwear: 0,
  top: 1,
  dress: 2,
  bottom: 3,
  shoes: 4,
};

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

export interface WardrobeItem {
  id: string;
  name: string;
  category: Category;
  colour: string;
  imageUrl: string;
  createdAt: number;
}

export interface Look {
  id: string;
  title: string;
  reason: string;
  itemIds: string[];
  createdAt: number;
}

export interface TryOnResult {
  id: string;
  lookId: string | null;
  lookTitle: string;
  imageUrl: string;
  saved: boolean;
  createdAt: number;
}

// Keyword fallbacks, used by mock mode and when the vision model is unsure.
const CATEGORY_KEYWORDS: [Category, RegExp][] = [
  ["dress", /\b(dress|gown|jumpsuit|playsuit|romper)\b/i],
  ["outerwear", /\b(jacket|coat|blazer|parka|trench|bomber|cardigan|gilet|puffer|anorak)\b/i],
  ["shoes", /\b(shoes?|heels?|sneakers?|trainers?|boots?|sandals?|loafers?|flats|espadrilles?|pumps|mules?)\b/i],
  ["bottom", /\b(trousers|pants|jeans|skirt|shorts|leggings|chinos|joggers|culottes)\b/i],
  ["top", /\b(shirt|t-?shirt|tee|top|blouse|sweater|jumper|hoodie|tank|polo|knit|sweatshirt|camisole|bodysuit)\b/i],
];

const COLOUR_WORDS = [
  "black", "white", "cream", "ivory", "beige", "camel", "grey", "gray", "charcoal", "navy",
  "blue", "denim", "teal", "green", "olive", "khaki", "yellow", "mustard", "orange", "red",
  "burgundy", "pink", "lilac", "purple", "brown", "tan", "gold", "silver", "multicolour",
];

export function guessCategory(text: string): Category | null {
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(text)) return category;
  }
  return null;
}

export function guessColour(text: string): string | null {
  const lower = text.toLowerCase();
  const found = COLOUR_WORDS.find((colour) => new RegExp(`\\b${colour}\\b`).test(lower));
  if (!found) return null;
  return found === "gray" ? "grey" : found;
}

/** "blue shirt"-style description that doesn't repeat a colour the name already mentions. */
export function describePiece(item: { name: string; colour: string }): string {
  const name = item.name.trim();
  const colour = item.colour.trim();
  if (!colour || colour === "neutral" || name.toLowerCase().includes(colour.toLowerCase())) return name;
  return `${colour} ${name}`;
}

/** Trim, collapse whitespace and cap the length of free text. */
export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
