import type { Metadata } from "next";
import { StylistView } from "@/components/StylistView";
import { aiMode } from "@/lib/ai";
import { listCollections, listItems, listLooks, toCollection, toLook, toWardrobeItem } from "@/lib/repo";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Stylist" };

export default async function StylistPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requirePageUser();
  const items = listItems(user.id).map(toWardrobeItem);
  const collections = listCollections(user.id).map(toCollection);
  // "Style this collection" links here as /stylist?collection=<id> and "Style around this" as
  // /stylist?anchor=<id>; ignore ids that aren't the user's.
  const { collection, anchor } = await searchParams;
  const initialCollectionId = collections.find((c) => c.id === collection)?.id ?? null;
  const initialAnchorId = items.find((item) => item.id === anchor)?.id ?? null;
  return (
    <StylistView
      items={items}
      collections={collections}
      initialCollectionId={initialCollectionId}
      initialAnchorId={initialAnchorId}
      initialLooks={listLooks(user.id).map(toLook)}
      aiMode={aiMode()}
    />
  );
}
