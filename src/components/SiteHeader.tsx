"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

const TABS = [
  { href: "/wardrobe", label: "Wardrobe" },
  { href: "/collections", label: "Collections" },
  { href: "/stylist", label: "Stylist" },
];

export function SiteHeader({ email }: { email: string }) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/login");
  }

  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex items-center justify-between border-b border-line py-3 text-[10px] tracking-[0.3em] text-muted uppercase">
          <span>Private Edition</span>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <span className="hidden md:inline" title="Signed in">
              {email}
            </span>
            <button type="button" onClick={signOut} disabled={signingOut} className="btn-link !text-[10px]">
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-3 py-6">
          <Link href="/wardrobe" className="wordmark text-4xl sm:text-5xl">
            ATELIER
          </Link>
          <p className="eyebrow">Wardrobe, considered</p>
        </div>
      </div>
      <nav aria-label="Main" className="border-t border-line">
        <div className="mx-auto flex max-w-7xl gap-8 px-5 sm:px-8">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative py-4 text-[12px] tracking-[0.25em] uppercase transition-colors ${
                  active ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {tab.label}
                {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
