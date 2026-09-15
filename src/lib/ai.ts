import { ApiError, GoogleGenAI, type Part } from "@google/genai";
import { sniffImageMime, type ImageMime } from "./image-mime";
import { mockLooks, sanitizeLooks, type LookDraft, type StylableItem } from "./outfits";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  cleanText,
  describePiece,
  guessCategory,
  guessColour,
  isCategory,
  type Category,
} from "./wardrobe";

export class AiError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export type AiMode = "live" | "mock" | "unconfigured";

export function aiMode(): AiMode {
  if (process.env.AI_MOCK === "true") return "mock";
  return process.env.GEMINI_API_KEY ? "live" : "unconfigured";
}

export interface ImageInput {
  data: Uint8Array;
  mimeType: string;
}

export type ItemWithImage = StylableItem & { image: ImageInput };

export const TRY_ON_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;

let client: GoogleGenAI | undefined;

function gemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiError(
      "AI isn't configured yet. Add GEMINI_API_KEY to .env.local (or set AI_MOCK=true) and restart the server.",
      503,
    );
  }
  // No SDK retries: an overloaded model can take ~20s just to answer 503, so we
  // switch to the fallback model instead of waiting on the same one again.
  client ??= new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 1 } },
  });
  return client;
}

// Main model first, then a fallback that's used only while the main one is overloaded.
// Set a *_FALLBACK_MODEL variable to an empty string to disable the fallback.
// Vision defaults work on the free Google AI Studio tier. Image generation (try-on)
// has no free quota, so it needs billing enabled on the key's project.
const visionModels = () => [
  process.env.GEMINI_VISION_MODEL || "gemini-3.1-flash-lite",
  process.env.GEMINI_VISION_FALLBACK_MODEL ?? "gemini-3.6-flash",
];
const imageModels = () => [
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
  process.env.GEMINI_IMAGE_FALLBACK_MODEL ?? "gemini-3.1-flash-lite-image",
];

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function apiStatus(err: unknown): number | undefined {
  return err instanceof ApiError ? err.status : undefined;
}

/** Turns a Gemini failure into a message the user can act on. */
export function toAiError(err: unknown): AiError {
  const status = apiStatus(err);
  if (status === 429) {
    const outOfQuota = err instanceof Error && /quota|billing/i.test(err.message);
    return new AiError(
      outOfQuota
        ? "Your Gemini API key has no quota for this model. Free keys can't generate images (try-on): enable billing in Google AI Studio, or wait for the free quota to reset."
        : "Gemini's rate limit was reached. Please wait a minute and try again.",
      429,
    );
  }
  if (status !== undefined && TRANSIENT_STATUSES.has(status)) {
    return new AiError("Gemini is overloaded right now (high demand). Please try again in a minute.", 503);
  }
  if (status === 401 || status === 403) {
    return new AiError("Gemini rejected the API key. Check GEMINI_API_KEY in .env.local and restart the server.", 502);
  }
  if (status === 400) {
    return new AiError("Gemini couldn't process that request. Try a different, clearer photo.", 502);
  }
  if (status === 404) {
    return new AiError(
      "The configured Gemini model isn't available to your API key. Update the model names in .env.local.",
      502,
    );
  }
  return new AiError("The AI service couldn't complete that request. Please try again in a moment.");
}

/**
 * Runs the request on each model in turn. It moves on when a model is overloaded or
 * rate-limited, or isn't available to this key (404), and stops on any other error.
 */
export async function withModelFallback<T>(models: string[], run: (model: string) => Promise<T>): Promise<T> {
  const errors: unknown[] = [];
  for (const model of new Set(models.filter(Boolean))) {
    try {
      return await run(model);
    } catch (err) {
      errors.push(err);
      const status = apiStatus(err);
      console.error(`[ai] Gemini request to ${model} failed${status ? ` (HTTP ${status})` : ""}:`, err);
      if (status === undefined || !(TRANSIENT_STATUSES.has(status) || status === 404)) break;
    }
  }
  // An overload is the most useful thing to report, even if a later fallback failed differently.
  const overload = errors.find((err) => TRANSIENT_STATUSES.has(apiStatus(err) ?? 0));
  throw toAiError(overload ?? errors[0]);
}

function imagePart(image: ImageInput): Part {
  return { inlineData: { data: Buffer.from(image.data).toString("base64"), mimeType: image.mimeType } };
}

function parseJson(text: string | undefined): unknown {
  if (!text) return null;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ---- 1. Auto-tagging uploads (vision) ---------------------------------------

export interface ItemTags {
  name: string;
  category: Category;
  colour: string;
}

const TAG_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Short shop-style name, 2-4 words, e.g. 'Striped wide-leg trousers'." },
    category: { type: "string", enum: [...CATEGORIES] },
    colour: { type: "string", description: "Main colour in 1-2 lowercase words, e.g. 'pink' or 'blue and white'." },
  },
  required: ["name", "category", "colour"],
};

const TAG_PROMPT = `You catalogue clothing for a personal wardrobe app.
Look at the photo and identify the single main clothing item.
- category must be one of: top, bottom, dress, shoes, outerwear (jackets, coats, blazers and cardigans are outerwear).
- colour is the dominant colour as a shopper would say it.
- name is a short, specific product-style name.`;

export async function tagItem(image: ImageInput, nameHint: string): Promise<ItemTags> {
  const hint = cleanText(nameHint, 60);
  if (aiMode() === "mock") {
    return {
      name: hint || "Untitled piece",
      category: guessCategory(hint) ?? "top",
      colour: guessColour(hint) ?? "neutral",
    };
  }

  const ai = gemini();
  const prompt = hint ? `${TAG_PROMPT}\nThe owner describes it as: "${hint}".` : TAG_PROMPT;
  const response = await withModelFallback(visionModels(), (model) =>
    ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [imagePart(image), { text: prompt }] }],
      config: { responseMimeType: "application/json", responseJsonSchema: TAG_SCHEMA },
    }),
  );

  const parsed = parseJson(response.text) as Partial<Record<keyof ItemTags, unknown>> | null;
  const category = isCategory(parsed?.category) ? parsed.category : guessCategory(hint);
  if (!category) {
    throw new AiError("The AI couldn't tell what kind of item this is. Choose a category and try again.", 422);
  }
  return {
    name: hint || cleanText(parsed?.name, 60) || "Untitled piece",
    category,
    colour: cleanText(parsed?.colour, 30).toLowerCase() || guessColour(hint) || "neutral",
  };
}

// ---- 2. The stylist (vision) ------------------------------------------------

const LOOKS_SCHEMA = {
  type: "object",
  properties: {
    looks: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Evocative 2-4 word name for the look." },
          itemIds: { type: "array", items: { type: "string" } },
          reason: { type: "string", description: "1-2 sentences naming the actual colours and items." },
        },
        required: ["title", "itemIds", "reason"],
      },
    },
  },
  required: ["looks"],
};

const STYLIST_PROMPT = `You are a warm, precise personal stylist. Suggest 3 outfits built only from the wardrobe items below.
Rules:
- Only use items that exist in this wardrobe, referenced by their exact id.
- An outfit is either (one top + one bottom) or (one dress). Never combine a dress with a top or a bottom.
- Optionally add one pair of shoes and/or one outerwear piece to any outfit.
- Consider colour harmony and how formal each piece is, so every outfit suits one occasion.
- Make the 3 outfits clearly different from each other. If the wardrobe only allows fewer, return fewer.
- For each outfit give a short title and a short, specific reason that mentions the actual colours and items.
The wardrobe items follow, each as a label line and then its photo.`;

const MAX_STYLIST_ITEMS = 40;

export async function suggestLooks(items: ItemWithImage[]): Promise<LookDraft[]> {
  if (aiMode() === "mock") return mockLooks(items);

  const ai = gemini();
  const wardrobe = items.slice(0, MAX_STYLIST_ITEMS);
  const parts: Part[] = [{ text: STYLIST_PROMPT }];
  for (const item of wardrobe) {
    parts.push(
      { text: `id: ${item.id} | category: ${item.category} | colour: ${item.colour} | name: ${item.name}` },
      imagePart(item.image),
    );
  }

  const response = await withModelFallback(visionModels(), (model) =>
    ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: { responseMimeType: "application/json", responseJsonSchema: LOOKS_SCHEMA },
    }),
  );

  const looks = sanitizeLooks(parseJson(response.text), wardrobe);
  if (looks.length === 0) {
    throw new AiError("The stylist couldn't put together a valid outfit this time. Please try again.");
  }
  return looks;
}

// ---- 3. Try-on (image generation) -------------------------------------------

function tryOnPrompt(garments: StylableItem[]): string {
  const outfit = garments.map((g) => `- ${CATEGORY_LABELS[g.category]}: ${describePiece(g)}`).join("\n");
  return `Virtual try-on. The first image is a photo of a person from their camera; the images after it are garments from their wardrobe.
Create a photorealistic image of this same person wearing the outfit:
${outfit}
Keep their face, identity, hair, skin tone, body shape, pose, expression, framing, lighting and background exactly as in the photo - change only the clothing.
Reproduce each garment's colour, pattern, fabric and cut faithfully, replacing what they currently wear in those places.
If a garment would fall outside the frame (for example shoes in a waist-up photo), leave it out instead of changing the framing.`;
}

export async function generateTryOn(
  person: ImageInput,
  garments: ItemWithImage[],
  aspectRatio?: string,
): Promise<{ data: Buffer; mimeType: ImageMime }> {
  if (aiMode() === "mock") {
    const mimeType = sniffImageMime(person.data);
    if (!mimeType) throw new AiError("Unsupported photo format.", 400);
    return { data: Buffer.from(person.data), mimeType };
  }

  const ai = gemini();
  const parts: Part[] = [{ text: tryOnPrompt(garments) }, imagePart(person)];
  for (const garment of garments) {
    parts.push({ text: `${CATEGORY_LABELS[garment.category]}: ${describePiece(garment)}` }, imagePart(garment.image));
  }

  const ratio = TRY_ON_ASPECT_RATIOS.find((r) => r === aspectRatio);
  const response = await withModelFallback(imageModels(), (model) =>
    ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        ...(ratio && { imageConfig: { aspectRatio: ratio } }),
      },
    }),
  );

  const candidate = response.candidates?.[0];
  const imageData = candidate?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data;
  const bytes = imageData ? Buffer.from(imageData, "base64") : null;
  const mimeType = bytes ? sniffImageMime(bytes) : null;
  if (!bytes || !mimeType) {
    const detail = cleanText(
      candidate?.content?.parts?.map((part) => part.text ?? "").join(" ") || candidate?.finishReason,
      160,
    );
    throw new AiError(
      `The image model didn't return a picture${detail ? ` (${detail})` : ""}. Try again with a clear, well-lit photo.`,
    );
  }
  return { data: bytes, mimeType };
}
