import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Try-On" };

// Try-On is temporarily disabled: this app has no image-generation provider configured right now
// (see src/lib/ai.ts). The full camera flow still lives in TryOnView.tsx and the /api/try-on routes -
// swap this page back to rendering <TryOnView /> (and restore its nav tab in SiteHeader.tsx and its
// link in StylistView.tsx) once a provider is wired back in.
export default async function TryOnPage() {
  await requirePageUser();
  return (
    <div>
      <PageHeading eyebrow="The Fitting Room" title="Try-On" />
      <p className="mt-6 border-l-2 border-accent bg-card/60 px-4 py-3 text-sm text-muted">
        <strong className="font-medium text-ink">Try-On is temporarily disabled.</strong> This feature needs an
        image-generation model, which isn&apos;t configured right now. Wardrobe and Stylist are unaffected.
      </p>
    </div>
  );
}
