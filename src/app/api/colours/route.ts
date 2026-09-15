import { NextResponse } from "next/server";
import { handle, requireUser } from "@/lib/http";
import { listColours } from "@/lib/repo";

export const GET = handle(async () => {
  await requireUser();
  return NextResponse.json({ colours: listColours() });
});
