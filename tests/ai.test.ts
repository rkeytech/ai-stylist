import { ApiError } from "@google/genai";
import { afterEach, describe, expect, it } from "vitest";
import { aiMode, generateTryOn, suggestLooks, tagItem, withModelFallback, type ItemWithImage } from "@/lib/ai";
import { checkOutfit } from "@/lib/outfits";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const image = { data: png, mimeType: "image/png" };

afterEach(() => {
  delete process.env.AI_MOCK;
  delete process.env.GEMINI_API_KEY;
});

describe("AI configuration", () => {
  it("reports the mode from the environment", () => {
    expect(aiMode()).toBe("unconfigured");
    process.env.GEMINI_API_KEY = "test-key";
    expect(aiMode()).toBe("live");
    process.env.AI_MOCK = "true";
    expect(aiMode()).toBe("mock");
  });

  it("fails with a clear 503 when no key is configured", async () => {
    await expect(tagItem(image, "Blue shirt")).rejects.toMatchObject({ status: 503 });
  });
});

describe("Gemini model fallback", () => {
  it("moves to the fallback model when the main one is overloaded", async () => {
    const tried: string[] = [];
    const result = await withModelFallback(["main", "fallback"], async (model) => {
      tried.push(model);
      if (model === "main") throw new ApiError({ message: "high demand", status: 503 });
      return "ok";
    });
    expect(result).toBe("ok");
    expect(tried).toEqual(["main", "fallback"]);
  });

  it("explains an overload clearly when every model is busy", async () => {
    const busy = withModelFallback(["main", "fallback"], async () => {
      throw new ApiError({ message: "high demand", status: 503 });
    });
    await expect(busy).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/overloaded/) });
  });

  it("skips a model that isn't available to the key", async () => {
    const tried: string[] = [];
    const result = await withModelFallback(["main", "retired", "backup"], async (model) => {
      tried.push(model);
      if (model === "main") throw new ApiError({ message: "high demand", status: 503 });
      if (model === "retired") throw new ApiError({ message: "no longer available", status: 404 });
      return "ok";
    });
    expect(result).toBe("ok");
    expect(tried).toEqual(["main", "retired", "backup"]);
  });

  it("reports the overload rather than a retired fallback's 404", async () => {
    const failing = withModelFallback(["main", "retired"], async (model) => {
      throw new ApiError({ message: "x", status: model === "main" ? 503 : 404 });
    });
    await expect(failing).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/overloaded/) });
  });

  it("explains a quota error such as a free key calling an image model", async () => {
    const quota = withModelFallback(["image", "image-lite"], async () => {
      throw new ApiError({
        message: "You exceeded your current quota, please check your plan and billing details.",
        status: 429,
      });
    });
    await expect(quota).rejects.toMatchObject({ status: 429, message: expect.stringMatching(/enable billing/) });
  });

  it("doesn't retry other models for a bad key", async () => {
    const tried: string[] = [];
    const denied = withModelFallback(["main", "fallback"], async (model) => {
      tried.push(model);
      throw new ApiError({ message: "API key not valid", status: 403 });
    });
    await expect(denied).rejects.toMatchObject({ message: expect.stringMatching(/GEMINI_API_KEY/) });
    expect(tried).toEqual(["main"]);
  });

  it("skips a fallback that was disabled with an empty value", async () => {
    const tried: string[] = [];
    await expect(
      withModelFallback(["main", ""], async (model) => {
        tried.push(model);
        throw new ApiError({ message: "busy", status: 503 });
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
