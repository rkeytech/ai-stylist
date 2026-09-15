import { NextResponse } from "next/server";
import { suggestLooks } from "@/lib/ai";
import { assertSameOrigin, handle, HttpError, requireUser } from "@/lib/http";
import { withImages } from "@/lib/item-images";
import { canStyle } from "@/lib/outfits";
import { listItems, listLooks, replaceLooks, toLook } from "@/lib/repo";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ looks: listLooks(user.id).map(toLook) });
});

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const rows = listItems(user.id);
  if (!canStyle(rows)) {
    throw new HttpError("Add at least a top and a bottom, or a dress, so the stylist has something to work with.", 422);
  }

  const drafts = await suggestLooks(await withImages(rows));
  const looks = replaceLooks(user.id, drafts).map(toLook);
  return NextResponse.json({ looks });
});
