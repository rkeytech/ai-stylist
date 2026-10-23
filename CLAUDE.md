# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Atelier — a personal AI stylist app, a plain Next.js codebase running entirely on the local machine: SQLite,
private on-disk file storage, and OpenRouter for AI.
Three features behind auth right now: **Wardrobe** (upload + auto-tag clothing photos), **Collections** (named
sets of wardrobe items, e.g. "Work"), **Stylist** ("Style me" → up to 3 AI-generated outfit looks, optionally for
an occasion and/or drawn from one collection). **Try-On** (live camera capture + AI image generation wearing a chosen look)
is temporarily disabled — see "Try-On is disabled" below.

## Commands

```bash
npm install
cp .env.example .env.local        # then set OPENROUTER_API_KEY, or set AI_MOCK=true
npm run dev                       # dev server (Turbopack)
npm run build && npm start        # production build and server
npm run typecheck                 # tsc --noEmit
npm test                          # vitest run — all unit tests
npm test -- tests/outfits.test.ts # run a single test file
npm test -- -t "name fragment"    # run tests matching a name
npm run test:e2e -- http://localhost:3000   # scripts/e2e.mjs against a running server (needs AI_MOCK=true)
npm run test:live                 # tests/openrouter.live.test.ts — makes one REAL OpenRouter call, costs quota
```

Node.js **22.13+** is required (the app uses the built-in `node:sqlite`, no external DB driver).

`npm run test:e2e` needs a server already running with `AI_MOCK=true` (e.g. `npm run dev` in one terminal with
that env var set). It drives the full API as three separate cookie-jar "browsers" (two real users + anonymous)
and checks auth, uploads, AI tagging, the stylist, try-on (still exercised in mock mode even though the live
feature is disabled — see below), privacy isolation between accounts, and deletion — treat it as the source of
truth for expected API behavior, not just a smoke test.

## Architecture

**Everything runs in one Next.js process** — no external services except the OpenRouter API. Data is not
in the cloud: SQLite lives at `$DATA_DIR/styled.db` (default `./data`) and uploaded photos live under
`$DATA_DIR/uploads/<userId>/`, served only through authenticated routes (there is no `public/` folder for
user images). Because of the single-file SQLite writer, only one instance of the app may run against a given
`DATA_DIR` at a time.

### Request flow and where things live

```
src/app/(app)/...          Pages behind sign-in (layout.tsx calls requirePageUser(), redirects to /login)
src/app/login, signup      Auth pages
src/app/api/...            Route handlers, each wrapped in handle() from src/lib/http.ts
src/lib/http.ts            requireUser(), assertSameOrigin(), handle() (HttpError/AiError -> JSON {error}),
                            body/form/file parsing helpers shared by every route
src/lib/session.ts         Session cookie lifecycle: scrypt-independent SHA-256 token hashing, httpOnly cookie
src/lib/repo.ts            All SQL. Every query is scoped by user_id — this is the sole privacy boundary
src/lib/db.ts              node:sqlite connection + schema (idempotent CREATE TABLE), kept on globalThis to
                            survive Next.js dev hot-reloads
src/lib/storage.ts         Per-user photo files on disk, path-traversal-checked against the uploads root
src/lib/ai.ts              OpenRouter calls: auto-tagging, the stylist, plus mock mode. Try-on generation is
                            disabled (see below) — generateTryOn() only ever runs its mock branch
src/lib/outfits.ts         Outfit validity rules + sanitizing untrusted model JSON into safe LookDraft[]
src/lib/wardrobe.ts        Category enum, keyword-based category/colour guessing, shared text-cleaning helpers
src/lib/item-images.ts     Loads stored photos off disk for AI calls, skipping any that are missing
src/lib/collections.ts     Shared collection-route helpers (name validation incl. per-user uniqueness -> 409)
```

Every route handler follows the same shape: wrap in `handle()`, call `assertSameOrigin()` for state-changing
requests, call `requireUser()`, then talk to `repo.ts`/`storage.ts`/`ai.ts`. Thrown `HttpError`/`AiError` become
`{ error: string }` JSON responses with the right status — don't `try/catch` inside handlers just to format
errors, throw one of these two types instead and let `handle()` do it.

### AI (`src/lib/ai.ts`)

- `aiMode()` returns `"live" | "mock" | "unconfigured"` based on `AI_MOCK` and `OPENROUTER_API_KEY`. `tagItem`
  and `suggestLooks` branch on this first, so mock mode has zero network calls.
- Vision (tagging, stylist) calls OpenRouter's chat completions endpoint (`https://openrouter.ai/api/v1/chat/completions`)
  directly via `fetch` — there's no SDK dependency. Images go in as `image_url` content parts with a base64
  `data:` URL; structured output is requested with `response_format: { type: "json_object" }` and the exact
  shape is spelled out in the prompt (not a provider-native JSON schema), since the model list can span very
  different providers. `OPENROUTER_VISION_MODELS` is a comma-separated, ordered list (see `visionModels()`
  in `ai.ts`) — put free models first and any paid fallbacks after, cheapest first; a later model is only
  ever called if every one before it fails (busy, rate-limited, out of credits, or unavailable).
- `POST /api/stylist` accepts an optional JSON body `{ occasion?: string, collectionId?: string, anchorItemId?: string }` (empty body is
  fine). The occasion is user-typed text, so `suggestLooks()` embeds it JSON-quoted in the prompt as data, and it
  is saved on the `looks.occasion` column so the UI can label the batch. `collectionId` only narrows which items
  are passed in (404 if it isn't the user's collection) and is never sent to the model; the collection's name is
  snapshotted into `looks.collection_name` (like `tryons.look_title`) so the label survives a rename/delete.
  `anchorItemId` ("Style around this") makes every look include that item: 404 if it isn't the user's, it
  joins the pool even when outside the chosen collection, `canStyleAround()` gates it (422), the model is told
  to include it, and `sanitizeLooks`/`mockLooks` enforce it. It's stored as `looks.anchor_item_id` — an id, not
  a snapshot, since `deleteItem()` already deletes any look containing the item.
- No retries here: an overloaded/rate-limited/out-of-credits model can be slow to answer with an error, so
  `withModelFallback()` moves to the fallback model instead of waiting on the same one again. Preserve this
  pattern when adding new OpenRouter calls.
- All model output is untrusted: stylist JSON is run through `sanitizeLooks()` (drops invalid outfits rather
  than repairing them); `tagItem` falls back to keyword-guessing (`wardrobe.ts`) for any field the model didn't
  return sensibly.
- Mock mode (`AI_MOCK=true`) is a fully offline path used by `npm run test:e2e` and local dev without a key:
  tags come from keyword-matching the item name (`wardrobe.ts`), stylist looks are generated deterministically
  by `mockLooks()` in `outfits.ts`, and `generateTryOn()`'s mock branch just echoes the input photo back.

### Try-On is disabled

`generateTryOn()` in `ai.ts` throws immediately outside mock mode — this app has no image-generation provider
configured (the previous implementation used a paid Gemini image model; nothing has replaced it). The Try-On
tab is removed from `SiteHeader.tsx`'s nav, `StylistView.tsx`'s "Try this look on" link is removed, and
`src/app/(app)/try-on/page.tsx` renders a small disabled notice instead of `<TryOnView>`. Everything else —
`TryOnView.tsx`, the `/api/try-on*` routes, `repo.ts`/`storage.ts` try-on persistence, and mock-mode generation —
is untouched and still exercised by `npm run test:e2e`, so re-enabling later is: wire a provider into
`generateTryOn()`, swap the try-on page back to `<TryOnView>`, and restore the nav tab and stylist link.

### Outfit rules (`src/lib/outfits.ts`)

The single rule the whole app enforces: an outfit is **(one top + one bottom) or (one dress)**, plus optionally
one pair of shoes, one outerwear piece, and any number of accessories (jewellery, watches, bags, belts, hats,
and similar) — a dress is never combined with a top or bottom, and shoes/outerwear are capped at one each while
accessories are uncapped. This is checked both when sanitizing AI output and in `canStyle()` (gates whether
"Style me" is even available). Treat this file, not the AI prompt, as the authority on what a valid look is.

### Wardrobe categories and colours (`src/lib/wardrobe.ts`, `src/lib/db.ts`)

`CATEGORIES` (`top`, `bottom`, `dress`, `shoes`, `outerwear`, `accessories`) is a fixed, closed list — it's
baked into the `items.category` CHECK constraint and into the outfit rules above, so it doesn't grow at runtime.
Colours are the opposite: an open, growing vocabulary. The `colours` table is seeded from `COLOUR_WORDS` on
startup and every upload or edit (`POST /api/items`, `PATCH /api/items/[id]`) calls `repo.addColour()` so any
colour the AI tags or a user types becomes available to future dropdowns via `GET /api/colours`. Because
`items.category` has a CHECK constraint, adding `accessories` required a one-time in-place migration
(`migrateAccessoriesCategory()` in `db.ts`) that rebuilds the table for any database created before this
category existed — SQLite can't widen a CHECK constraint with `ALTER TABLE`.

### Theming and dark mode (`src/app/globals.css`, `src/components/ThemeToggle.tsx`)

- All UI is built on semantic Tailwind color tokens defined once in `@theme` in `globals.css`
  (`bg-paper`, `text-ink`, `bg-card`, `text-muted`, `border-line`, `text-accent`) — never raw hex/`bg-white`/etc.
  Dark mode is implemented by overriding those same custom properties inside a `.dark { ... }` block, so every
  component that already uses the tokens gets dark mode for free. New UI must use these tokens too, or it won't
  be themed correctly.
- `ThemeToggle.tsx` toggles a `dark` class on `<html>`, persisted in `localStorage` under the `theme` key. An
  inline script in `src/app/layout.tsx` applies the saved (or OS) preference before first paint to avoid a flash;
  `<html>` has `suppressHydrationWarning` for exactly this reason — don't remove it.
- `--color-scrim` / `--color-scrim-foreground` are the two tokens deliberately **not** overridden by `.dark`.
  They're for chrome that must always render dark regardless of theme (the try-on camera viewfinder in
  `TryOnView.tsx`, the upload dialog's `::backdrop` in `WardrobeView.tsx`) — using `ink`/`paper` there instead
  would invert them in dark mode and break contrast.

### Security posture (intentional, not incidental)

- Passwords: scrypt (`src/lib/password.ts`). Sessions: only a SHA-256 hash of the session token is stored
  (`src/lib/session.ts`); the cookie is `httpOnly`, `SameSite=Lax`.
- `assertSameOrigin()` in `http.ts` rejects cross-site state-changing requests as defense in depth on top of
  `SameSite=Lax`. Requests with no `Origin` header are allowed through (native/non-browser clients don't send one).
- Uploads are verified by magic bytes in `image-mime.ts` (`sniffImageMime`) — the client-supplied MIME type is
  never trusted — capped at 10 MB, and re-encoded client-side before upload (strips EXIF/GPS).
- `storage.ts` resolves stored paths and throws if the result escapes the uploads root (path traversal guard).
- Every `repo.ts` query is scoped by `user_id`; there is no other access-control layer, so any new query touching
  user data must include that scope.

## Feature plan / roadmap

`docs/feature-plan.md` is the living task list of what's done, in progress, planned, and still being discussed
for this app. **Read it before starting feature work** — it has its own instructions for keeping it current
(checking off finished items, moving started work into "In progress", filing new asks under "Backlog" or
"Ideas / needs discussion"). Treat it as the source of truth for project status; treat this file as the source
of truth for how the code currently works.

## Repo state / in-flight plans

`docs/mobile-plan.md` is an untracked planning doc for a future phase: adding bearer-token mobile auth, new
`/api/auth/me` and `/api/health` endpoints, login throttling, an `ALLOWED_ORIGINS` env var, Dockerizing the app,
and a companion Flutter Android app. None of that is implemented yet — treat it as a plan, not current behavior,
but its "ground truth about the current codebase" section (§4) is a useful second description of the API
contract and design tokens if this file and the code ever seem to disagree. It's tracked as a backlog item in
`docs/feature-plan.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
