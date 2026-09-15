import { handle, HttpError, requireUser } from "@/lib/http";
import { IMAGE_EXTENSIONS } from "@/lib/image-mime";
import { getItem, getTryOn } from "@/lib/repo";
import { readImage } from "@/lib/storage";

/** Serves private photos only to their owner. */
export const GET = handle(async (request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) => {
  const user = await requireUser();
  const { kind, id } = await params;
  const row = kind === "item" ? getItem(user.id, id) : kind === "tryon" ? getTryOn(user.id, id) : undefined;
  if (!row) throw new HttpError("Image not found.", 404);

  let bytes: Buffer;
  try {
    bytes = await readImage(row.image_path);
  } catch {
    throw new HttpError("Image not found.", 404);
  }

  const headers = new Headers({
    "Content-Type": row.mime_type,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (new URL(request.url).searchParams.has("download")) {
    headers.set("Content-Disposition", `attachment; filename="styled-${kind}-${id}.${IMAGE_EXTENSIONS[row.mime_type]}"`);
  }
  return new Response(new Uint8Array(bytes), { headers });
});
