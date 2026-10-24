# Feature plan

This is the living roadmap for Stylistas. It tracks what's shipped, what's in progress, what's planned, and
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
- [x] Collections — named, per-user sets of wardrobe items (many-to-many: `collections` + `collection_items`, cascade-deleted, names unique per user ignoring case). Routes `/api/collections` (GET/POST), `/api/collections/[id]` (GET/PATCH/DELETE), `/api/collections/[id]/items` (PUT, replaces membership; foreign/unknown item ids → 400). Collections nav tab, list/create page, detail page with rename/delete and member management (see the next entry). `POST /api/stylist` accepts `collectionId` alongside `occasion` (404 if not the user's; 422 if the set can't form an outfit); the batch snapshots the collection name in `looks.collection_name` and the Stylist page has a "Draw from" picker (preselected via `/stylist?collection=<id>`).
- [x] Collection detail shows only its members — `CollectionView.tsx` lists just the collection's pieces, each with
      a **Remove** link that saves immediately. **"Add pieces"** opens a modal `<dialog>` picker of the wardrobe items
      not yet in the collection (tap to select, then "Add N pieces"; closing discards the selection). Empty
      collections show an "Add pieces" empty state. Both actions still save the whole list via
      `PUT /api/collections/[id]/items` — no API change.
- [x] Style around one item — "Style around this" on each wardrobe card links to `/stylist?anchor=<id>`; the Stylist page shows a "Styling around" strip (clearable) and rings the anchor in every look. `POST /api/stylist` takes `anchorItemId` (404 if not the user's, 400 if not a string, 422 via `canStyleAround()` when the pool can't dress it). Shipped differently from the sketch: the anchor joins the chosen collection's pool even if it isn't a member, and `looks.anchor_item_id` stores the id (safe — deleting an item already deletes looks containing it). The anchor is placed first in the model request so the 40-item cap never drops it. Not added: a "Style around" link on collection detail tiles (now feasible, since those tiles are plain member cards rather than tap-to-select buttons).
- [x] Stylist tab redesign ("The Studio") — 3 static directions were mocked up (private claude.ai design canvas;
      sources in the git-ignored `.scratch/stylist-canvas/`); the user picked B. `StylistView.tsx` is now a
      bordered "brief" panel (i Style around, ii Draw from as a radio list of whole wardrobe + collections with
      counts, iii Occasion) beside a grid of look cards (2×2 piece tiles with the anchor ringed and first, "+N"
      for extras, title, reason, piece tags). On phones the brief collapses to a one-line summary after styling.
      Empty state shows dashed Look 01–03 placeholders; loading shows skeleton cards; "can't style" messages sit
      inside the brief (under Draw from when a collection is the problem, with a "use the whole wardrobe" action).
      No API change. Intro text under the Stylist title was dropped. Errors still use the accent colour — the
      mockups' rust warning colour was not added as a token. App max width widened `max-w-6xl` → `max-w-7xl`
      (layout + header) so the three cards fit in one row beside the brief on desktop.
- [x] Look details modal — clicking a Stylist look card (a stretched title button covers the card) opens a
      native `<dialog>` showing the full look: title, occasion/collection/piece count, reason, and every piece
      (photo, name, category, the anchor marked "Styled around"), with Previous/Next look buttons. Closes on ×,
      Esc or a backdrop click. Client-only, no API change — cards still show at most 4 tiles with "+N".
- [x] Rebrand: "Styled" → "Atelier" — README, page titles/nav, `AuthForm.tsx` copy, OpenRouter `X-Title`; landed in the "changed to openrouter" commits (verified 2026-10-23: clean tree, typecheck + unit tests pass)

- [x] Rebrand + copy cleanup:
  - [x] "Atelier" → **"Stylistas"** — masthead/auth wordmarks, page titles, `AuthForm.tsx` copy, OpenRouter
        `X-Title`, README, `package.json` name/description, `CLAUDE.md`, this file, and the e2e masthead check.
        Internal identifiers deliberately kept: the `styled_session` cookie and `styled.db` (renaming them would
        sign everyone out / orphan the database) and the `styled-*` image download filename.
  - [x] **Wardrobe** section → **"Atelier"** — nav label, page title/heading, and every UI sentence that names the
        section ("Whole Atelier", "Add to Atelier", "Go to Atelier"...). `/wardrobe`, `WardrobeView`, `items`
        API/DB names unchanged.
  - [x] Removed the descriptive `intro` text under the Collections and Try-On page titles (Stylist's was already
        gone, Wardrobe had none). Kept: the collection detail's piece count, empty states, and status messages.
  - [x] Removed the decorative editorial labels: page eyebrows ("The Archive", "The Column", "The Edit", "The
        Fitting Room", "Collection" — `PageHeading` no longer takes an `eyebrow`), "Private Edition" in the top bar,
        the "Wardrobe, considered" tagline (masthead + auth), "The brief" in the Stylist panel (the phone toggle
        now just shows the summary), the auth "New here"/"Welcome back" eyebrows, and "archive" wording ("Open
        your archive" → "Create an account"). Functional labels (form fields, "Look 01", "Saved try-ons",
        the i/ii/iii brief step numerals) were kept.

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
- [ ] **Overcoat** clothing category — a new seventh category for jackets, blazers, coats, etc., worn over a top
      or a dress. Decided:
  - `outerwear` stays as a separate category, now meaning **bags, scarves and similar**; `accessories` means
    jewellery-type pieces (earrings, rings, necklaces, etc.). This matches how the user already tags items.
  - Outfit rules (`outfits.ts`): at most **one overcoat** per look; a look may have both an overcoat and outerwear.
    Outerwear becomes **uncapped** like accessories (e.g. a bag and a scarf in one look) — drop its one-per-look
    limit in `outfits.ts`/`sanitizeLooks()`; shoes and overcoat stay capped at one.
  - No data migration of existing items needed: the user's `outerwear` items today are only two bags.
  - Implementation: widen the `items.category` CHECK constraint with another table-rebuild migration (like
    `migrateAccessoriesCategory()` in `db.ts`); add `overcoat` to `CATEGORIES`; update keyword guessing in
    `wardrobe.ts` (jacket/blazer/coat → overcoat; **move** bag/handbag/purse/scarf out of the accessories regex
    at `wardrobe.ts:82` into outerwear); rewrite the category definitions in the AI tagging + stylist prompts
    (`ai.ts:170` and `:208` currently call bags and scarves accessories); update `mockLooks()`, `canStyle()`,
    UI category labels, the outfit-rule description in `CLAUDE.md`, and tests.

## Ideas / needs discussion

*(nothing queued yet — add items here when a feature is proposed but not yet scoped)*
