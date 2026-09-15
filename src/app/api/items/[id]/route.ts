import { NextResponse } from "next/server";
import { assertSameOrigin, handle, HttpError, readJson, requireUser } from "@/lib/http";
import { addColour, deleteItem, toWardrobeItem, updateItem } from "@/lib/repo";
import { deleteImage } from "@/lib/storage";
import { cleanText, isCategory } from "@/lib/wardrobe";

export const PATCH = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson(request);

  const name = cleanText(body.name, 60);
  const category = body.category;
  const colour = cleanText(body.colour, 30).toLowerCase();
  if (!name) throw new HttpError("Please enter a name.", 400);
  if (!isCategory(category)) throw new HttpError("Please choose a valid category.", 400);
  if (!colour) throw new HttpError("Please enter a colour.", 400);

  const updated = updateItem(user.id, id, { name, category, colour });
  if (!updated) throw new HttpError("That item wasn't found in your wardrobe.", 404);
  addColour(colour);
  return NextResponse.json({ item: toWardrobeItem(updated) });
});

export const DELETE = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { id } = await params;
  const removed = deleteItem(user.id, id);
  if (!removed) throw new HttpError("That item wasn't found in your wardrobe.", 404);
  await deleteImage(removed.image_path);
  return NextResponse.json({ ok: true });
});
