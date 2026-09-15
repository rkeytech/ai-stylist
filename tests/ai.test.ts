import { afterEach, describe, expect, it } from "vitest";
import { aiMode, generateTryOn, suggestLooks, tagItem, withModelFallback, type ItemWithImage } from "@/lib/ai";
import { checkOutfit } from "@/lib/outfits";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const image = { data: png, mimeType: "image/png" };

/** Mimics the internal OpenRouterHttpError shape without importing an implementation detail. */
function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

afterEach(() => {
  delete process.env.AI_MOCK;
  delete process.env.OPENROUTER_API_KEY;
});

describe("AI configuration", () => {
  it("reports the mode from the environment", () => {
    expect(aiMode()).toBe("unconfigured");
    process.env.OPENROUTER_API_KEY = "test-key";
    expect(aiMode()).toBe("live");
    process.env.AI_MOCK = "true";
    expect(aiMode()).toBe("mock");
  });

  it("fails with a clear 503 when no key is configured", async () => {
    await expect(tagItem(image, "Blue shirt")).rejects.toMatchObject({ status: 503 });
  });
});

describe("OpenRouter model fallback", () => {
  it("moves to the fallback model when the main one is overloaded", async () => {
    const tried: string[] = [];
    const result = await withModelFallback(["main", "fallback"], async (model) => {
      tried.push(model);
      if (model === "main") throw httpError("high demand", 503);
      return "ok";
    });
    expect(result).toBe("ok");
    expect(tried).toEqual(["main", "fallback"]);
  });

  it("explains an overload clearly when every model is busy", async () => {
    const busy = withModelFallback(["main", "fallback"], async () => {
      throw httpError("high demand", 503);
    });
    await expect(busy).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/overloaded/) });
  });

  it("skips a model that isn't available", async () => {
    const tried: string[] = [];
    const result = await withModelFallback(["main", "retired", "backup"], async (model) => {
      tried.push(model);
      if (model === "main") throw httpError("high demand", 503);
      if (model === "retired") throw httpError("no longer available", 404);
      return "ok";
    });
    expect(result).toBe("ok");
    expect(tried).toEqual(["main", "retired", "backup"]);
  });

  it("reports the overload rather than a retired fallback's 404", async () => {
    const failing = withModelFallback(["main", "retired"], async (model) => {
      throw httpError("x", model === "main" ? 503 : 404);
    });
    await expect(failing).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/overloaded/) });
  });

  it("explains an insufficient-credits error and moves to the fallback", async () => {
    const tried: string[] = [];
    const result = await withModelFallback(["paid", "free"], async (model) => {
      tried.push(model);
      if (model === "paid") throw httpError("insufficient credits", 402);
      return "ok";
    });
    expect(result).toBe("ok");
    expect(tried).toEqual(["paid", "free"]);
  });

  it("explains it when every model is out of credits", async () => {
    const outOfCredits = withModelFallback(["paid", "also-paid"], async () => {
      throw httpError("insufficient credits", 402);
    });
    await expect(outOfCredits).rejects.toMatchObject({ status: 402, message: expect.stringMatching(/credits/) });
  });

  it("doesn't retry other models for a bad key", async () => {
    const tried: string[] = [];
    const denied = withModelFallback(["main", "fallback"], async (model) => {
      tried.push(model);
      throw httpError("API key not valid", 403);
    });
    await expect(denied).rejects.toMatchObject({ message: expect.stringMatching(/OPENROUTER_API_KEY/) });
    expect(tried).toEqual(["main"]);
  });

  it("skips a fallback that was disabled with an empty value", async () => {
    const tried: string[] = [];
    await expect(
      withModelFallback(["main", ""], async (model) => {
        tried.push(model);
        throw httpError("busy", 503);
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(tried).toEqual(["main"]);
  });
});

describe("mock mode", () => {
  it("tags items from their name", async () => {
    process.env.AI_MOCK = "true";
    expect(await tagItem(image, "Pink striped trousers")).toEqual({
      name: "Pink striped trousers",
      category: "bottom",
      colour: "pink",
    });
  });

  it("tags accessories from their name", async () => {
    process.env.AI_MOCK = "true";
    expect(await tagItem(image, "Gold hoop earrings")).toEqual({
      name: "Gold hoop earrings",
      category: "accessories",
      colour: "gold",
    });
  });

  it("suggests valid looks and echoes the photo for try-on", async () => {
    process.env.AI_MOCK = "true";
    const items: ItemWithImage[] = [
      { id: "t", name: "Tee", category: "top", colour: "white", image },
      { id: "b", name: "Jeans", category: "bottom", colour: "blue", image },
      { id: "d", name: "Dress", category: "dress", colour: "red", image },
    ];
    const byId = new Map(items.map((item) => [item.id, item]));

    const looks = await suggestLooks(items);
    expect(looks).toHaveLength(2);
    for (const look of looks) expect(checkOutfit(look.itemIds, byId)).toBeNull();

    const result = await generateTryOn(image, items.slice(0, 2), "4:3");
    expect(result.mimeType).toBe("image/png");
    expect(Buffer.compare(result.data, Buffer.from(png))).toBe(0);
  });
});

describe("try-on is disabled outside mock mode", () => {
  it("throws a clear error even with a key configured", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    await expect(generateTryOn(image, [])).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/disabled/i),
    });
  });

  it("throws a clear error when unconfigured", async () => {
    await expect(generateTryOn(image, [])).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/disabled/i),
    });
  });
});
