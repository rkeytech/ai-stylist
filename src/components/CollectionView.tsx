"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  CATEGORY_LABELS,
  describePiece,
  MAX_COLLECTION_NAME_LENGTH,
  type Collection,
  type WardrobeItem,
} from "@/lib/wardrobe";
import { ErrorNote, PageHeading } from "./ui";

export function CollectionView({ initialCollection, items }: { initialCollection: Collection; items: WardrobeItem[] }) {
  const router = useRouter();
  const pickerRef = useRef<HTMLDialogElement>(null);
  const [collection, setCollection] = useState(initialCollection);
  const [name, setName] = useState(initialCollection.name);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState<"rename" | "save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/collections/${collection.id}`;
  const memberIds = new Set(collection.itemIds);
  const members = items.filter((item) => memberIds.has(item.id));
  const candidates = items.filter((item) => !memberIds.has(item.id));

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

  // Membership is always saved whole via PUT, so adding and removing both send the full new list.
  async function saveMembers(itemIds: string[]) {
    const data = await apiFetch<{ collection: Collection }>(`${base}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds }),
    });
    setCollection(data.collection);
  }

  function removeMember(id: string) {
    void run(
      "save",
      () => saveMembers(collection.itemIds.filter((itemId) => itemId !== id)),
      "Couldn't remove that piece. Please try again.",
    );
  }

  function addMembers(ids: string[]) {
    return run(
      "save",
      async () => {
        await saveMembers([...collection.itemIds, ...ids]);
        pickerRef.current?.close();
      },
      "Couldn't add those pieces. Please try again.",
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

  const openPicker = () => {
    setError(null);
    pickerRef.current?.showModal();
  };

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
            title={collection.name}
            intro={`${members.length} ${members.length === 1 ? "piece" : "pieces"}.`}
            action={
              <div className="flex flex-wrap gap-3">
                {items.length > 0 && (
                  <button type="button" className="btn-primary" onClick={openPicker} disabled={pending !== null}>
                    Add pieces
                  </button>
                )}
                {members.length > 0 && (
                  <Link href={`/stylist?collection=${collection.id}`} className="btn-outline">
                    Style this collection
                  </Link>
                )}
              </div>
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
              <span className="text-xs text-muted">Delete this collection? Its pieces stay in your Atelier.</span>
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
          <p className="display text-3xl">Your Atelier is empty</p>
          <p className="mx-auto mt-3 max-w-md text-muted">Upload some pieces first, then come back to group them.</p>
          <Link href="/wardrobe" className="btn-outline mt-6">
            Go to Atelier
          </Link>
        </div>
      ) : members.length === 0 ? (
        <div className="mt-10 border border-dashed border-line px-6 py-16 text-center">
          <p className="display text-3xl">No pieces yet</p>
          <p className="mx-auto mt-3 max-w-md text-muted">Add pieces from your Atelier to build this collection.</p>
          <button type="button" className="btn-outline mt-6" onClick={openPicker} disabled={pending !== null}>
            Add pieces
          </button>
        </div>
      ) : (
        <ul className="mt-10 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {members.map((item) => (
            <li key={item.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated images */}
              <img
                src={item.imageUrl}
                alt={describePiece(item)}
                loading="lazy"
                className="aspect-[3/4] w-full bg-card object-cover"
              />
              <p className="display mt-3 text-2xl">{item.name}</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="eyebrow">
                  {CATEGORY_LABELS[item.category]} · {item.colour}
                </p>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => removeMember(item.id)}
                  disabled={pending !== null}
                  aria-label={`Remove ${item.name} from ${collection.name}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PickerDialog
        dialogRef={pickerRef}
        candidates={candidates}
        saving={pending === "save"}
        error={pending === null ? error : null}
        onAdd={addMembers}
      />
    </div>
  );
}

function PickerDialog({
  dialogRef,
  candidates,
  saving,
  error,
  onAdd,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  candidates: WardrobeItem[];
  saving: boolean;
  error: string | null;
  onAdd: (ids: string[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  // Closing the picker (Esc, ×, Cancel, or a finished save) always drops the unsaved selection.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const reset = () => setPicked(new Set());
    dialog.addEventListener("close", reset);
    return () => dialog.removeEventListener("close", reset);
  }, [dialogRef]);

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="picker-title"
      className="m-auto w-[min(92vw,56rem)] bg-paper p-0 text-ink backdrop:bg-scrim/50"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 p-6 sm:px-8">
          <div>
            <p className="eyebrow">From your Atelier</p>
            <h2 id="picker-title" className="display mt-1 text-4xl">
              Add pieces
            </h2>
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
          {candidates.length === 0 ? (
            <p className="py-10 text-center text-muted">Every piece in your Atelier is already in this collection.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
              {candidates.map((item) => {
                const isPicked = picked.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={isPicked}
                      onClick={() => toggle(item.id)}
                      disabled={saving}
                      className="group block w-full text-left"
                    >
                      <span
                        className={`relative block border-2 transition-colors ${
                          isPicked ? "border-ink" : "border-transparent group-hover:border-line"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated images */}
                        <img
                          src={item.imageUrl}
                          alt={describePiece(item)}
                          loading="lazy"
                          className={`aspect-[3/4] w-full bg-card object-cover transition-opacity ${
                            isPicked ? "" : "opacity-70 group-hover:opacity-100"
                          }`}
                        />
                        {isPicked && (
                          <span
                            aria-hidden="true"
                            className="absolute top-2 right-2 grid h-7 w-7 place-items-center bg-ink text-sm text-paper"
                          >
                            ✓
                          </span>
                        )}
                      </span>
                      <span className="display mt-2 block truncate text-xl">{item.name}</span>
                      <span className="eyebrow mt-1 block">
                        {CATEGORY_LABELS[item.category]} · {item.colour}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-6 sm:px-8">
          <p className="eyebrow">{picked.size} selected</p>
          <div className="flex items-center gap-4">
            <button type="button" className="btn-link" onClick={() => dialogRef.current?.close()} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void onAdd([...picked])}
              disabled={picked.size === 0 || saving}
            >
              {saving ? "Adding…" : picked.size > 1 ? `Add ${picked.size} pieces` : "Add piece"}
            </button>
          </div>
        </div>
        {error && (
          <div className="px-6 pb-6 sm:px-8">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </div>
    </dialog>
  );
}
