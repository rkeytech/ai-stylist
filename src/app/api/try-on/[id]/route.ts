import { NextResponse } from "next/server";
import { assertSameOrigin, handle, HttpError, requireUser } from "@/lib/http";
import { deleteTryOn, getTryOn, markTryOnSaved, toTryOn } from "@/lib/repo";
import { deleteImage } from "@/lib/storage";

type Context = { params: Promise<{ id: string }> };

/** Save a generated try-on to the user's collection. */
export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { id } = await params;
  if (!markTryOnSaved(user.id, id)) throw new HttpError("Try-on not found.", 404);
  return NextResponse.json({ tryOn: toTryOn(getTryOn(user.id, id)!) });
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { id } = await params;
  const removed = deleteTryOn(user.id, id);
  if (!removed) throw new HttpError("Try-on not found.", 404);
  await deleteImage(removed.image_path);
  return NextResponse.json({ ok: true });
});
