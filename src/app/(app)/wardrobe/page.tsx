import type { Metadata } from "next";
import { WardrobeView } from "@/components/WardrobeView";
import { aiMode } from "@/lib/ai";
import { listColours, listItems, toWardrobeItem } from "@/lib/repo";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Wardrobe" };

export default async function WardrobePage() {
  const user = await requirePageUser();
  return (
    <WardrobeView
      initialItems={listItems(user.id).map(toWardrobeItem)}
      initialColours={listColours()}
      aiMode={aiMode()}
    />
  );
}
