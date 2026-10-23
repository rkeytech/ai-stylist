import { NextResponse } from "next/server";
import { suggestLooks } from "@/lib/ai";
import { assertSameOrigin, handle, HttpError, readJson, requireUser } from "@/lib/http";
import { withImages } from "@/lib/item-images";
import { cleanText, MAX_OCCASION_LENGTH } from "@/lib/wardrobe";
import { canStyle } from "@/lib/outfits";
import { listItems, listLooks, replaceLooks, toLook } from "@/lib/repo";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ looks: listLooks(user.id).map(toLook) });
});

/** The body is optional (a bare "Style me" sends none); when present it is `{ occasion?: string }`. */
async function readOccasion(request: Request): Promise<string | null> {
  if (!(await request.clone().text()).trim()) return null;
  const body = await readJson(request);
  return cleanText(body.occasion, MAX_OCCASION_LENGTH) || null;
}

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const occasion = await readOccasion(request);
  const rows = listItems(user.id);
  if (!canStyle(rows)) {
    throw new HttpError("Add at least a top and a bottom, or a dress, so the stylist has something to work with.", 422);
  }

  const drafts = await suggestLooks(await withImages(rows), { occasion });
  const looks = replaceLooks(user.id, drafts, occasion).map(toLook);
  return NextResponse.json({ looks });
});
