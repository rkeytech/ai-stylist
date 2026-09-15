/// <reference types="vite/client" />
// Opt-in check that your OpenRouter key and models work end to end:
//   npm run test:live
// It's skipped during `npm test` and makes one small, real API call.
import fs from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { tagItem } from "@/lib/ai";

const live = import.meta.env.MODE === "live";

function solidPng(size: number, [r, g, b]: [number, number, number]): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) raw.set([r, g, b], y * (size * 3 + 1) + 1 + x * 3);
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe.runIf(live)("OpenRouter (live)", () => {
  it("tags a photo through the real API, using the fallback model if needed", async () => {
    if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
    process.env.AI_MOCK = "false";

    const started = Date.now();
    const tags = await tagItem({ data: solidPng(256, [40, 80, 200]), mimeType: "image/png" }, "shirt");
    console.log(`OpenRouter answered in ${Date.now() - started} ms:`, tags);

    expect(tags.name).toBeTruthy();
    expect(tags.colour).toBeTruthy();
  }, 120_000);
});
