"use client";

import Link from "next/link";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { AiMode } from "@/lib/ai";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { canStyle, canStyleAround, MAX_LOOKS, missingAround } from "@/lib/outfits";
import {
  CATEGORY_LABELS,
  describePiece,
  MAX_OCCASION_LENGTH,
  OCCASION_SUGGESTIONS,
  type Collection,
  type Look,
  type WardrobeItem,
} from "@/lib/wardrobe";
import { AiNotice, ErrorNote, lookNumber, PageHeading } from "./ui";

const COUNT_WORDS = ["No", "One", "Two", "Three"];
/** Pieces shown in a look card's 2×2 grid; any extra are counted on the last tile. */
const CARD_TILES = 4;

export function StylistView({
  items,
  collections,
  initialCollectionId,
  initialAnchorId,
  initialLooks,
  aiMode,
}: {
  items: WardrobeItem[];
  collections: Collection[];
  initialCollectionId: string | null;
  initialAnchorId: string | null;
  initialLooks: Look[];
  aiMode: AiMode;
}) {
  const [looks, setLooks] = useState(initialLooks);
  const [occasion, setOccasion] = useState(initialLooks[0]?.occasion ?? "");
  const [collectionId, setCollectionId] = useState(initialCollectionId ?? "");
  // Like the occasion, an anchored batch keeps its anchor selected for "Style me again".
  const [anchorId, setAnchorId] = useState(initialAnchorId ?? initialLooks[0]?.anchorItemId ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phones only: the brief collapses to a one-line summary once there are looks to see.
  const [briefOpen, setBriefOpen] = useState(initialLooks.length === 0);
  // Index into `looks` of the look shown in the details dialog.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const lookDialogRef = useRef<HTMLDialogElement>(null);

  function openLook(index: number) {
    setOpenIndex(index);
    lookDialogRef.current?.showModal();
  }
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const collection = collections.find((c) => c.id === collectionId) ?? null;
  const anchor = (anchorId && itemsById.get(anchorId)) || null;
  // Mirrors the route: the anchor joins the pool even when it isn't in the chosen collection.
  const pool = useMemo(() => {
    const base = collection ? collection.itemIds.flatMap((id) => itemsById.get(id) ?? []) : items;
    return anchor && !base.includes(anchor) ? [anchor, ...base] : base;
  }, [anchor, collection, items, itemsById]);
  const ready = anchor ? canStyleAround(pool, anchor) : canStyle(pool);
  const batchAnchor = (looks[0]?.anchorItemId && itemsById.get(looks[0].anchorItemId)) || null;
  const summary = [anchor?.name, collection?.name ?? "Whole Atelier", occasion.trim() || null]
    .filter(Boolean)
    .join(" · ");

  async function styleMe() {
    setPending(true);
    setError(null);
    try {
      const data = await apiFetch<{ looks: Look[] }>("/api/stylist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasion: occasion.trim(),
          collectionId: collection?.id ?? null,
          anchorItemId: anchor?.id ?? null,
        }),
      });
      setLooks(data.looks);
      setBriefOpen(false);
    } catch (err) {
      setError(errorMessage(err, "The stylist couldn't finish. Please try again."));
    } finally {
      setPending(false);
    }
  }

  const notReady =
    ready ? null : anchor ? (
      <p className="text-sm leading-relaxed text-muted">
        {collection ? <>&ldquo;{collection.name}&rdquo; needs</> : "Your Atelier needs"} {missingAround(anchor)} to
        go with your {describePiece(anchor).toLowerCase()}.{" "}
        <Link
          href={collection ? `/collections/${collection.id}` : "/wardrobe"}
          className="text-ink underline underline-offset-4"
        >
          Add pieces
        </Link>
        {collection && (
          <>
            {" "}
            or{" "}
            <button type="button" className="text-ink underline underline-offset-4" onClick={() => setCollectionId("")}>
              use the whole Atelier
            </button>
          </>
        )}
        .
      </p>
    ) : collection ? (
      <p className="text-sm leading-relaxed text-muted">
        &ldquo;{collection.name}&rdquo; needs at least a top and a bottom, or a dress.{" "}
        <Link href={`/collections/${collection.id}`} className="text-ink underline underline-offset-4">
          Add pieces to it
        </Link>{" "}
        or{" "}
        <button type="button" className="text-ink underline underline-offset-4" onClick={() => setCollectionId("")}>
          use the whole Atelier
        </button>
        .
      </p>
    ) : (
      <p className="text-sm leading-relaxed text-muted">
        Add at least a top and a bottom, or a dress, to your{" "}
        <Link href="/wardrobe" className="text-ink underline underline-offset-4">
          Atelier
        </Link>{" "}
        first.
      </p>
    );

  return (
    <div>
      <PageHeading title="Stylist" />
      <AiNotice mode={aiMode} />

      <div className="mt-9 flex flex-wrap items-start gap-10">
        <aside aria-label="Styling options" className="w-full border border-ink lg:w-[340px] lg:shrink-0">
          <button
            type="button"
            aria-expanded={briefOpen}
            aria-controls="stylist-brief"
            onClick={() => setBriefOpen(!briefOpen)}
            className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left lg:hidden"
          >
            <span className="min-w-0 flex-1 truncate text-sm">{summary}</span>
            <span className="eyebrow">{briefOpen ? "Close" : "Edit"}</span>
          </button>

          <div
            id="stylist-brief"
            className={`${briefOpen ? "flex" : "hidden"} flex-col gap-7 border-t border-line p-6 lg:flex lg:border-t-0`}
          >
            <div>
              <BriefStep numeral="i" label="Style around" />
              {anchor ? (
                <div className="mt-3 flex items-center gap-3 border border-accent p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated images */}
                  <img
                    src={anchor.imageUrl}
                    alt={describePiece(anchor)}
                    className="aspect-square w-14 shrink-0 bg-card object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="display truncate text-[22px]">{anchor.name}</p>
                    <p className="mt-0.5 text-xs text-muted">{CATEGORY_LABELS[anchor.category]}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Clear the piece to style around"
                    onClick={() => setAnchorId(null)}
                    disabled={pending}
                    className="size-11 shrink-0 text-xl text-muted transition-colors hover:text-ink disabled:opacity-40"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <Link
                  href="/wardrobe"
                  className="mt-3 flex min-h-12 items-center justify-center border border-dashed border-muted px-3 text-center text-sm text-muted transition-colors hover:border-ink hover:text-ink"
                >
                  Any piece — or pick one in your Atelier
                </Link>
              )}
            </div>

            <div>
              <BriefStep numeral="ii" label="Draw from" />
              <div role="radiogroup" aria-label="Draw from" className="mt-2.5 border-t border-line">
                <DrawFromOption
                  label="Whole Atelier"
                  count={items.length}
                  checked={!collection}
                  disabled={pending}
                  onSelect={() => setCollectionId("")}
                />
                {collections.map((c) => (
                  <DrawFromOption
                    key={c.id}
                    label={c.name}
                    count={c.itemIds.length}
                    checked={c.id === collection?.id}
                    disabled={pending}
                    onSelect={() => setCollectionId(c.id)}
                  />
                ))}
              </div>
              {collections.length === 0 && (
                <Link href="/collections" className="btn-link mt-3 inline-block">
                  Make a collection
                </Link>
              )}
              {collection && notReady && <div className="mt-3">{notReady}</div>}
            </div>

            <div>
              <BriefStep numeral="iii" label="Occasion" htmlFor="occasion" />
              <input
                id="occasion"
                value={occasion}
                onChange={(event) => setOccasion(event.target.value)}
                maxLength={MAX_OCCASION_LENGTH}
                placeholder="Dinner, a rainy commute…"
                disabled={pending}
                className="field mt-1.5 border-ink"
              />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {OCCASION_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="chip inline-flex min-h-11 items-center"
                    aria-pressed={occasion.trim().toLowerCase() === suggestion.toLowerCase()}
                    onClick={() =>
                      setOccasion(occasion.trim().toLowerCase() === suggestion.toLowerCase() ? "" : suggestion)
                    }
                    disabled={pending}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={styleMe}
                disabled={!ready || pending}
                className="btn-primary w-full py-4"
              >
                {pending ? "Styling your Atelier…" : looks.length > 0 ? "Style me again" : "Style me"}
              </button>
              {!collection && notReady && <div className="mt-3">{notReady}</div>}
              {error && <ErrorNote>{error}</ErrorNote>}
            </div>
          </div>
        </aside>

        <section aria-label="Looks" className="min-w-0 flex-[999_1_560px]">
          {pending ? (
            <>
              <BatchHeading title="Styling your Atelier…" />
              <LookGrid busy>
                {[0, 1, 2].map((key) => (
                  <div key={key} className="animate-pulse border border-line bg-card">
                    <div className="grid grid-cols-2 gap-0.5 p-0.5">
                      {[0, 1, 2, 3].map((tile) => (
                        <div key={tile} className="aspect-square bg-paper" />
                      ))}
                    </div>
                    <div className="space-y-3 p-5">
                      <div className="h-2.5 w-14 bg-line" />
                      <div className="h-7 w-3/4 bg-line" />
                      <div className="h-2.5 w-full bg-line" />
                      <div className="h-2.5 w-4/5 bg-line" />
                    </div>
                  </div>
                ))}
              </LookGrid>
            </>
          ) : looks.length === 0 ? (
            <>
              <BatchHeading title="Your looks" />
              <p className="mt-4 text-muted">
                {ready
                  ? "Press “Style me” and your stylist will put three looks together from your pieces."
                  : "Your looks will appear here once there are enough pieces to work with."}
              </p>
              <LookGrid>
                {[0, 1, 2].map((index) => (
                  <div key={index} className="flex aspect-[4/5] items-end border border-dashed border-line p-5">
                    <p className="eyebrow">Look {lookNumber(index)}</p>
                  </div>
                ))}
              </LookGrid>
            </>
          ) : (
            <>
              <BatchHeading
                title={`${COUNT_WORDS[looks.length] ?? looks.length} ${looks.length === 1 ? "look" : "looks"}`}
                detail={[
                  looks[0].occasion && `For ${looks[0].occasion}`,
                  batchAnchor && `Around the ${describePiece(batchAnchor).toLowerCase()}`,
                  looks[0].collection && `From ${looks[0].collection}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              <LookGrid>
                {looks.map((look, index) => (
                  <LookCard
                    key={look.id}
                    look={look}
                    index={index}
                    itemsById={itemsById}
                    onOpen={() => openLook(index)}
                  />
                ))}
              </LookGrid>
              {looks.length < MAX_LOOKS && (
                <p className="mt-6 border-t border-line pt-6 text-sm text-muted">
                  Only {looks.length} valid {looks.length === 1 ? "look" : "looks"} this time - add more pieces to
                  your Atelier for more variety.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <LookDialog
        dialogRef={lookDialogRef}
        looks={looks}
        index={openIndex}
        itemsById={itemsById}
        onNavigate={setOpenIndex}
        onClosed={() => setOpenIndex(null)}
      />
    </div>
  );
}

function BriefStep({ numeral, label, htmlFor }: { numeral: string; label: string; htmlFor?: string }) {
  return (
    <p className="flex items-baseline gap-2.5">
      <span className="display text-[22px] text-accent" aria-hidden="true">
        {numeral}
      </span>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="eyebrow">
          {label}
        </label>
      ) : (
        <span className="eyebrow">{label}</span>
      )}
    </p>
  );
}

function DrawFromOption({
  label,
  count,
  checked,
  disabled,
  onSelect,
}: {
  label: string;
  count: number;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      disabled={disabled}
      className={`flex min-h-11 w-full items-center justify-between gap-3 border-b px-3 text-left text-[15px] transition-colors disabled:cursor-not-allowed ${
        checked ? "border-ink bg-ink text-paper" : "border-line text-ink hover:bg-card"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className={`text-xs tracking-[0.1em] ${checked ? "text-paper/70" : "text-muted"}`}>{count}</span>
    </button>
  );
}

function BatchHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3.5">
      <h2 className="display text-[30px]">{title}</h2>
      {detail && <p className="eyebrow">{detail}</p>}
    </div>
  );
}

function LookGrid({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <div
      className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-5"
      aria-busy={busy || undefined}
      aria-label={busy ? "Styling in progress" : undefined}
    >
      {children}
    </div>
  );
}

/** A look's pieces in display order: the anchor leads so it is always visible on the card. */
function lookPieces(look: Look, itemsById: Map<string, WardrobeItem>): WardrobeItem[] {
  return look.itemIds
    .flatMap((id) => itemsById.get(id) ?? [])
    .sort((a, b) => Number(b.id === look.anchorItemId) - Number(a.id === look.anchorItemId));
}

function LookCard({
  look,
  index,
  itemsById,
  onOpen,
}: {
  look: Look;
  index: number;
  itemsById: Map<string, WardrobeItem>;
  onOpen: () => void;
}) {
  const pieces = lookPieces(look, itemsById);
  const tiles = pieces.slice(0, CARD_TILES);
  const hidden = pieces.length - tiles.length;
  return (
    <article className="group relative flex flex-col border border-line bg-card transition-colors hover:border-ink">
      <div className="grid grid-cols-2 gap-0.5 p-0.5">
        {Array.from({ length: CARD_TILES }, (_, tile) => {
          const item = tiles[tile];
          if (!item) return <div key={tile} className="aspect-square bg-paper" aria-hidden="true" />;
          const isAnchor = item.id === look.anchorItemId;
          return (
            <div key={item.id} className="relative aspect-square bg-paper">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated images */}
              <img
                src={item.imageUrl}
                alt={describePiece(item)}
                loading="lazy"
                className="size-full object-cover"
              />
              {isAnchor && <span className="pointer-events-none absolute inset-0 ring-2 ring-accent ring-inset" />}
              {tile === CARD_TILES - 1 && hidden > 0 && (
                <span className="absolute inset-0 flex items-center justify-center bg-ink/60 text-sm tracking-[0.2em] text-paper">
                  +{hidden}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow">Look {lookNumber(index)}</p>
          <span className="eyebrow transition-colors group-hover:text-ink" aria-hidden="true">
            View look →
          </span>
        </div>
        <h3 className="display text-[32px]">
          {/* The button's ::after covers the whole card, so a click anywhere opens the look. */}
          <button
            type="button"
            onClick={onOpen}
            aria-haspopup="dialog"
            className="text-left underline-offset-4 group-hover:underline after:absolute after:inset-0 after:content-['']"
          >
            {look.title}
          </button>
        </h3>
        <p className="text-[15px] leading-relaxed">{look.reason}</p>
        <ul className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {pieces.map((item) => (
            <li
              key={item.id}
              className={`border px-2 py-1 text-xs ${
                item.id === look.anchorItemId ? "border-accent text-accent" : "border-line text-muted"
              }`}
            >
              {item.name}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function LookDialog({
  dialogRef,
  looks,
  index,
  itemsById,
  onNavigate,
  onClosed,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  looks: Look[];
  index: number | null;
  itemsById: Map<string, WardrobeItem>;
  onNavigate: (index: number) => void;
  onClosed: () => void;
}) {
  // Native close (Esc, the × button, a backdrop click) always clears the open look.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.addEventListener("close", onClosed);
    return () => dialog.removeEventListener("close", onClosed);
  }, [dialogRef, onClosed]);

  const look = index === null ? null : (looks[index] ?? null);
  const pieces = look ? lookPieces(look, itemsById) : [];
  const detail = look
    ? [
        look.occasion && `For ${look.occasion}`,
        look.collection && `From ${look.collection}`,
        `${pieces.length} ${pieces.length === 1 ? "piece" : "pieces"}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="look-title"
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(event) => event.target === event.currentTarget && dialogRef.current?.close()}
      className="m-auto w-[min(92vw,60rem)] bg-paper p-0 text-ink backdrop:bg-scrim/50"
    >
      {look && index !== null && (
        <div className="flex max-h-[90vh] flex-col">
          <div className="flex items-start justify-between gap-4 p-6 sm:px-8">
            <div className="min-w-0">
              <p className="eyebrow">
                Look {lookNumber(index)} of {lookNumber(looks.length - 1)}
              </p>
              <h2 id="look-title" className="display mt-1 text-4xl sm:text-5xl">
                {look.title}
              </h2>
              <p className="eyebrow mt-3">{detail}</p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
              className="text-3xl leading-none text-muted hover:text-ink"
            >
              ×
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-y border-line px-6 py-6 sm:px-8">
            <p className="max-w-2xl text-[17px] leading-relaxed">{look.reason}</p>
            <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {pieces.map((item) => {
                const isAnchor = item.id === look.anchorItemId;
                return (
                  <li key={item.id}>
                    <figure>
                      <div className="relative aspect-square bg-card">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated images */}
                        <img src={item.imageUrl} alt={describePiece(item)} className="size-full object-cover" />
                        {isAnchor && (
                          <span className="pointer-events-none absolute inset-0 ring-2 ring-accent ring-inset" />
                        )}
                      </div>
                      <figcaption className="mt-2">
                        <span className="block truncate">{item.name}</span>
                        <span className={`eyebrow mt-0.5 block ${isAnchor ? "text-accent" : ""}`}>
                          {CATEGORY_LABELS[item.category]}
                          {isAnchor && " · Styled around"}
                        </span>
                      </figcaption>
                    </figure>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex items-center justify-between gap-4 px-6 py-4 sm:px-8">
            <button
              type="button"
              className="btn-link"
              onClick={() => onNavigate(index - 1)}
              disabled={index === 0}
            >
              ← Previous look
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={() => onNavigate(index + 1)}
              disabled={index === looks.length - 1}
            >
              Next look →
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
