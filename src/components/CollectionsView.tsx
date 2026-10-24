"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { MAX_COLLECTION_NAME_LENGTH, type Collection, type WardrobeItem } from "@/lib/wardrobe";
import { ErrorNote, LookPieces, PageHeading } from "./ui";

const PREVIEW_PIECES = 5;

export function CollectionsView({
  initialCollections,
  items,
}: {
  initialCollections: Collection[];
  items: WardrobeItem[];
}) {
  const [collections, setCollections] = useState(initialCollections);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const data = await apiFetch<{ collection: Collection }>("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setCollections((current) => [data.collection, ...current]);
      setName("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the collection. Please try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <PageHeading
        title="Collections"
      />

      <form onSubmit={create} className="mt-8 flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="collection-name" className="eyebrow">
            New collection
          </label>
          <input
            id="collection-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_COLLECTION_NAME_LENGTH}
            placeholder="Work, Travel capsule, Summer…"
            disabled={pending}
            className="field mt-1"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={pending || !name.trim()}>
          {pending ? "Creating…" : "Create"}
        </button>
      </form>

      {error && <ErrorNote>{error}</ErrorNote>}

      {collections.length === 0 ? (
        <div className="mt-10 border border-dashed border-line px-6 py-16 text-center">
          <p className="display text-3xl">No collections yet</p>
          <p className="mx-auto mt-3 max-w-md text-muted">
            Name your first collection above, then choose which pieces from your Atelier belong in it.
          </p>
        </div>
      ) : (
        <ul className="mt-10 space-y-10">
          {collections.map((collection) => (
            <li key={collection.id} className="border-t border-line pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <Link href={`/collections/${collection.id}`} className="display text-3xl hover:text-accent">
                  {collection.name}
                </Link>
                <p className="eyebrow">
                  {collection.itemIds.length} {collection.itemIds.length === 1 ? "piece" : "pieces"}
                </p>
              </div>
              <div className="mt-4">
                {collection.itemIds.length > 0 ? (
                  <LookPieces itemIds={collection.itemIds.slice(0, PREVIEW_PIECES)} itemsById={itemsById} size="sm" />
                ) : (
                  <p className="text-sm text-muted">Empty - open it to add pieces.</p>
                )}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Link href={`/collections/${collection.id}`} className="btn-link">
                  Edit
                </Link>
                <Link href={`/stylist?collection=${collection.id}`} className="btn-link">
                  Style this collection
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
