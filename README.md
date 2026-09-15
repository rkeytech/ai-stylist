# Styled — your personal AI stylist

A recreation of the app built in Ania Kubów's video
[How to Build an AI Virtual Try On App: Live Camera + Vision Model](https://youtu.be/sN2kqWZhss8).
The video builds it in Lovable on Supabase. This version is a normal Next.js codebase that runs entirely
on your machine: a SQLite database, private file storage and OpenRouter for the AI.

> **Try-On is temporarily disabled.** It previously used a Gemini image model for the camera-based
> outfit generation; that's been removed and nothing has replaced it yet, so the tab and the "Try this
> look on" links are hidden. The camera flow, API routes and saved-try-on storage are still in the
> codebase (see `src/components/TryOnView.tsx`) and can be wired back up to an image-generation
> provider later.

## Features

| Video chapter | What's in this app |
| --- | --- |
| First prompt | Editorial "STYLED" design with two tabs: **Wardrobe** and **Stylist** (Try-On is temporarily disabled - see above) |
| Real authentication | Email and password sign-up (you're signed in straight away), sign-in and sign-out. Every item, look and photo is private to its account. |
| The Wardrobe | Upload a photo (from your phone camera or library). A vision model (via OpenRouter) detects the **category** and **main colour**, and names the item if you left the name blank. The grid has category filters (All · Top · Bottom · Dress · Shoes · Outerwear), an empty state and a Remove button. |
| The AI Stylist | **Style me** sends your wardrobe photos through OpenRouter, which returns up to **3 looks**. Each look is (top + bottom) or (dress), plus optional shoes and outerwear. A dress is never combined with a top or bottom, and only pieces you own are used. The model considers colour harmony and formality, and each look has a reason that names the actual colours and items. |
| Live Camera Try-On | *Temporarily disabled* - was a live camera view where you could pick a stylist look and generate yourself wearing the outfit. |
| Publish | Git repo ready to push to GitHub. See [Deploying](#deploying). |

Additions beyond the video:
- A **"Use a photo instead"** fallback when there's no camera.
- Downloading and deleting saved try-ons.
- An offline **mock AI mode** for testing without an API key.
- Server-side validation of every AI outfit, so a model mistake can't produce an invalid look.

## Quick start

Requirements: **Node.js 22.13+** (the app uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env.local   # then add your OPENROUTER_API_KEY
npm run dev
```

Open http://localhost:3000, create an account and upload a few pieces.

Get an OpenRouter API key at https://openrouter.ai/keys. If you plan to use `:free` models, also check
https://openrouter.ai/settings/privacy - some free models are only offered to accounts that allow routing
to providers that may train on prompts, and requests silently get "no providers available" until that's on.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | none | Required for the real AI features (auto-tagging, the stylist) |
| `OPENROUTER_VISION_MODELS` | `openrouter/free,openai/gpt-4.1-nano` | Auto-tagging and the stylist. A comma-separated, ordered list - the app tries each in turn and only moves on when one is busy, rate-limited, out of credits, or unavailable. |

> **Free vs paid OpenRouter models:** list the free (`:free`) models you want tried first, then any paid
> models you're willing to fall back to, cheapest first - a paid model only gets called if every model
> before it fails. Paid models need a small credit balance at https://openrouter.ai/credits. Browse
> current free and paid models with live pricing at https://openrouter.ai/models. For example:
> ```
> OPENROUTER_VISION_MODELS=openrouter/free,google/gemma-4-31b-it:free,openai/gpt-4.1-nano,google/gemini-2.5-flash-lite
> ```
| `AI_MOCK` | `false` | `true` simulates auto-tagging and the stylist offline: tags come from the item name and looks are rule-based |
| `DATA_DIR` | `./data` | Location of the SQLite database and uploaded photos |

Without a key and with mock mode off, the app still works for manual uploads (you choose the category and colour
yourself). The AI buttons then explain how to enable the AI.

## Using it on your phone

Browsers only allow camera access on `https://` or `localhost`. To test from a phone on your Wi-Fi, run the dev
server with a local certificate and open the https URL it prints, using your computer's IP:

```bash
npx next dev --experimental-https --hostname 0.0.0.0
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (outfit rules, AI output sanitising, auth hashing, per-user data isolation, mock AI) |
| `npm run test:e2e -- http://localhost:3000` | End-to-end API run against a server started with `AI_MOCK=true` |

## How it works

```
src/
  app/
    (app)/wardrobe | stylist | try-on   pages behind the sign-in check (try-on is a disabled placeholder)
    login, signup                       auth pages
    api/
      auth/{signup,login,logout}        session cookie auth
      items, items/[id]                 wardrobe CRUD (upload runs AI tagging)
      stylist                           "Style me" -> OpenRouter vision -> validated looks
      try-on, try-on/[id]               unused while Try-On is disabled (mock mode still exercises it)
      images/[kind]/[id]                serves private photos to their owner only
  components/                           WardrobeView, StylistView, TryOnView (currently unused), ...
  lib/
    ai.ts        OpenRouter calls (tagging, stylist) plus mock mode; try-on generation is disabled
    outfits.ts   outfit rules and sanitising of model output
    repo.ts      SQLite queries, every one scoped to the signed-in user
    session.ts   scrypt passwords, hashed session tokens, httpOnly cookies
    storage.ts   per-user photo storage outside /public
```

Security notes:
- Passwords are hashed with scrypt.
- Only a SHA-256 hash of each session token is stored.
- Cookies are `httpOnly` and `SameSite=Lax`, and state-changing requests from other origins are rejected.
- Uploads are checked by magic bytes (JPEG, PNG or WebP only, max 10 MB).
- Photos are re-encoded in the browser before upload, which strips EXIF data such as GPS location.

## Deploying

The app stores its database and photos on disk, so it needs a host with a **persistent volume**, for example
a VPS, Railway, Render or Fly.io with a mounted disk. Point `DATA_DIR` at that volume. Serverless platforms
with ephemeral filesystems (such as a default Vercel deployment) would lose data between requests unless you
swap `repo.ts` and `storage.ts` for a hosted database and object storage (for example Supabase, as in the video).
