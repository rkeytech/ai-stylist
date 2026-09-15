import type { Metadata } from "next";
import { StylistView } from "@/components/StylistView";
import { aiMode } from "@/lib/ai";
import { listItems, listLooks, toLook, toWardrobeItem } from "@/lib/repo";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Stylist" };

export default async function StylistPage() {
  const user = await requirePageUser();
  return (
    <StylistView
      items={listItems(user.id).map(toWardrobeItem)}
      initialLooks={listLooks(user.id).map(toLook)}
      aiMode={aiMode()}
    />
  );
}
