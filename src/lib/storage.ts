import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./db";
import { IMAGE_EXTENSIONS, type ImageMime } from "./image-mime";

function uploadsDir(): string {
  return path.join(/*turbopackIgnore: true*/ dataDir(), "uploads");
}

/** Resolves a stored relative path and refuses anything that escapes the uploads folder. */
function resolveStored(relativePath: string): string {
  const base = path.resolve(/*turbopackIgnore: true*/ uploadsDir());
  const absolute = path.resolve(/*turbopackIgnore: true*/ base, relativePath);
  if (!absolute.startsWith(base + path.sep)) throw new Error("Invalid storage path");
  return absolute;
}

/** Images live in a per-user folder outside /public, so they are only reachable via authenticated routes. */
export async function saveImage(userId: string, id: string, bytes: Uint8Array, mime: ImageMime) {
  const relativePath = `${userId}/${id}.${IMAGE_EXTENSIONS[mime]}`;
  const absolute = resolveStored(relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, bytes);
  return relativePath;
}

export async function readImage(relativePath: string): Promise<Buffer> {
  return fs.readFile(resolveStored(relativePath));
}

export async function deleteImage(relativePath: string): Promise<void> {
  await fs.rm(resolveStored(relativePath), { force: true });
}
