# CLAUDE.md

Stylistas — a personal AI stylist app: one local Next.js process, SQLite (`node:sqlite`), private on-disk photo
storage, OpenRouter for AI. Features behind auth: **Wardrobe** (UI label **"Atelier"**; code keeps "wardrobe":
`/wardrobe`, `WardrobeView`, `items`), **Collections** (named item sets), **Stylist** ("Style me" → up to 3 looks,
optionally per occasion / collection / anchor item). **Try-On is disabled** (no image provider) — see
`docs/architecture.md`.

## Commands

```bash
npm install && cp .env.example .env.local   # set OPENROUTER_API_KEY, or AI_MOCK=true
npm run dev                                 # Turbopack dev server
npm run build && npm start
npm run typecheck                           # tsc --noEmit
npm test                                    # vitest, offline
npm test -- tests/outfits.test.ts           # one file; add -t "name" to filter
npm run test:e2e -- http://localhost:3000   # needs a server running with AI_MOCK=true
npm run test:live                           # ONE REAL OpenRouter call, costs quota — never run unprompted
```

Node 22.13+ required. Dev machine is Windows/PowerShell. Only one app instance per `DATA_DIR`.

## Docs map — read before touching the area

- `docs/feature-plan.md` — project status/roadmap. **Read before any feature work and keep it current** (check off
  done items, move started work to "In progress", file new asks under Backlog or "Ideas / needs discussion"; edit
  stale entries rather than creating new planning docs). Source of truth for status.
- `docs/architecture.md` — file map, AI pipeline, stylist API, outfit rules, categories/colours, theming, security,
  tests, try-on re-enable steps. Source of truth for how the code works (code wins on conflict).
- `docs/mobile-plan.md` — untracked plan for a future mobile phase (bearer auth, Docker, Flutter). Not implemented.

## How to work

1. **Orient first**: read `docs/feature-plan.md` and the relevant architecture section; read the surrounding code
   and match its naming, comment density, and idioms. Don't start from a vague one-liner — if the feature's shape is
   unclear, record open questions under "Ideas / needs discussion" and ask the user.
2. **Verify before saying done**: `npm run typecheck` and `npm test` must pass. For API/route changes also run
   `npm run test:e2e` against an `AI_MOCK=true` server and extend `scripts/e2e.mjs`. For UI changes, run the app
   and look at it in both light and dark themes. If you couldn't verify something, say so.
3. **Test logic you add**: new rules, sanitizers, or queries get a vitest case in `tests/` (`outfits`, `ai`, `repo`,
   `security`). Fix bugs with a failing test first where practical.
4. **Develop in mock mode** (`AI_MOCK=true`). Never call live OpenRouter just to check work; never print, log, or
   commit `OPENROUTER_API_KEY`, `.env*`, or anything in `data/`.
5. **Keep changes small and in scope**: no drive-by refactors, no new dependencies without asking (the app is
   deliberately SDK-free and driver-free), no new planning docs.
6. **Git**: commit only when asked; conventional-style messages (`feat:`, `fix:`, `refactor:`, `redesign:`); never
   commit `.env*`, `data/`, or `.claude/`. **Work on the current branch in this checkout — never create git
   worktrees or extra branches** (`EnterWorktree`, `git worktree add`, `isolation: "worktree"`), even in background
   or parallel sessions, unless the user explicitly asks.
7. **Update docs with code**: change behaviour → update `docs/architecture.md` (and `feature-plan.md`) in the same
   change. Keep this file short — it is loaded every session; put detail in `docs/`.

## Hard rules (don't break these)

- **Privacy**: every `repo.ts` query must be scoped by `user_id` — it is the only access-control layer. Add an
  e2e/repo test for cross-user isolation with any new data path.
- **Routes**: wrap in `handle()`, `assertSameOrigin()` on state-changing requests, then `requireUser()`. Throw
  `HttpError`/`AiError`; don't `try/catch` just to format errors.
- **Model output is untrusted**: always sanitize (`sanitizeLooks()`, `tagItem` fallbacks). User text (e.g.
  occasion) goes into prompts JSON-quoted as data. New OpenRouter calls use `withModelFallback()` — no retries.
- **Outfit validity** lives in `src/lib/outfits.ts` (one top + one bottom, or one dress; **exactly one belt
  and one bag**; ≤1 shoes, ≤1 outerwear; any accessories) — not in prompts.
- **Categories are a closed set** (CHECK constraint); widening needs a table-rebuild migration in `db.ts`. Schema
  changes must be idempotent migrations that keep existing databases working.
- **Uploads**: sniff magic bytes (`image-mime.ts`), never trust client MIME; paths go through `storage.ts`.
- **UI**: semantic Tailwind tokens only (`bg-paper`, `text-ink`, `bg-card`, `text-muted`, `border-line`,
  `text-accent`) — no raw hex or `bg-white`. Keep `suppressHydrationWarning` on `<html>`. `scrim` tokens are for
  chrome that stays dark in both themes. UI label is "Atelier", code says "wardrobe".

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
