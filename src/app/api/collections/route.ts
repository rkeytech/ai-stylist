import { NextResponse } from "next/server";
import { assertSameOrigin, handle, readJson, requireUser } from "@/lib/http";
import { readCollectionName } from "@/lib/collections";
import { createCollection, listCollections, toCollection } from "@/lib/repo";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ collections: listCollections(user.id).map(toCollection) });
});

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const name = readCollectionName(user.id, await readJson(request));
  return NextResponse.json({ collection: toCollection(createCollection(user.id, name)) }, { status: 201 });
});
