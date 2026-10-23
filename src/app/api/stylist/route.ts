import { NextResponse } from "next/server";
import { suggestLooks } from "@/lib/ai";
import { assertSameOrigin, handle, HttpError, readJson, requireUser } from "@/lib/http";
import { COLLECTION_NOT_FOUND } from "@/lib/collections";
import { withImages } from "@/lib/item-images";
import { cleanText, describePiece, MAX_OCCASION_LENGTH } from "@/lib/wardrobe";
import { canStyle, canStyleAround, missingAround } from "@/lib/outfits";
import {
  getCollection,
  getItem,
  listCollectionItems,
  listItems,
  listLooks,
  replaceLooks,
  toLook,
} from "@/lib/repo";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ looks: listLooks(user.id).map(toLook) });
});

interface StylistOptions {
  occasion: string | null;
  collectionId: string | null;
  anchorItemId: string | null;
}

function readId(body: Record<string, unknown>, key: "collectionId" | "anchorItemId", what: string): string | null {
  const value = body[key];
  if (value != null && typeof value !== "string") throw new HttpError(`Expected \`${key}\` to be ${what} id.`, 400);
  return value || null;
}

/**
 * The body is optional (a bare "Style me" sends none); when present it is
 * `{ occasion?: string, collectionId?: string, anchorItemId?: string }`.
 */
async function readStylistOptions(request: Request): Promise<StylistOptions> {
  if (!(await request.clone().text()).trim()) return { occasion: null, collectionId: null, anchorItemId: null };
  const body = await readJson(request);
  return {
    occasion: cleanText(body.occasion, MAX_OCCASION_LENGTH) || null,
    collectionId: readId(body, "collectionId", "a collection"),
    anchorItemId: readId(body, "anchorItemId", "an item"),
  };
}

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { occasion, collectionId, anchorItemId } = await readStylistOptions(request);

  // A collection narrows what the stylist draws from; without one it uses the whole wardrobe.
  const collection = collectionId ? getCollection(user.id, collectionId) : null;
  if (collectionId && !collection) throw new HttpError(COLLECTION_NOT_FOUND, 404);
  // The anchor joins the pool even when it isn't in the chosen collection.
  const anchor = anchorItemId ? getItem(user.id, anchorItemId) : null;
  if (anchorItemId && !anchor) throw new HttpError("That item wasn't found in your wardrobe.", 404);

  const base = collection ? listCollectionItems(user.id, collection.id) : listItems(user.id);
  const rows = anchor && !base.some((row) => row.id === anchor.id) ? [anchor, ...base] : base;

  if (anchor) {
    if (!canStyleAround(rows, anchor)) {
      const piece = describePiece(anchor).toLowerCase();
      throw new HttpError(
        collection
          ? `“${collection.name}” needs ${missingAround(anchor)} to style around your ${piece}.`
          : `Add ${missingAround(anchor)} to your wardrobe to style around your ${piece}.`,
        422,
      );
    }
  } else if (!canStyle(rows)) {
    throw new HttpError(
      collection
        ? `“${collection.name}” needs at least a top and a bottom, or a dress, before the stylist can work with it.`
        : "Add at least a top and a bottom, or a dress, so the stylist has something to work with.",
      422,
    );
  }

  const withPhotos = await withImages(rows);
  if (anchor && !withPhotos.some((item) => item.id === anchor.id)) {
    throw new HttpError("That piece's photo couldn't be loaded, so the stylist can't work with it.", 422);
  }
  const drafts = await suggestLooks(withPhotos, { occasion, anchorId: anchor?.id ?? null });
  const looks = replaceLooks(user.id, drafts, {
    occasion,
    collectionName: collection?.name ?? null,
    anchorItemId: anchor?.id ?? null,
  }).map(toLook);
  return NextResponse.json({ looks });
});
