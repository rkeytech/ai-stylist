# Feature plan

This is the living roadmap for Atelier. It tracks what's shipped, what's in progress, what's planned, and
what's still just an idea — as a task list, so status is visible at a glance and changes over time.

## For AI agents working in this repo

**Read this file before starting any feature work**, alongside `CLAUDE.md` (current architecture) and, for the
mobile phase specifically, `docs/mobile-plan.md` (detailed step-by-step plan, written for an executing agent).
Use the three together:

- `CLAUDE.md` — how the app works *right now* (architecture, conventions, security posture).
- `docs/feature-plan.md` (this file) — *status*: what's done, in progress, planned, or still being discussed.
- `docs/mobile-plan.md` — a deep-dive plan for one specific future phase (mobile/Proxmox), referenced from the
  backlog below rather than duplicated here.

**Keep this file up to date as you work:**

- When you finish a feature (or a checklist item under one), check it off (`[x]`) and, if useful, add a one-line
  note of what actually shipped (especially if it differs from the plan).
- When you start non-trivial work on an item, move it into **In progress** so the next agent or the user can see
  what's live.
- When the user proposes a new feature, add it under **Backlog** (if it's ready to be worked on) or **Ideas /
  needs discussion** (if it's still being shaped) — don't start implementing straight from a one-line ask if the
  shape of the feature is still unclear; use the discussion section to capture open questions first.
- When the user says to drop, descope, or change a feature, edit or remove its entry rather than leaving stale
  items around. Prefer editing this file over creating new planning docs.
- If a task notes something as **needs discussion**, don't silently pick a design — surface the open question to
  the user (or, absent the user, record the trade-off you see rather than guessing silently).

Status markers used below: `[x]` done and shipped, `[~]` in progress, `[ ]` not started.

---

## Done

- [x] Auth — email/password signup + login, scrypt password hashing, httpOnly session cookie (`src/lib/session.ts`, `src/lib/password.ts`)
- [x] Wardrobe — upload clothing photos, AI auto-tagging (category + colour) via OpenRouter vision, edit/delete items
- [x] Wardrobe categories (closed set: top/bottom/dress/shoes/outerwear/accessories) + open-vocabulary colours with dropdown seeding
- [x] Stylist — "Style me" generates up to 3 AI outfit looks, validated against the outfit rules in `src/lib/outfits.ts`
- [x] OpenRouter integration for all AI calls (tagging + stylist), replacing the original Gemini-based tutorial app; includes model-fallback list and full offline mock mode (`AI_MOCK=true`)
- [x] Dark mode / semantic theming tokens (`globals.css`, `ThemeToggle.tsx`)
- [x] Upload hardening — magic-byte MIME sniffing, 10MB cap, client-side re-encode to strip EXIF/GPS
- [x] Per-user data isolation — every `repo.ts` query scoped by `user_id`; verified by `npm run test:e2e`'s privacy checks
- [x] Occasion-based styling — `POST /api/stylist` takes an optional JSON `{ occasion }` (free text, capped at 80 chars; no body = general styling). Passed to the model as quoted data in `suggestLooks(items, { occasion })`, stored in the nullable `looks.occasion` column (added by `migrateLookOccasion()` in `db.ts`), shown as chips + a text field on the Stylist page and labelled above the results. Mock mode ignores it. Later `collectionId` / `anchorItemId` should join this same body.
- [x] Collections — named, per-user sets of wardrobe items (many-to-many: `collections` + `collection_items`, cascade-deleted, names unique per user ignoring case). Routes `/api/collections` (GET/POST), `/api/collections/[id]` (GET/PATCH/DELETE), `/api/collections/[id]/items` (PUT, replaces membership; foreign/unknown item ids → 400). Collections nav tab, list/create page, detail page with rename/delete and tap-to-select item grid. `POST /api/stylist` accepts `collectionId` alongside `occasion` (404 if not the user's; 422 if the set can't form an outfit); the batch snapshots the collection name in `looks.collection_name` and the Stylist page has a "Draw from" picker (preselected via `/stylist?collection=<id>`).
- [x] Rebrand: "Styled" → "Atelier" — README, page titles/nav, `AuthForm.tsx` copy, OpenRouter `X-Title`; landed in the "changed to openrouter" commits (verified 2026-10-23: clean tree, typecheck + unit tests pass)

## In progress

*(nothing in progress)*

## Paused / disabled

- [ ] Try-On — live camera capture + AI-generated image of the user wearing a chosen look. Fully built
      (`TryOnView.tsx`, `/api/try-on*` routes, DB/storage persistence, mock-mode generation) but disabled because
      there's no image-generation provider wired up (`generateTryOn()` throws outside mock mode — see
      "Try-On is disabled" in `CLAUDE.md`). Re-enabling is: pick + wire an image-gen provider into
      `generateTryOn()`, swap `src/app/(app)/try-on/page.tsx` back to `<TryOnView>`, restore the nav tab in
      `SiteHeader.tsx` and the "Try this look on" link in `StylistView.tsx`.

## Backlog (scoped, ready to pick up)

- [ ] **Style around one item** — let the user pick a single wardrobe item and ask for 3 looks that all include
      it. Design sketch:
  - Same unified `POST /api/stylist` body gets an optional `anchorItemId`. `sanitizeLooks`/`mockLooks` in
    `outfits.ts` need an anchor-aware mode that drops/rejects any AI-suggested look missing that item id, and a
    mock-mode fallback that pins the anchor's category (or forces it into every look, for shoes/outerwear/
    accessories) instead of the current round-robin.
  - Entry point: a "Style around this" action on each item card in `WardrobeView.tsx`, linking to
    `/stylist?anchor=<id>` so the Stylist page can preselect it.
  - Store `anchor_item_id` alongside `occasion` on the `looks` row for the same "label what produced this batch"
    reason.
- [ ] Re-enable Try-On once an image-generation provider is chosen — **needs discussion**: which provider/model
      (OpenRouter image-gen support, or a separate API), and whether it's free-tier-viable like the rest of the
      AI stack or introduces real per-use cost.
- [ ] Mobile phase — see `docs/mobile-plan.md` for the full plan. Summary of sub-items (tracked in detail there,
      not duplicated here):
  - [ ] Bearer-token session auth alongside the existing cookie auth
  - [ ] `GET /api/auth/me` and `GET /api/health` endpoints
  - [ ] Login throttling
  - [ ] `ALLOWED_ORIGINS` env var for `assertSameOrigin()`
  - [ ] Dockerize the app (Proxmox LXC target)
  - [ ] Companion Flutter Android app
  - Note: `docs/mobile-plan.md` predates the OpenRouter migration and still references Gemini model names in
    places — treat its AI-provider specifics as stale, its API/auth/architecture plan as current.

## Ideas / needs discussion

*(nothing queued yet — add items here when a feature is proposed but not yet scoped)*
