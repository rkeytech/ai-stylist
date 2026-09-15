import { NextResponse } from "next/server";
import { assertSameOrigin, handle, HttpError, requireUser } from "@/lib/http";
import { deleteItem } from "@/lib/repo";
import { deleteImage } from "@/lib/storage";

export const DELETE = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { id } = await params;
  const removed = deleteItem(user.id, id);
  if (!removed) throw new HttpError("That item wasn't found in your wardrobe.", 404);
  await deleteImage(removed.image_path);
  return NextResponse.json({ ok: true });
});
