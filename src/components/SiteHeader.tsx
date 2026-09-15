"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

const TABS = [
  { href: "/wardrobe", label: "Wardrobe" },
  { href: "/stylist", label: "Stylist" },
  { href: "/try-on", label: "Try-On" },
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
      <div className="relative mx-auto max-w-6xl px-5 pt-10 pb-6 text-center sm:px-8">
        <Link href="/wardrobe" className="wordmark text-4xl sm:text-5xl">
          STYLED
        </Link>
        <p className="eyebrow mt-2">Your personal stylist</p>
        <div className="absolute top-3 right-4 flex items-center gap-4 sm:top-8 sm:right-8">
          <ThemeToggle />
          <span className="hidden text-xs text-muted md:inline" title="Signed in">
            {email}
          </span>
          <button type="button" onClick={signOut} disabled={signingOut} className="btn-link">
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
      <nav aria-label="Main" className="mx-auto grid max-w-6xl grid-cols-3">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`relative py-4 text-center text-[12px] tracking-[0.25em] uppercase transition-colors ${
                active ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {tab.label}
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
