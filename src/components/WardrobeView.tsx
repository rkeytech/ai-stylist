"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type RefObject,
} from "react";
import type { AiMode } from "@/lib/ai";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { prepareImage } from "@/lib/client-image";
import { CATEGORIES, CATEGORY_LABELS, describePiece, type Category, type WardrobeItem } from "@/lib/wardrobe";
import { AiNotice, ErrorNote, PageHeading } from "./ui";

type Filter = "all" | Category;

export function WardrobeView({
  initialItems,
  initialColours,
  aiMode,
}: {
  initialItems: WardrobeItem[];
  initialColours: string[];
  aiMode: AiMode;
}) {
  const [items, setItems] = useState(initialItems);
  const [colours, setColours] = useState(initialColours);
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<WardrobeItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      all: items.length,
      top: 0,
      bottom: 0,
      dress: 0,
      shoes: 0,
      outerwear: 0,
      accessories: 0,
    };
    for (const item of items) result[item.category]++;
    return result;
  }, [items]);

  const visible = filter === "all" ? items : items.filter((item) => item.category === filter);

  async function remove(item: WardrobeItem) {
    setRemovingId(item.id);
    setError(null);
    try {
      await apiFetch(`/api/items/${item.id}`, { method: "DELETE" });
      setItems((list) => list.filter((entry) => entry.id !== item.id));
    } catch (err) {
      setError(errorMessage(err, "Couldn't remove that item."));
    } finally {
      setRemovingId(null);
      setConfirmingId(null);
    }
  }

  function onUploaded(item: WardrobeItem) {
    setItems((list) => [item, ...list]);
    setFilter((current) => (current === "all" || current === item.category ? current : "all"));
  }

  function startEdit(item: WardrobeItem) {
    setEditingItem(item);
    editDialogRef.current?.showModal();
  }

  function onSaved(item: WardrobeItem) {
    setItems((list) => list.map((entry) => (entry.id === item.id ? item : entry)));
  }

  function onColourAdded(colour: string) {
    setColours((list) => (list.includes(colour) ? list : [...list, colour].sort()));
  }

  // Native close (Esc, the × button, or a finished save) always leaves the dialog
  // empty for the next item, rather than flashing the previously edited one.
  useEffect(() => {
    const dialog = editDialogRef.current;
    if (!dialog) return;
    const onClose = () => setEditingItem(null);
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  return (
    <div>
      <PageHeading
        eyebrow="The Archive"
        title="Wardrobe"
        action={
          <button type="button" className="btn-primary" onClick={() => dialogRef.current?.showModal()}>
            Upload item
          </button>
        }
      />
      <AiNotice mode={aiMode} />

      <div role="group" aria-label="Filter by category" className="mt-8 flex flex-wrap gap-2">
        {(["all", ...CATEGORIES] as Filter[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className="chip"
          >
            {value === "all" ? "All" : CATEGORY_LABELS[value]}
            <span className="ml-1.5 opacity-60">{counts[value]}</span>
          </button>
        ))}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {visible.length === 0 ? (
        <div className="mt-10 border border-dashed border-line px-6 py-16 text-center">
          <p className="display text-3xl">Nothing filed here yet</p>
          <p className="mx-auto mt-3 max-w-md text-muted">
            {filter === "all"
              ? "Upload a photo of something you own to begin the archive."
              : `No ${CATEGORY_LABELS[filter].toLowerCase()} in your wardrobe yet.`}
          </p>
          <button type="button" className="btn-outline mt-6" onClick={() => dialogRef.current?.showModal()}>
            Upload item
          </button>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {visible.map((item) => (
            <li key={item.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated images */}
              <img
                src={item.imageUrl}
                alt={describePiece(item)}
                loading="lazy"
                className="aspect-[3/4] w-full bg-card object-cover"
              />
              <p className="display mt-3 text-2xl">{item.name}</p>
              <p className="eyebrow mt-1">
                {CATEGORY_LABELS[item.category]} · {item.colour}
              </p>
              {confirmingId === item.id ? (
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-xs text-muted">Remove this piece?</span>
                  <button
                    type="button"
                    className="btn-link text-accent"
                    disabled={removingId === item.id}
                    onClick={() => void remove(item)}
                  >
                    {removingId === item.id ? "Removing…" : "Yes"}
                  </button>
                  <button type="button" className="btn-link" onClick={() => setConfirmingId(null)}>
                    No
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" className="btn-link" onClick={() => startEdit(item)}>
                    Edit
                  </button>
                  <button type="button" className="btn-link" onClick={() => setConfirmingId(item.id)}>
                    Remove
                  </button>
                  <Link href={`/stylist?anchor=${item.id}`} className="btn-link">
                    Style around this
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <UploadDialog dialogRef={dialogRef} aiMode={aiMode} onUploaded={onUploaded} />
      <EditDialog
        dialogRef={editDialogRef}
        item={editingItem}
        colours={colours}
        onSaved={onSaved}
        onColourAdded={onColourAdded}
      />
    </div>
  );
}

function UploadDialog({
  dialogRef,
  aiMode,
  onUploaded,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  aiMode: AiMode;
  onUploaded: (item: WardrobeItem) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manual = aiMode === "unconfigured";

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  const reset = useCallback(() => {
    formRef.current?.reset();
    setPreview(null);
    setError(null);
    setPending(false);
  }, []);

  // Listen to the native event: closing via Esc, the × button or a finished upload
  // must always leave a fresh form for the next upload.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.addEventListener("close", reset);
    return () => dialog.removeEventListener("close", reset);
  }, [dialogRef, reset]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const { blob } = await prepareImage(file);
      setPreview({ blob, url: URL.createObjectURL(blob) });
      setError(null);
    } catch {
      event.target.value = "";
      setPreview(null);
      setError("That file couldn't be read as an image. Try a JPEG, PNG or WebP photo.");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) {
      setError("Choose a photo of the item first.");
      return;
    }
    const fields = new FormData(event.currentTarget);
    const body = new FormData();
    body.append("image", preview.blob, "item.jpg");
    for (const key of ["name", "category", "colour"]) body.append(key, String(fields.get(key) ?? ""));

    setPending(true);
    setError(null);
    try {
      const { item } = await apiFetch<{ item: WardrobeItem }>("/api/items", { method: "POST", body });
      onUploaded(item);
      reset();
      dialogRef.current?.close();
    } catch (err) {
      setError(errorMessage(err, "Upload failed. Please try again."));
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="upload-title"
      className="m-auto w-[min(92vw,30rem)] bg-paper p-0 text-ink backdrop:bg-scrim/50"
    >
      <form ref={formRef} onSubmit={onSubmit} className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">New piece</p>
            <h2 id="upload-title" className="display mt-1 text-4xl">
              Upload item
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

        <label className="mt-6 block cursor-pointer">
          <span className="sr-only">Photo of the item</span>
          <span className="relative block aspect-[4/3] overflow-hidden border border-dashed border-line bg-card">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={preview.url} alt="Selected item" className="absolute inset-0 h-full w-full object-contain" />
            ) : (
              <span className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted">
                Tap to take a photo or choose one
              </span>
            )}
          </span>
          <input name="photo" type="file" accept="image/*" onChange={onFile} className="sr-only" />
        </label>

        <label className="mt-6 block">
          <span className="eyebrow">Name{manual ? "" : " (optional)"}</span>
          <input
            name="name"
            maxLength={60}
            required={manual}
            placeholder={manual ? "e.g. Blue shirt" : "Leave blank and AI will name it"}
            className="field mt-1"
          />
        </label>

        <div className="mt-6 grid grid-cols-2 gap-5">
          <label className="block">
            <span className="eyebrow">Category</span>
            <select name="category" defaultValue={manual ? "" : "auto"} required={manual} className="field mt-1">
              {manual ? (
                <option value="" disabled>
                  Choose…
                </option>
              ) : (
                <option value="auto">Detect with AI</option>
              )}
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="eyebrow">Colour</span>
            <input
              name="colour"
              list="known-colours"
              maxLength={30}
              required={manual}
              placeholder={manual ? "e.g. navy" : "Detect with AI"}
              className="field mt-1"
            />
          </label>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button type="submit" disabled={pending} className="btn-primary mt-8 w-full">
          {pending ? (manual ? "Filing it…" : "AI is looking at your photo…") : "Add to wardrobe"}
        </button>
      </form>
    </dialog>
  );
}

function EditDialog({
  dialogRef,
  item,
  colours,
  onSaved,
  onColourAdded,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  item: WardrobeItem | null;
  colours: string[];
  onSaved: (item: WardrobeItem) => void;
  onColourAdded: (colour: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setPending(false);
  }, [item]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("name") ?? "").trim();
    const category = String(fields.get("category") ?? "");
    const colour = String(fields.get("colour") ?? "").trim().toLowerCase();

    setPending(true);
    setError(null);
    try {
      const { item: updated } = await apiFetch<{ item: WardrobeItem }>(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, colour }),
      });
      onSaved(updated);
      onColourAdded(updated.colour);
      dialogRef.current?.close();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save those changes."));
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="edit-title"
      className="m-auto w-[min(92vw,30rem)] bg-paper p-0 text-ink backdrop:bg-scrim/50"
    >
      {item && (
        <form key={item.id} onSubmit={onSubmit} className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Edit piece</p>
              <h2 id="edit-title" className="display mt-1 text-4xl">
                {item.name}
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

          <label className="mt-6 block">
            <span className="eyebrow">Name</span>
            <input name="name" maxLength={60} required defaultValue={item.name} className="field mt-1" />
          </label>

          <div className="mt-6 grid grid-cols-2 gap-5">
            <label className="block">
              <span className="eyebrow">Category</span>
              <select name="category" defaultValue={item.category} required className="field mt-1">
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="eyebrow">Colour</span>
              <input
                name="colour"
                list="known-colours"
                maxLength={30}
                required
                defaultValue={item.colour}
                className="field mt-1"
              />
            </label>
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          <button type="submit" disabled={pending} className="btn-primary mt-8 w-full">
            {pending ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}
      <datalist id="known-colours">
        {colours.map((colour) => (
          <option key={colour} value={colour} />
        ))}
      </datalist>
    </dialog>
  );
}
