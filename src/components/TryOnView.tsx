"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { AiMode } from "@/lib/ai";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { captureFrame, closestAspectRatio, prepareImage, type PreparedImage } from "@/lib/client-image";
import type { Look, TryOnResult, WardrobeItem } from "@/lib/wardrobe";
import { AiNotice, ErrorNote, LookPieces, lookNumber, PageHeading } from "./ui";

type CameraState = { status: "starting" } | { status: "live" } | { status: "blocked"; message: string };

interface Photo {
  blob: Blob;
  url: string;
  aspectRatio: string;
}

type Generation =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "done"; result: TryOnResult }
  | { status: "error"; message: string };

function toPhoto(image: PreparedImage): Photo {
  return {
    blob: image.blob,
    url: URL.createObjectURL(image.blob),
    aspectRatio: closestAspectRatio(image.width, image.height),
  };
}

function cameraErrorMessage(err: unknown): string {
  switch (err instanceof DOMException ? err.name : "") {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access is blocked. Allow the camera for this site in your browser settings and press “Try again” - or use a photo instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "We couldn't find a camera on this device. You can use a photo instead.";
    case "NotReadableError":
      return "Your camera is busy in another app. Close it and try again, or use a photo instead.";
    default:
      return "The camera couldn't start. Try again, or use a photo instead.";
  }
}

export function TryOnView({
  looks,
  items,
  initialSaved,
  initialLookId,
  aiMode,
}: {
  looks: Look[];
  items: WardrobeItem[];
  initialSaved: TryOnResult[];
  initialLookId: string | null;
  aiMode: AiMode;
}) {
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [camera, setCamera] = useState<CameraState>({ status: "starting" });
  const [source, setSource] = useState<"camera" | "photo">("camera");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [lookId, setLookId] = useState(
    () => looks.find((look) => look.id === initialLookId)?.id ?? looks[0]?.id ?? null,
  );
  const [generation, setGeneration] = useState<Generation>({ status: "idle" });
  const [saved, setSaved] = useState(initialSaved);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedLook = looks.find((look) => look.id === lookId) ?? null;
  const busy = generation.status === "generating";

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(
    async (isActive: () => boolean = () => true) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera({
          status: "blocked",
          message: window.isSecureContext
            ? "This browser doesn't support camera access. You can use a photo instead."
            : "The camera only works over a secure connection (https or localhost). You can use a photo instead.",
        });
        return;
      }
      setCamera({ status: "starting" });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        });
        if (!isActive()) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        stopCamera();
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamera({ status: "live" });
      } catch (err) {
        if (isActive()) setCamera({ status: "blocked", message: cameraErrorMessage(err) });
      }
    },
    [stopCamera],
  );

  useEffect(() => {
    let active = true;
    void startCamera(() => active);
    return () => {
      active = false;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  async function onPhotoChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setPhoto(toPhoto(await prepareImage(file)));
      setSource("photo");
      setNotice(null);
    } catch {
      setNotice("That photo couldn't be read. Please choose a JPEG, PNG or WebP image.");
    }
  }

  async function generate(input: Photo, look: Look) {
    setGeneration({ status: "generating" });
    const body = new FormData();
    body.append("photo", input.blob, "photo.jpg");
    body.append("lookId", look.id);
    body.append("aspectRatio", input.aspectRatio);
    try {
      const { tryOn } = await apiFetch<{ tryOn: TryOnResult }>("/api/try-on", { method: "POST", body });
      setGeneration({ status: "done", result: tryOn });
    } catch (err) {
      setGeneration({ status: "error", message: errorMessage(err, "The try-on didn't work this time.") });
    }
  }

  async function tryItOn() {
    if (!selectedLook) return;
    setNotice(null);
    let input = photo;
    if (source === "camera") {
      const video = videoRef.current;
      if (camera.status !== "live" || !video || video.videoWidth === 0) {
        setNotice("Your camera isn't ready yet. Allow camera access, or use a photo instead.");
        return;
      }
      input = toPhoto(await captureFrame(video));
      setPhoto(input);
    }
    if (!input) {
      setNotice("Choose a photo first.");
      return;
    }
    await generate(input, selectedLook);
  }

  function retry() {
    if (photo && selectedLook) void generate(photo, selectedLook);
  }

  async function saveResult() {
    if (generation.status !== "done" || generation.result.saved) return;
    setSaving(true);
    try {
      const { tryOn } = await apiFetch<{ tryOn: TryOnResult }>(`/api/try-on/${generation.result.id}`, {
        method: "PATCH",
      });
      setGeneration({ status: "done", result: tryOn });
      setSaved((list) => [tryOn, ...list]);
    } catch (err) {
      setNotice(errorMessage(err, "Couldn't save that try-on."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteSaved(id: string) {
    try {
      await apiFetch(`/api/try-on/${id}`, { method: "DELETE" });
      setSaved((list) => list.filter((entry) => entry.id !== id));
      if (generation.status === "done" && generation.result.id === id) setGeneration({ status: "idle" });
    } catch (err) {
      setNotice(errorMessage(err, "Couldn't delete that try-on."));
    }
  }

  const photoInput = (
    <input type="file" accept="image/*" className="sr-only" onChange={onPhotoChosen} disabled={busy} />
  );

  return (
    <div>
      <PageHeading
        eyebrow="The Fitting Room"
        title="Try-On"
        intro="Pick one of your stylist's looks, stand back from the camera and see yourself wearing it."
      />
      <AiNotice mode={aiMode} />

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section aria-label="Camera">
          <div className="relative aspect-[3/4] overflow-hidden bg-scrim">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full -scale-x-100 object-cover ${
                source === "camera" && camera.status === "live" ? "" : "hidden"
              }`}
            />
            {source === "photo" && photo && (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={photo.url} alt="Your chosen photo" className="h-full w-full object-cover" />
            )}
            {source === "camera" && camera.status === "live" && (
              <span className="absolute top-3 left-3 flex items-center gap-2 bg-scrim-foreground/90 px-2.5 py-1 text-[10px] tracking-[0.25em] text-scrim uppercase">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                Live
              </span>
            )}
            {source === "camera" && camera.status === "starting" && (
              <p className="absolute inset-0 grid place-items-center text-sm text-scrim-foreground/80">
                Starting your camera…
              </p>
            )}
            {source === "camera" && camera.status === "blocked" && (
              <div
                role="alert"
                className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center text-scrim-foreground"
              >
                <p className="display text-3xl">The camera is off</p>
                <p className="max-w-xs text-sm text-scrim-foreground/80">{camera.message}</p>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="btn-outline border-scrim-foreground text-scrim-foreground hover:bg-scrim-foreground hover:text-scrim"
                  >
                    Try again
                  </button>
                  <label className="btn-primary cursor-pointer bg-scrim-foreground text-scrim hover:opacity-90">
                    Use a photo
                    {photoInput}
                  </label>
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="eyebrow">{source === "camera" ? "Your camera" : "Your photo"}</p>
            {source === "photo" ? (
              <button
                type="button"
                className="btn-link"
                disabled={busy}
                onClick={() => {
                  setSource("camera");
                  if (camera.status !== "live") void startCamera();
                }}
              >
                Use camera
              </button>
            ) : (
              <label className="btn-link cursor-pointer">
                Use a photo instead
                {photoInput}
              </label>
            )}
          </div>
        </section>

        <section aria-label="Try-on result" aria-live="polite">
          <div className="relative aspect-[3/4] overflow-hidden bg-card">
            {generation.status === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center">
                <p className="display text-3xl">Your reflection</p>
                <p className="text-sm text-muted">Choose a look below and press &ldquo;Try it on&rdquo;.</p>
              </div>
            )}
            {busy && photo && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- blurred preview of the captured frame */}
                <img src={photo.url} alt="" className="h-full w-full scale-110 object-cover blur-xl" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-paper/30 p-6 text-center">
                  <span className="h-9 w-9 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
                  <p className="display text-2xl">Dressing you in {selectedLook?.title}…</p>
                  <p className="eyebrow text-ink/70">This can take up to a minute</p>
                </div>
              </>
            )}
            {generation.status === "done" && (
              // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated image
              <img
                src={generation.result.imageUrl}
                alt={`You wearing ${generation.result.lookTitle}`}
                className="h-full w-full object-contain"
              />
            )}
            {generation.status === "error" && (
              <div
                role="alert"
                className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center"
              >
                <p className="display text-3xl">That didn&apos;t work</p>
                <p className="max-w-xs text-sm text-muted">{generation.message}</p>
                {photo && selectedLook && (
                  <button type="button" onClick={retry} className="btn-outline">
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">{generation.status === "done" ? generation.result.lookTitle : "The result"}</p>
            {generation.status === "done" && (
              <div className="flex items-center gap-5">
                <button type="button" onClick={retry} className="btn-link">
                  Retry
                </button>
                <a href={`${generation.result.imageUrl}?download=1`} className="btn-link">
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => void saveResult()}
                  disabled={saving || generation.result.saved}
                  className="btn-link text-ink"
                >
                  {generation.result.saved ? "Saved ✓" : saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="mt-12">
        <p className="eyebrow">Choose a look</p>
        {looks.length === 0 ? (
          <div className="mt-4 border border-dashed border-line px-6 py-12 text-center">
            <p className="display text-3xl">No looks yet</p>
            <p className="mt-2 text-muted">Ask your stylist for outfit ideas first, then come back to try them on.</p>
            <Link href="/stylist" className="btn-primary mt-6">
              Go to the stylist
            </Link>
          </div>
        ) : (
          <div role="radiogroup" aria-label="Looks" className="mt-4 grid gap-4 md:grid-cols-3">
            {looks.map((look, index) => {
              const active = look.id === lookId;
              return (
                <button
                  key={look.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={busy}
                  onClick={() => setLookId(look.id)}
                  className={`border p-4 text-left transition-colors disabled:cursor-not-allowed ${
                    active ? "border-ink bg-card" : "border-line hover:border-ink"
                  }`}
                >
                  <p className="eyebrow">Look {lookNumber(index)}</p>
                  <p className="display mt-1 text-2xl">{look.title}</p>
                  <div className="mt-3">
                    <LookPieces itemIds={look.itemIds} itemsById={itemsById} size="sm" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {notice && <ErrorNote>{notice}</ErrorNote>}

        {looks.length > 0 && (
          <button
            type="button"
            onClick={() => void tryItOn()}
            disabled={!selectedLook || busy || (source === "camera" && camera.status !== "live")}
            className="btn-primary mt-6 w-full py-4"
          >
            {busy ? "Generating…" : "Try it on"}
          </button>
        )}
      </section>

      <section className="mt-14 border-t border-line pt-8">
        <p className="eyebrow">Saved try-ons</p>
        {saved.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing saved yet. Save a try-on you love and it will live here.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-5 md:grid-cols-4">
            {saved.map((entry) => (
              <li key={entry.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated image */}
                <img
                  src={entry.imageUrl}
                  alt={`You wearing ${entry.lookTitle}`}
                  loading="lazy"
                  className="aspect-[3/4] w-full bg-card object-cover"
                />
                <p className="display mt-2 text-xl">{entry.lookTitle}</p>
                <div className="mt-1 flex gap-4">
                  <a href={`${entry.imageUrl}?download=1`} className="btn-link">
                    Download
                  </a>
                  <button type="button" onClick={() => void deleteSaved(entry.id)} className="btn-link">
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
