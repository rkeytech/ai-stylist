import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { requirePageUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  return (
    <>
      <SiteHeader email={user.email} />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">{children}</main>
    </>
  );
}
