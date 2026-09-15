import type { ItemWithImage } from "./ai";
import type { ItemRow } from "./repo";
import { readImage } from "./storage";

/** Loads the stored photos for AI calls, skipping any file that has gone missing on disk. */
export async function withImages(rows: ItemRow[]): Promise<ItemWithImage[]> {
  const results = await Promise.allSettled(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      colour: row.colour,
      image: { data: await readImage(row.image_path), mimeType: row.mime_type },
    })),
  );
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}
