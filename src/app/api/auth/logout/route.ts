import { NextResponse } from "next/server";
import { assertSameOrigin, handle } from "@/lib/http";
import { endSession } from "@/lib/session";

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  await endSession();
  return NextResponse.json({ ok: true });
});
