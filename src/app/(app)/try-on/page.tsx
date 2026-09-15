import type { Metadata } from "next";
import { TryOnView } from "@/components/TryOnView";
import { aiMode } from "@/lib/ai";
import { listItems, listLooks, listTryOns, toLook, toTryOn, toWardrobeItem } from "@/lib/repo";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Try-On" };

export default async function TryOnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const { look } = await searchParams;
  return (
    <TryOnView
      looks={listLooks(user.id).map(toLook)}
      items={listItems(user.id).map(toWardrobeItem)}
      initialSaved={listTryOns(user.id, true).map(toTryOn)}
      initialLookId={typeof look === "string" ? look : null}
      aiMode={aiMode()}
    />
  );
}
