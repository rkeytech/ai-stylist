"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  CATEGORY_LABELS,
  describePiece,
  MAX_COLLECTION_NAME_LENGTH,
  type Collection,
  type WardrobeItem,
} from "@/lib/wardrobe";
import { ErrorNote, PageHeading } from "./ui";

const sameMembers = (a: Set<string>, b: string[]) => a.size === b.length && b.every((id) => a.has(id));

export function CollectionView({ initialCollection, items }: { initialCollection: Collection; items: WardrobeItem[] }) {
  const router = useRouter();
  const [collection, setCollection] = useState(initialCollection);
  const [selected, setSelected] = useState(() => new Set(initialCollection.itemIds));
  const [name, setName] = useState(initialCollection.name);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState<"rename" | "save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = !sameMembers(selected, collection.itemIds);
  const base = `/api/collections/${collection.id}`;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function run(action: "rename" | "save" | "delete", request: () => Promise<void>, fallback: string) {
    setPending(action);
    setError(null);
    try {
      await request();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setPending(null);
    }
  }

  function rename(event: FormEvent) {
    event.preventDefault();
    void run(
      "rename",
      async () => {
        const data = await apiFetch<{ collection: Collection }>(base, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        setCollection(data.collection);
        setName(data.collection.name);
        setRenaming(false);
      },
      "Couldn't rename the collection. Please try again.",
    );
  }

  function saveMembers() {
    void run(
      "save",
      async () => {
        const data = await apiFetch<{ collection: Collection }>(`${base}/items`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: [...selected] }),
        });
        setCollection(data.collection);
        setSelected(new Set(data.collection.itemIds));
      },
      "Couldn't save the collection. Please try again.",
    );
  }

  function remove() {
    void run(
      "delete",
      async () => {
        await apiFetch(base, { method: "DELETE" });
        router.push("/collections");
        router.refresh();
      },
      "Couldn't delete the collection. Please try again.",
    );
  }

  return (
    <div>
      <Link href="/collections" className="btn-link">
        ← All collections
      </Link>

      <div className="mt-4">
        {renaming ? (
          <form onSubmit={rename} className="flex flex-wrap items-end gap-4">
            <div className="min-w-0 flex-1">
              <label htmlFor="rename" className="eyebrow">
                Collection name
              </label>
              <input
                id="rename"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={MAX_COLLECTION_NAME_LENGTH}
                disabled={pending !== null}
                autoFocus
                className="field mt-1"
              />
            </div>
            <button type="submit" className="btn-primary" disabled={pending !== null || !name.trim()}>
              {pending === "rename" ? "Saving…" : "Save name"}
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setRenaming(false);
                setName(collection.name);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <PageHeading
            eyebrow="Collection"
            title={collection.name}
            intro={`${collection.itemIds.length} ${collection.itemIds.length === 1 ? "piece" : "pieces"}. Tap pieces to add or remove them, then save.`}
            action={
              <Link href={`/stylist?collection=${collection.id}`} className="btn-outline">
                Style this collection
              </Link>
            }
          />
        )}
      </div>

      {!renaming && (
        <div className="mt-4 flex items-center gap-3">
          <button type="button" className="btn-link" onClick={() => setRenaming(true)} disabled={pending !== null}>
            Rename
          </button>
          {confirmingDelete ? (
            <>
              <span className="text-xs text-muted">Delete this collection? Its pieces stay in your wardrobe.</span>
              <button type="button" className="btn-link text-accent" disabled={pending !== null} onClick={remove}>
                {pending === "delete" ? "Deleting…" : "Yes"}
              </button>
              <button type="button" className="btn-link" onClick={() => setConfirmingDelete(false)}>
                No
              </button>
            </>
          ) : (
            <button type="button" className="btn-link" onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      {items.length === 0 ? (
        <div className="mt-10 border border-dashed border-line px-6 py-16 text-center">
          <p className="display text-3xl">Your wardrobe is empty</p>
          <p className="mx-auto mt-3 max-w-md text-muted">Upload some pieces first, then come back to group them.</p>
          <Link href="/wardrobe" className="btn-outline mt-6">
            Go to wardrobe
          </Link>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 mt-8 flex flex-wrap items-center justify-between gap-3 border-y border-line bg-paper py-3">
            <p className="eyebrow">
              {selected.size} selected{dirty && " · unsaved changes"}
            </p>
            <div className="flex items-center gap-4">
              {dirty && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setSelected(new Set(collection.itemIds))}
                  disabled={pending !== null}
                >
                  Discard
                </button>
              )}
              <button type="button" className="btn-primary" onClick={saveMembers} disabled={!dirty || pending !== null}>
                {pending === "save" ? "Saving…" : "Save pieces"}
              </button>
            </div>
          </div>

          <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => {
              const inCollection = selected.has(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={inCollection}
                    onClick={() => toggle(item.id)}
                    disabled={pending !== null}
                    className="group block w-full text-left"
                  >
                    <span
                      className={`relative block border-2 transition-colors ${
                        inCollection ? "border-ink" : "border-transparent group-hover:border-line"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated images */}
                      <img
                        src={item.imageUrl}
                        alt={describePiece(item)}
                        loading="lazy"
                        className={`aspect-[3/4] w-full bg-card object-cover transition-opacity ${
                          inCollection ? "" : "opacity-60 group-hover:opacity-100"
                        }`}
                      />
                      {inCollection && (
                        <span
                          aria-hidden="true"
                          className="absolute top-2 right-2 grid h-7 w-7 place-items-center bg-ink text-sm text-paper"
                        >
                          ✓
                        </span>
                      )}
                    </span>
                    <span className="display mt-3 block text-2xl">{item.name}</span>
                    <span className="eyebrow mt-1 block">
                      {CATEGORY_LABELS[item.category]} · {item.colour}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
