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
  const collections = listCollections(user.id).map(toCollection);
  // "Style this collection" links here as /stylist?collection=<id>; ignore ids that aren't the user's.
  const { collection } = await searchParams;
  const initialCollectionId = collections.find((c) => c.id === collection)?.id ?? null;
  return (
    <StylistView
      items={listItems(user.id).map(toWardrobeItem)}
      collections={collections}
      initialCollectionId={initialCollectionId}
      initialLooks={listLooks(user.id).map(toLook)}
      aiMode={aiMode()}
    />
  );
}
