import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionView } from "@/components/CollectionView";
import { getCollection, listItems, toCollection, toWardrobeItem } from "@/lib/repo";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Collection" };

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const collection = getCollection(user.id, (await params).id);
  if (!collection) notFound();
  return (
    <CollectionView initialCollection={toCollection(collection)} items={listItems(user.id).map(toWardrobeItem)} />
  );
}
