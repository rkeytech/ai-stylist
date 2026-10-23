"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AiMode } from "@/lib/ai";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { canStyle, MAX_LOOKS } from "@/lib/outfits";
import {
  MAX_OCCASION_LENGTH,
  OCCASION_SUGGESTIONS,
  type Collection,
  type Look,
  type WardrobeItem,
} from "@/lib/wardrobe";
import { AiNotice, ErrorNote, LookPieces, lookNumber, PageHeading } from "./ui";

export function StylistView({
  items,
  collections,
  initialCollectionId,
  initialLooks,
  aiMode,
}: {
  items: WardrobeItem[];
  collections: Collection[];
  initialCollectionId: string | null;
  initialLooks: Look[];
  aiMode: AiMode;
}) {
  const [looks, setLooks] = useState(initialLooks);
  const [occasion, setOccasion] = useState(initialLooks[0]?.occasion ?? "");
  const [collectionId, setCollectionId] = useState(initialCollectionId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const collection = collections.find((c) => c.id === collectionId) ?? null;
  const pool = useMemo(
    () => (collection ? collection.itemIds.flatMap((id) => itemsById.get(id) ?? []) : items),
    [collection, items, itemsById],
  );
  const ready = canStyle(pool);

  async function styleMe() {
    setPending(true);
    setError(null);
    try {
      const data = await apiFetch<{ looks: Look[] }>("/api/stylist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasion: occasion.trim(), collectionId: collection?.id ?? null }),
      });
      setLooks(data.looks);
    } catch (err) {
      setError(errorMessage(err, "The stylist couldn't finish. Please try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <PageHeading
        eyebrow="The Column"
        title="Stylist"
        intro="Three looks, styled from what already hangs in your wardrobe - with a line on why each one works."
      />
      <AiNotice mode={aiMode} />

      {collections.length > 0 && (
        <div className="mt-8">
          <label htmlFor="collection" className="eyebrow">
            Draw from
          </label>
          <select
            id="collection"
            value={collectionId}
            onChange={(event) => setCollectionId(event.target.value)}
            disabled={pending}
            className="field mt-1"
          >
            <option value="">Whole wardrobe</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.itemIds.length})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-8">
        <label htmlFor="occasion" className="eyebrow">
          Occasion <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <input
          id="occasion"
          value={occasion}
          onChange={(event) => setOccasion(event.target.value)}
          maxLength={MAX_OCCASION_LENGTH}
          placeholder="Dinner, a rainy commute, a job interview…"
          disabled={pending}
          className="field mt-1"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {OCCASION_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="chip"
              aria-pressed={occasion.trim().toLowerCase() === suggestion.toLowerCase()}
              onClick={() => setOccasion(occasion.trim().toLowerCase() === suggestion.toLowerCase() ? "" : suggestion)}
              disabled={pending}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <button type="button" onClick={styleMe} disabled={!ready || pending} className="btn-primary mt-6 w-full py-4">
        {pending ? "Styling your wardrobe…" : looks.length > 0 ? "Style me again" : "Style me"}
      </button>

      {!ready &&
        (collection ? (
          <p className="mt-3 text-center text-sm text-muted">
            &ldquo;{collection.name}&rdquo; needs at least a top and a bottom, or a dress.{" "}
            <Link href={`/collections/${collection.id}`} className="text-ink underline underline-offset-4">
              Add pieces to it
            </Link>{" "}
            or style from your whole wardrobe.
          </p>
        ) : (
          <p className="mt-3 text-center text-sm text-muted">
            Add at least a top and a bottom, or a dress, to your{" "}
            <Link href="/wardrobe" className="text-ink underline underline-offset-4">
              wardrobe
            </Link>{" "}
            first.
          </p>
        ))}

      {error && <ErrorNote>{error}</ErrorNote>}

      {pending ? (
        <div className="mt-10 space-y-12" aria-busy="true" aria-label="Styling in progress">
          {[0, 1, 2].map((key) => (
            <div key={key} className="animate-pulse border-t border-line pt-8">
              <div className="h-3 w-16 bg-card" />
              <div className="mt-3 h-9 w-64 bg-card" />
              <div className="mt-5 flex gap-3">
                {[0, 1, 2].map((piece) => (
                  <div key={piece} className="aspect-square w-28 bg-card sm:w-36" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : looks.length === 0 ? (
        ready && (
          <p className="mt-10 text-center text-muted">
            Press &ldquo;Style me&rdquo; and your stylist will put outfits together from your pieces.
          </p>
        )
      ) : (
        <div className="mt-10 space-y-12">
          {(looks[0]?.occasion || looks[0]?.collection) && (
            <p className="eyebrow">
              {looks.length} {looks.length === 1 ? "look" : "looks"}
              {looks[0].occasion && ` for: ${looks[0].occasion}`}
              {looks[0].collection && ` · from ${looks[0].collection}`}
            </p>
          )}
          {looks.map((look, index) => (
            <article key={look.id} className="border-t border-line pt-8">
              <p className="eyebrow">Look {lookNumber(index)}</p>
              <h2 className="display mt-1 text-4xl">{look.title}</h2>
              <div className="mt-5">
                <LookPieces itemIds={look.itemIds} itemsById={itemsById} />
              </div>
              <p className="mt-5 max-w-2xl leading-relaxed">{look.reason}</p>
            </article>
          ))}
          {looks.length < MAX_LOOKS && (
            <p className="border-t border-line pt-6 text-sm text-muted">
              Only {looks.length} valid {looks.length === 1 ? "look" : "looks"} this time - add more pieces to your
              wardrobe for more variety.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
