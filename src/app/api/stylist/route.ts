import { NextResponse } from "next/server";
import { suggestLooks } from "@/lib/ai";
import { assertSameOrigin, handle, HttpError, readJson, requireUser } from "@/lib/http";
import { COLLECTION_NOT_FOUND } from "@/lib/collections";
import { withImages } from "@/lib/item-images";
import { cleanText, MAX_OCCASION_LENGTH } from "@/lib/wardrobe";
import { canStyle } from "@/lib/outfits";
import { getCollection, listCollectionItems, listItems, listLooks, replaceLooks, toLook } from "@/lib/repo";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ looks: listLooks(user.id).map(toLook) });
});

/**
 * The body is optional (a bare "Style me" sends none); when present it is
 * `{ occasion?: string, collectionId?: string }`.
 */
async function readStylistOptions(request: Request): Promise<{ occasion: string | null; collectionId: string | null }> {
  if (!(await request.clone().text()).trim()) return { occasion: null, collectionId: null };
  const body = await readJson(request);
  if (body.collectionId != null && typeof body.collectionId !== "string") {
    throw new HttpError("Expected `collectionId` to be a collection id.", 400);
  }
  return {
    occasion: cleanText(body.occasion, MAX_OCCASION_LENGTH) || null,
    collectionId: body.collectionId || null,
  };
}

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { occasion, collectionId } = await readStylistOptions(request);

  // A collection narrows what the stylist draws from; without one it uses the whole wardrobe.
  const collection = collectionId ? getCollection(user.id, collectionId) : null;
  if (collectionId && !collection) throw new HttpError(COLLECTION_NOT_FOUND, 404);
  const rows = collection ? listCollectionItems(user.id, collection.id) : listItems(user.id);
  if (!canStyle(rows)) {
    throw new HttpError(
      collection
        ? `“${collection.name}” needs at least a top and a bottom, or a dress, before the stylist can work with it.`
        : "Add at least a top and a bottom, or a dress, so the stylist has something to work with.",
      422,
    );
  }

  const drafts = await suggestLooks(await withImages(rows), { occasion });
  const looks = replaceLooks(user.id, drafts, occasion, collection?.name ?? null).map(toLook);
  return NextResponse.json({ looks });
});
