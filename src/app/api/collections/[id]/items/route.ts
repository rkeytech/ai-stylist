import { NextResponse } from "next/server";
import { assertSameOrigin, handle, HttpError, readJson, requireUser } from "@/lib/http";
import { COLLECTION_NOT_FOUND } from "@/lib/collections";
import { listItems, setCollectionItems, toCollection } from "@/lib/repo";

/** Replaces the collection's membership with exactly `{ itemIds }`. */
export const PUT = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { id } = await params;
  const { itemIds } = await readJson(request);
  if (!Array.isArray(itemIds) || !itemIds.every((value) => typeof value === "string")) {
    throw new HttpError("Expected `itemIds` to be a list of item ids.", 400);
  }

  const owned = new Set(listItems(user.id).map((item) => item.id));
  if (!itemIds.every((itemId) => owned.has(itemId))) {
    throw new HttpError("Some of those pieces aren't in your wardrobe.", 400);
  }

  const updated = setCollectionItems(user.id, id, itemIds);
  if (!updated) throw new HttpError(COLLECTION_NOT_FOUND, 404);
  return NextResponse.json({ collection: toCollection(updated) });
});
