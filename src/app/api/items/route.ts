import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { AiError, tagItem } from "@/lib/ai";
import { assertSameOrigin, handle, readForm, readImageFile, requireUser } from "@/lib/http";
import { addColour, insertItem, listItems, toWardrobeItem } from "@/lib/repo";
import { deleteImage, saveImage } from "@/lib/storage";
import { cleanText, isCategory } from "@/lib/wardrobe";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ items: listItems(user.id).map(toWardrobeItem) });
});

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const form = await readForm(request);
  const { bytes, mime } = await readImageFile(form.get("image"));

  const categoryInput = form.get("category");
  let name = cleanText(form.get("name"), 60);
  let category = isCategory(categoryInput) ? categoryInput : null;
  let colour = cleanText(form.get("colour"), 30).toLowerCase();

  // Anything the owner left blank is filled in by the vision model.
  if (!name || !category || !colour) {
    const tags = await tagItem({ data: bytes, mimeType: mime }, name).catch((err: unknown) => {
      if (err instanceof AiError && err.status !== 422) {
        throw new AiError(`${err.message} Or fill in the name, category and colour yourself to skip the AI.`, err.status);
      }
      throw err;
    });
    name ||= tags.name;
    category ??= tags.category;
    colour ||= tags.colour;
  }

  const id = randomUUID();
  const imagePath = await saveImage(user.id, id, bytes, mime);
  try {
    const row = insertItem({ id, user_id: user.id, name, category, colour, image_path: imagePath, mime_type: mime });
    addColour(colour);
    return NextResponse.json({ item: toWardrobeItem(row) }, { status: 201 });
  } catch (err) {
    await deleteImage(imagePath);
    throw err;
  }
});
