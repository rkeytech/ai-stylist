import type { ReactNode } from "react";
import type { AiMode } from "@/lib/ai";
import { describePiece, type WardrobeItem } from "@/lib/wardrobe";

export function PageHeading({
  eyebrow,
  title,
  intro,
  action,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-1 text-5xl sm:text-6xl">{title}</h1>
        {intro && <p className="mt-3 max-w-xl text-muted">{intro}</p>}
      </div>
      {action}
    </div>
  );
}

export function AiNotice({ mode }: { mode: AiMode }) {
  if (mode === "live") return null;
  return (
    <p className="mt-6 border-l-2 border-accent bg-card/60 px-4 py-3 text-sm text-muted">
      {mode === "mock" ? (
        <>
          <strong className="font-medium text-ink">Mock AI mode.</strong> Tagging and styling are simulated
          offline. Set <code>AI_MOCK=false</code> and add an OpenRouter key for real results.
        </>
      ) : (
        <>
          <strong className="font-medium text-ink">AI isn&apos;t set up yet.</strong> Add{" "}
          <code>OPENROUTER_API_KEY</code> to <code>.env.local</code> and restart the server to enable
          auto-tagging and the stylist.
        </>
      )}
    </p>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-5 border-l-2 border-accent pl-3 text-sm text-accent">
      {children}
    </p>
  );
}

export function LookPieces({
  itemIds,
  itemsById,
  size = "md",
}: {
  itemIds: string[];
  itemsById: Map<string, WardrobeItem>;
  size?: "sm" | "md";
}) {
  const width = size === "sm" ? "w-16" : "w-28 sm:w-36";
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {itemIds.map((id) => {
        const item = itemsById.get(id);
        if (!item) return null;
        return (
          <figure key={id} className={`${width} shrink-0`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated images */}
            <img
              src={item.imageUrl}
              alt={describePiece(item)}
              loading="lazy"
              className="aspect-square w-full bg-card object-cover"
            />
            {size === "md" && <figcaption className="mt-1 truncate text-xs text-muted">{item.name}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}

export const lookNumber = (index: number) => String(index + 1).padStart(2, "0");
