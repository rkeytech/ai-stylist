"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { ThemeToggle } from "./ThemeToggle";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignup = mode === "signup";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      // Full navigation so the server layout picks up the new session cookie.
      window.location.assign("/wardrobe");
    } catch (err) {
      setError(errorMessage(err, "Something went wrong. Please try again."));
      setPending(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <ThemeToggle className="absolute top-4 right-4 sm:top-6 sm:right-6" />
      <p className="wordmark text-5xl">STYLED</p>
      <p className="eyebrow mt-2">Your personal stylist</p>

      <form onSubmit={onSubmit} className="mt-14 w-full max-w-sm">
        <p className="eyebrow">{isSignup ? "New here" : "Welcome back"}</p>
        <h1 className="display mt-1 text-5xl">{isSignup ? "Open your archive" : "Sign in"}</h1>

        <label className="mt-10 block">
          <span className="eyebrow">Email</span>
          <input name="email" type="email" required autoComplete="email" className="field mt-1" />
        </label>

        <label className="mt-6 block">
          <span className="eyebrow">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={isSignup ? 8 : undefined}
            autoComplete={isSignup ? "new-password" : "current-password"}
            className="field mt-1"
          />
          {isSignup && <span className="mt-1 block text-xs text-muted">At least 8 characters.</span>}
        </label>

        {error && (
          <p role="alert" className="mt-6 border-l-2 border-accent pl-3 text-sm text-accent">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary mt-10 w-full">
          {pending ? "One moment…" : isSignup ? "Create account" : "Sign in"}
        </button>

        <p className="mt-6 text-center text-sm text-muted">
          {isSignup ? "Already have an account? " : "New to Styled? "}
          <Link href={isSignup ? "/login" : "/signup"} className="text-ink underline underline-offset-4">
            {isSignup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </form>
    </div>
  );
}
