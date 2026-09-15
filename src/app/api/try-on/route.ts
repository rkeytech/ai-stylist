import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { generateTryOn } from "@/lib/ai";
import { assertSameOrigin, handle, HttpError, readForm, readImageFile, requireUser } from "@/lib/http";
import { withImages } from "@/lib/item-images";
import {
  deleteTryOn,
  getItem,
  getLook,
  insertTryOn,
  listTryOns,
  toLook,
  toTryOn,
  type ItemRow,
} from "@/lib/repo";
import { deleteImage, saveImage } from "@/lib/storage";
import { cleanText } from "@/lib/wardrobe";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ tryOns: listTryOns(user.id, true).map(toTryOn) });
});

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const form = await readForm(request);

  const lookRow = getLook(user.id, cleanText(form.get("lookId"), 64));
  if (!lookRow) throw new HttpError("Pick one of your stylist's looks first.", 400);
  const look = toLook(lookRow);

  const { bytes, mime } = await readImageFile(form.get("photo"));
  const rows = look.itemIds.map((id) => getItem(user.id, id)).filter((row): row is ItemRow => Boolean(row));
  if (rows.length !== look.itemIds.length) {
    throw new HttpError("Some pieces in this look have been removed. Ask the stylist for fresh looks.", 409);
  }

  const result = await generateTryOn(
    { data: bytes, mimeType: mime },
    await withImages(rows),
    cleanText(form.get("aspectRatio"), 8),
  );

  // Keep only the newest unsaved result per user; saved ones stay until deleted.
  for (const stale of listTryOns(user.id, false)) {
    deleteTryOn(user.id, stale.id);
    await deleteImage(stale.image_path);
  }

  const id = randomUUID();
  const imagePath = await saveImage(user.id, id, result.data, result.mimeType);
  const row = insertTryOn({
    id,
    user_id: user.id,
    look_id: look.id,
    look_title: look.title,
    image_path: imagePath,
    mime_type: result.mimeType,
  });
  return NextResponse.json({ tryOn: toTryOn(row) }, { status: 201 });
});
