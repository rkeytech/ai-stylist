import { NextResponse } from "next/server";
import { assertSameOrigin, handle, HttpError, readJson, requireUser } from "@/lib/http";
import { COLLECTION_NOT_FOUND, readCollectionName } from "@/lib/collections";
import { deleteCollection, getCollection, renameCollection, toCollection } from "@/lib/repo";

type Context = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  const collection = getCollection(user.id, (await params).id);
  if (!collection) throw new HttpError(COLLECTION_NOT_FOUND, 404);
  return NextResponse.json({ collection: toCollection(collection) });
});

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { id } = await params;
  if (!getCollection(user.id, id)) throw new HttpError(COLLECTION_NOT_FOUND, 404);
  const name = readCollectionName(user.id, await readJson(request), id);
  const renamed = renameCollection(user.id, id, name);
  if (!renamed) throw new HttpError(COLLECTION_NOT_FOUND, 404);
  return NextResponse.json({ collection: toCollection(renamed) });
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  if (!deleteCollection(user.id, (await params).id)) throw new HttpError(COLLECTION_NOT_FOUND, 404);
  return NextResponse.json({ ok: true });
});
