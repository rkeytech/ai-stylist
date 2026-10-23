import type { Metadata } from "next";
import { CollectionsView } from "@/components/CollectionsView";
import { listCollections, listItems, toCollection, toWardrobeItem } from "@/lib/repo";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const user = await requirePageUser();
  return (
    <CollectionsView
      initialCollections={listCollections(user.id).map(toCollection)}
      items={listItems(user.id).map(toWardrobeItem)}
    />
  );
}
