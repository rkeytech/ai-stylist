# Architecture reference

Deep detail on how Stylistas works *right now*. `CLAUDE.md` has the short version and the working rules; read
the relevant section here before changing that area. If this file and the code disagree, the code wins — fix this file.

## Runtime and data

Everything runs in one Next.js process; the only external service is OpenRouter. SQLite lives at
`$DATA_DIR/styled.db` (default `./data`), uploaded photos under `$DATA_DIR/uploads/<userId>/`, served only through
authenticated routes (no `public/` folder for user images). Single-file SQLite writer → only one app instance per
`DATA_DIR`.

## File map

```
src/app/(app)/...     Pages behind sign-in (layout.tsx calls requirePageUser(), redirects to /login)
src/app/login,signup  Auth pages
src/app/api/...       Route handlers, each wrapped in handle()
src/lib/http.ts       requireUser(), assertSameOrigin(), handle() (HttpError/AiError -> JSON {error}), body/form/file helpers
src/lib/session.ts    Session cookie lifecycle: SHA-256 token hashing, httpOnly cookie
src/lib/repo.ts       All SQL. Every query scoped by user_id — the sole privacy boundary
src/lib/db.ts         node:sqlite connection + idempotent schema/migrations, kept on globalThis for dev hot-reload
src/lib/storage.ts    Per-user photo files, path-traversal-checked against the uploads root
src/lib/ai.ts         OpenRouter calls (tagging, stylist) + mock mode; try-on generation disabled
src/lib/outfits.ts    Outfit validity rules + sanitizing untrusted model JSON into LookDraft[]; mockLooks()
src/lib/wardrobe.ts   Category enum, keyword category/colour guessing, text-cleaning helpers
src/lib/item-images.ts  Loads stored photos for AI calls, skipping missing ones
src/lib/collections.ts  Collection-route helpers (name validation, per-user uniqueness -> 409)
src/lib/image-mime.ts   sniffImageMime() magic-byte check
src/lib/password.ts     scrypt
```

## Route handler shape

Wrap in `handle()` → `assertSameOrigin()` for state-changing requests → `requireUser()` → `repo.ts` / `storage.ts` /
`ai.ts`. Throw `HttpError`/`AiError`; `handle()` turns them into `{ error }` JSON. No `try/catch` in handlers just to
format errors.

## AI (`src/lib/ai.ts`)

- `aiMode()` → `"live" | "mock" | "unconfigured"` from `AI_MOCK` and `OPENROUTER_API_KEY`. `tagItem` and
  `suggestLooks` branch on it first; mock mode makes zero network calls.
- Calls go straight to `https://openrouter.ai/api/v1/chat/completions` via `fetch` (no SDK). Images are base64
  `data:` URLs in `image_url` parts. Output is `response_format: { type: "json_object" }` with the exact shape
  spelled out in the prompt (not a provider-native schema — models span many providers).
- `OPENROUTER_VISION_MODELS`: comma-separated, ordered (`visionModels()`); free first, paid fallbacks after, cheapest
  first. A later model is called only if every earlier one fails.
- No retries: `withModelFallback()` moves to the next model rather than waiting on a slow/overloaded one. Preserve
  this for any new OpenRouter call.
- All model output is untrusted: `sanitizeLooks()` drops invalid outfits rather than repairing them; `tagItem`
  falls back to keyword guessing (`wardrobe.ts`) per field the model didn't return sensibly.
- Mock mode (`AI_MOCK=true`): tags from keyword-matching the item name, looks from `mockLooks()`, and
  `generateTryOn()`'s mock branch echoes the input photo.

### `POST /api/stylist`

Optional JSON body `{ occasion?, collectionId?, anchorItemId? }` (empty body fine).

- `occasion` is user text: embedded JSON-quoted in the prompt as data; saved in `looks.occasion`.
- `collectionId` only narrows the item pool (404 if not the user's); never sent to the model. Name snapshotted into
  `looks.collection_name` so the label survives rename/delete.
- `anchorItemId` ("Style around this"): every look includes that item. 404 if not the user's; joins the pool even
  outside the chosen collection; `canStyleAround()` gates it (422); `sanitizeLooks`/`mockLooks` enforce it. Stored as
  `looks.anchor_item_id` (an id — `deleteItem()` already deletes looks containing the item).

## Try-On is disabled

`generateTryOn()` throws outside mock mode — no image-generation provider is configured (the old one was a paid
Gemini image model). Removed: the nav tab in `SiteHeader.tsx`, the "Try this look on" link in `StylistView.tsx`;
`src/app/(app)/try-on/page.tsx` shows a disabled notice instead of `<TryOnView>`. Untouched and still covered by
`npm run test:e2e`: `TryOnView.tsx`, `/api/try-on*`, try-on persistence in `repo.ts`/`storage.ts`, mock generation.
To re-enable: wire a provider into `generateTryOn()`, swap the page back to `<TryOnView>`, restore the nav tab and
stylist link.

## Outfit rules (`src/lib/outfits.ts`)

An outfit is **(one top + one bottom) or (one dress)**, plus **exactly one belt and one bag (required)**, and optionally
one shoes, one outerwear, and any number of accessories. A dress never combines with a top or bottom. Enforced when
sanitizing AI output (a look missing its belt or bag is dropped) and in `missingPieces()` / `canStyle()` /
`canStyleAround()`, which gate "Style me": a pool without a belt and a bag gets a 422 naming what's missing, and
mock mode returns no looks. This file — not the prompt — is the authority on what a valid look is.

Shoes, outerwear and accessories are optional for validity, but the stylist prompt asks for complete looks (shoes
when available, outerwear when it suits, accessories where they help) and states the belt + bag requirement. Only `MAX_STYLIST_ITEMS` (40) pieces go to the model. The route picks
them with `pickStylingPool()`: the anchor always, the other slots split across categories in proportion to their
size (at least one each), and within a category the **least recently offered** first (`items.last_offered_at`,
NULL = never; random tie-break). After a successful request `markOffered()` stamps the pool, so every piece of a
big wardrobe is offered within ~N/40 requests. Only the picked pieces' photos are loaded from disk.

## Categories and colours (`wardrobe.ts`, `db.ts`)

`CATEGORIES` (`top`, `bottom`, `dress`, `shoes`, `outerwear`, `belt`, `bag`, `accessories`) is closed: it's in the
`items.category` CHECK constraint and the outfit rules. `outerwear` is jackets/coats/blazers/cardigans; bags and
belts have their own categories (keyword guessing in `wardrobe.ts` and the tagging prompt route them there).
Widening it needs an in-place table-rebuild migration (see `migrateBeltBagCategories()`, which rebuilds with foreign
keys off so `collection_items` rows survive and keeps `last_offered_at`), since SQLite can't alter a CHECK. Colours are open: the `colours` table is seeded
from `COLOUR_WORDS`, and every upload/edit calls `repo.addColour()`; `GET /api/colours` feeds the dropdowns.

## Theming and dark mode (`globals.css`, `ThemeToggle.tsx`)

- Only semantic tokens from `@theme` (`bg-paper`, `text-ink`, `bg-card`, `text-muted`, `border-line`, `text-accent`);
  never raw hex or `bg-white`. `.dark { ... }` overrides the same properties, so tokenised UI themes for free.
- `ThemeToggle.tsx` toggles `dark` on `<html>`, persisted in `localStorage["theme"]`; an inline script in
  `layout.tsx` applies it before first paint. Keep `suppressHydrationWarning` on `<html>`.
- `--color-scrim` / `--color-scrim-foreground` are deliberately **not** overridden in `.dark` — for chrome that must
  stay dark in both themes (try-on viewfinder, upload dialog `::backdrop`). Using `ink`/`paper` there would invert.

## Security posture (intentional)

- scrypt passwords; only a SHA-256 hash of the session token is stored; cookie `httpOnly`, `SameSite=Lax`.
- `assertSameOrigin()` rejects cross-site state-changing requests (requests with no `Origin` header pass —
  non-browser clients don't send one).
- Uploads: magic-byte sniffing (client MIME never trusted), 10 MB cap, client-side re-encode strips EXIF/GPS.
- `storage.ts` throws if a resolved path escapes the uploads root.
- Every `repo.ts` query is scoped by `user_id`; there is no other access-control layer.

## Tests

- `tests/*.test.ts` (vitest): `outfits`, `ai`, `repo`, `security` run offline; `openrouter.live.test.ts` is a real
  paid call and only runs via `npm run test:live`.
- `scripts/e2e.mjs` needs a server on `AI_MOCK=true`; drives two users + an anonymous client over the full API
  (auth, uploads, tagging, stylist, try-on in mock mode, cross-account isolation, deletion). It is the source of
  truth for expected API behaviour — extend it when adding or changing a route.
