# Plan: Styled backend on Proxmox + Flutter Android app

**Audience:** an AI coding agent working in this repository (`C:\Users\Timos\Documents\ai-stylist`, Windows, PowerShell)
together with the owner, who does the steps marked **HUMAN**.
**Goal:** run the existing Next.js app as the backend in a container on a Proxmox mini PC, and build a Flutter
Android app that uses it from home Wi-Fi and from mobile data.

---

## 1. Target architecture

```
Android phone ── Flutter app "Styled"
   │  HTTPS  https://styled.<tailnet>.ts.net   (Tailscale app on the phone; works on Wi-Fi and mobile data)
   │  (dev only: http://<LXC-LAN-IP>:3000, allowed in debug builds only)
   ▼
Proxmox mini PC
 └─ LXC "styled"  (Debian 13, unprivileged, features: nesting=1, keyctl=1)
     └─ Docker Compose project "styled"
         ├─ tailscale   tailscale/tailscale:stable, userspace mode, `serve` :443 → 127.0.0.1:3000
         └─ api         this repo, Next.js standalone on Node 24, port 3000, volume styled-data:/data
                         └─ outbound HTTPS → Gemini API
```

The web UI stays available at the same URLs, which is useful for admin work and testing.

## 2. Decisions (defaults already chosen)

| # | Decision | Default | Change it if… |
|---|---|---|---|
| D1 | Container runtime | Docker Engine + Compose inside an unprivileged Debian 13 LXC | Docker won't run in the LXC. Use a small Debian 13 VM with the same steps. |
| D2 | Remote access | Tailscale sidecar with automatic HTTPS (`tailscale serve`) | LAN-only is enough. Skip milestone B and use a debug build pointed at the LAN IP. |
| D3 | Mobile auth | Bearer session tokens stored in the existing `sessions` table | — |
| D4 | Mobile platform | Android only (iOS builds need macOS) | — |
| D5 | Flutter stack | `go_router`, `flutter_riverpod`, `dio`, `flutter_secure_storage`, `camera`, `image_picker`, `flutter_image_compress`, `cached_network_image`, `permission_handler`, `google_fonts` | — |
| D6 | Code shipping | `git archive HEAD` → `scp` → build the image on the LXC (no registry, no GitHub needed) | A private Git remote is added later. |
| D7 | AI costs during development | `AI_MOCK=true` everywhere until the phase 5 acceptance run | — |

## 3. Rules for the executing agent

1. **Secrets:** never print, log or commit secrets (`GEMINI_API_KEY`, `TS_AUTHKEY`, session tokens). A HUMAN types
   secrets into `/opt/styled/config/.env`. Never read that file back.
2. **Licenses:** never accept license or terms prompts for the owner (`flutter doctor --android-licenses`, SDK
   installers). Stop and ask the HUMAN.
3. **Keep the web app green:** after every backend change run `npm run typecheck`, `npm test`, `npm run build`, and
   `node scripts/e2e.mjs <url>` against an `AI_MOCK=true` server.
4. **Match existing patterns:**
   - Route handlers are wrapped in `handle()` and throw `HttpError`/`AiError` (`src/lib/http.ts`).
   - Every query is scoped by `user_id` (`src/lib/repo.ts`).
   - Client code parses `{ error }` responses.
5. **Commits:** commit after each task, one logical change per commit. If git has no `user.name`/`user.email`, ask the
   HUMAN. Don't set them yourself.
6. **Stop and ask when:**
   - a precondition is missing (SSH access, LXC IP, tailnet domain), or
   - an acceptance check still fails after two fix attempts, or
   - a step would need a paid plan, an account, or a license acceptance.
7. **Parallel tracks:** Track B (phase 4) may start as soon as phase 1 is merged. It develops against a local mock
   server and doesn't wait for Proxmox.

```
HUMAN H1–H6 ─────────────────────────────┐ (start immediately, in parallel)
Track A: P0 → P1 → P2 → P3 (A: LAN mock → B: Tailscale) ──┐
                  └──► Track B: P4 (Flutter, against local mock) ──┴──► P5 acceptance on phone
```

## 4. Ground truth about the current codebase (don't re-discover)

- **Stack:** Next.js 16.3 (App Router, Turbopack), React 19, TypeScript 6, Tailwind 4, Vitest 5, Node ≥ 22.13
  (uses built-in `node:sqlite`), `@google/genai` 2.x.
- **Data:** SQLite at `$DATA_DIR/styled.db` and photos under `$DATA_DIR/uploads/<userId>/`. The default is `./data`.
  Only one app instance may write, so run **exactly one** `api` replica.
- **Auth today:**
  - Sign-up and sign-in set an httpOnly cookie `styled_session`. The DB stores SHA-256 hashes of session tokens
    (`src/lib/session.ts`).
  - Pages check sign-in in `src/app/(app)/layout.tsx`.
  - `assertSameOrigin` rejects cross-origin POST/PATCH/DELETE. Requests *without* an `Origin` header are allowed,
    and native apps don't send one.
- **AI** (`src/lib/ai.ts`):
  - Vision uses `gemini-3.1-flash-lite` with fallback `gemini-3.6-flash` (both work on free keys).
  - Image generation uses `gemini-3.1-flash-image` with fallback `gemini-3.1-flash-lite-image`. These models return
    `429 quota` on free keys, so try-on needs billing enabled.
  - SDK retries are disabled on purpose. An overloaded model can take **20–120 s** to return 503, so clients need long
    timeouts.
  - `aiMode()` returns `"live" | "mock" | "unconfigured"`.
- **Tests and scripts:**
  - `npm test`: unit tests. `tests/gemini.live.test.ts` is skipped unless you run `npm run test:live`, which makes
    one real API call.
  - `node scripts/e2e.mjs <baseUrl>`: 47 API checks. Needs `AI_MOCK=true` on the server.
- **Build notes:**
  - `next/font/google` downloads fonts at **build** time, so the build machine needs internet.
  - There is no `public/` folder.
- **Design tokens** (from `src/app/globals.css`):

  | Token | Value |
  |---|---|
  | paper | `#f5f0e8` |
  | card | `#ebe4d8` |
  | ink | `#1c1b19` |
  | muted | `#776f63` |
  | line | `#d6ccbd` |
  | accent | `#8a3b2e` |

  Fonts are Cormorant Garamond (italic display headings, wordmark "STYLED" with wide letter spacing) and Jost
  (small uppercase labels with ~0.25em tracking).

### 4.1 API contract (the source of truth for the Flutter app; keep `docs/api.md` in sync)

Request bodies are JSON unless marked *multipart*. Errors always return `{ "error": string }`. Image URLs in responses
are **relative** (`/api/images/...`), so clients must prefix the base URL.

| Method & path | Auth | Request | Success response | Notable errors |
|---|---|---|---|---|
| `POST /api/auth/signup` | — | `{email, password}` (password ≥ 8 chars) | `201 {user}` (+ `token`, `expiresAt` for mobile, see P1) | 400 invalid, 409 exists, 403 sign-ups closed (P1) |
| `POST /api/auth/login` | — | `{email, password}` | `200 {user}` (+ `token`, `expiresAt` for mobile) | 400, 401 wrong credentials, 429 too many attempts (P1) |
| `POST /api/auth/logout` | yes | — | `{ok:true}` | — |
| `GET /api/auth/me` *(new, P1)* | yes | — | `{user, aiMode}` | 401 |
| `GET /api/health` *(new, P1)* | — | — | `{ok:true, aiMode}` | — |
| `GET /api/items` | yes | — | `{items: WardrobeItem[]}`, newest first | 401 |
| `POST /api/items` | yes | *multipart*: `image` (JPEG/PNG/WebP ≤ 10 MB), `name`, `category` (`auto` or a category), `colour` | `201 {item}` | 400 no photo, 413 too large, 415 not an image, 422 AI unsure, 429/503 AI quota/overload |
| `DELETE /api/items/{id}` | yes | — | `{ok:true}` (also deletes looks that used it) | 404 |
| `GET /api/images/{item\|tryon}/{id}[?download=1]` | yes | — | image bytes | 404 |
| `GET /api/stylist` | yes | — | `{looks: Look[]}` | — |
| `POST /api/stylist` | yes | — | `{looks: Look[]}` (1–3 looks, replaces the previous set) | 422 needs top+bottom or dress, 429/502/503 AI |
| `GET /api/try-on` | yes | — | `{tryOns: TryOnResult[]}` (saved only) | — |
| `POST /api/try-on` | yes | *multipart*: `photo`, `lookId`, `aspectRatio` (`1:1`,`3:4`,`4:3`,`9:16`,`16:9`) | `201 {tryOn}` (unsaved; replaces the previous unsaved result) | 400 no look, 409 look's pieces removed, 429 no image quota, 503 overloaded |
| `PATCH /api/try-on/{id}` | yes | — | `{tryOn}` with `saved:true` | 404 |
| `DELETE /api/try-on/{id}` | yes | — | `{ok:true}` | 404 |

Types:
```ts
type Category = "top" | "bottom" | "dress" | "shoes" | "outerwear";
interface User { id: string; email: string }
interface WardrobeItem { id: string; name: string; category: Category; colour: string; imageUrl: string; createdAt: number }
interface Look { id: string; title: string; reason: string; itemIds: string[]; createdAt: number }
interface TryOnResult { id: string; lookId: string | null; lookTitle: string; imageUrl: string; saved: boolean; createdAt: number }
type AiMode = "live" | "mock" | "unconfigured";
```
Outfit rules, which the server enforces: (top + bottom) **or** dress, plus at most one pair of shoes and one outerwear
piece, and never a dress combined with a top or bottom.

---

## 5. HUMAN prerequisites (start these right away, in parallel with P0–P2)

- **H1 Gemini.** The key already works for vision. *Optional:* enable billing on the Google AI Studio project so try-on
  works.
- **H2 Proxmox LXC.** In the Proxmox shell:
  ```bash
  pveam update && pveam available --section system | grep debian-13
  pveam download local <debian-13-standard template name from the list>
  pct create 120 local:vztmpl/<template file> --hostname styled --cores 2 --memory 4096 --swap 2048 \
    --rootfs local-lvm:20 --net0 name=eth0,bridge=vmbr0,ip=dhcp --unprivileged 1 \
    --features nesting=1,keyctl=1 --onboot 1
  pct start 120
  ```
  Then:
  - Reserve the LXC's IP in your router.
  - Create a sudo user with SSH key login for the agent's Windows user.
  - Test from Windows with `ssh <user>@<LXC-IP>`.
  - Add a `Host styled` entry in `%USERPROFILE%\.ssh\config`.
  - Tell the agent the host alias and IP.

  4 GB RAM is for the Next.js build; the running app needs far less.
- **H3 Tailscale.**
  1. Create a free account.
  2. In the admin console DNS page, enable **MagicDNS** and **HTTPS Certificates**.
  3. Generate an **auth key** for the server.
  4. Install the Tailscale app on the Android phone (and optionally on the Windows PC) and sign in to the same tailnet.
  5. Note the tailnet domain (`<tailnet>.ts.net`).
- **H4 Android phone.** Enable Developer options with USB debugging (or Wireless debugging) and connect it to the PC.
- **H5 Windows toolchain** (the agent may run the installers only with the owner's OK):
  - Install Android Studio (Android SDK, Platform-Tools, Command-line Tools) and the Flutter SDK (stable).
  - Add both to `PATH`.
  - The HUMAN runs `flutter doctor --android-licenses` and accepts the licenses.
  - `flutter doctor` must show Android toolchain ✓.
- **H6 Secrets on the server.** After P3.2, run `ssh styled`, then `nano /opt/styled/config/.env`, and fill in
  `GEMINI_API_KEY` (and `TS_AUTHKEY` for milestone B). Then `chmod 600` the file.

---

## 6. Phases

Each task lists **what to do** and **acceptance** checks. Acceptance must pass before moving on.

### P0 — Baseline (Track A)
- **P0.1** Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. Commit any pending work (ask for git identity if
  it's missing).
  **Acceptance:** all commands succeed and the working tree is clean.

### P1 — Mobile-ready API (Track A; no infrastructure needed)
- **P1.1 Bearer tokens.** In `src/lib/session.ts`:
  - `getSessionUser()` first reads `Authorization: Bearer <token>` via `await headers()` from `next/headers`, then
    falls back to the cookie. Hash with the existing `hashToken`.
  - `startSession(userId, { secure, setCookie })` returns `{ token, expiresAt }` and sets the cookie only when
    `setCookie` is true.
  - `endSession()` deletes the bearer or the cookie session, whichever is present.
- **P1.2 Mobile login and sign-up.** If the request header `X-Client: styled-mobile` is present:
  - don't set a cookie, and
  - respond with `{ user, token, expiresAt }` (`expiresAt` is an ISO string).

  Browser responses stay exactly as they are today.
- **P1.3 New endpoints.** Add `GET /api/auth/me` returning `{ user, aiMode }` (401 if signed out) and `GET /api/health`
  returning `{ ok: true, aiMode }` (no auth; nothing else exposed).
- **P1.4 Sign-up switch.** When env `ALLOW_SIGNUP=false`, `POST /api/auth/signup` returns `403 "Sign-ups are closed."`.
  The default is allowed.
- **P1.5 Login throttling.** Add a small in-memory limiter module (a pure function plus a `Map`):
  - Allow at most 10 failed attempts per `(client IP, email)` in 15 minutes, then return `429 "Too many attempts. Try again later."`.
  - Client IP is the first entry of `x-forwarded-for`, otherwise `"unknown"`.
  - Clear the counter on a successful login.
- **P1.6 Origins behind a proxy.** `assertSameOrigin` also accepts origins listed in env `ALLOWED_ORIGINS`
  (comma-separated, e.g. `https://styled.<tailnet>.ts.net`). A proxy may rewrite `Host`, which would otherwise make
  the web UI get 403 over Tailscale.
- **P1.7 Tests.**
  - Unit tests: the limiter, `ALLOWED_ORIGINS` parsing, and bearer lookup (repo level).
  - Extend `scripts/e2e.mjs` with a "mobile client" section that:
    - signs in with `X-Client` and gets a token without a `Set-Cookie` header,
    - uses `Authorization: Bearer` for items, images, stylist and try-on,
    - checks `/api/auth/me` and `/api/health`,
    - logs out and confirms the token then returns 401,
    - confirms 11 wrong passwords give 429.
- **P1.8 Docs.** Write `docs/api.md` from section 4.1 including the new fields, and add the new env vars to the README
  table and `.env.example`.

**Acceptance:** typecheck, unit tests and build pass. Run the build locally with `AI_MOCK=true` and a scratch
`DATA_DIR`, e.g. `node --env-file=<mock.env> node_modules/next/dist/bin/next start -p 3100`. Then
`node scripts/e2e.mjs http://localhost:3100` must report all checks passing, old and new.

### P2 — Containerize (Track A)
- **P2.1** In `next.config.ts` add `output: "standalone"` (keep `outputFileTracingRoot`).
- **P2.2** `Dockerfile` at the repo root, multi-stage on `node:24-slim`:
  - **deps:** `npm ci`.
  - **build:** copy the source, `ENV NEXT_TELEMETRY_DISABLED=1`, `npm run build`.
  - **runner:**
    - `ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data`.
    - Copy `.next/standalone` to `./` and `.next/static` to `./.next/static`, both `--chown=node:node`.
    - `mkdir /data && chown node:node /data`, `USER node`, `EXPOSE 3000`.
    - `HEALTHCHECK` with `node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`.
    - `CMD ["node","server.js"]`.
- **P2.3** `.dockerignore` lists: `node_modules`, `.next`, `data`, `.env*` (but `!.env.example`), `.git`, `.claude`,
  `tests`, `scripts`, `mobile`, `docs`.
- **P2.4** Deployment files in `deploy/`:
  - `compose.yaml`:
    - top-level `name: styled`;
    - service `api` with `build: { context: .., dockerfile: Dockerfile }` and `image: styled-api:${STYLED_VERSION:-latest}`;
    - `ports: ["3000:3000"]`, `restart: unless-stopped`;
    - `environment` interpolated from the env file: `GEMINI_API_KEY`, `AI_MOCK`, `ALLOW_SIGNUP`, `ALLOWED_ORIGINS`,
      `GEMINI_*_MODEL`, and `DATA_DIR: /data`;
    - named volume `styled-data:/data`.
  - `compose.tailscale.yaml` (override):
    - adds service `tailscale` (`tailscale/tailscale:stable`, `hostname: styled`, `restart: unless-stopped`);
    - its env: `TS_AUTHKEY=${TS_AUTHKEY}`, `TS_HOSTNAME=styled`, `TS_STATE_DIR=/var/lib/tailscale`,
      `TS_AUTH_ONCE=true`, `TS_USERSPACE=true`, `TS_SERVE_CONFIG=/config/serve.json`;
    - volumes `tailscale-state:/var/lib/tailscale` and `./tailscale:/config` (bind-mount the **directory**, not the file);
    - `ports: ["3000:3000"]` (LAN access keeps working);
    - changes `api` to `network_mode: service:tailscale` with `ports: !reset []` (Compose forbids ports on a service
      sharing another service's network), plus `depends_on: [tailscale]`.
  - `tailscale/serve.json`:
    ```json
    {
      "TCP": { "443": { "HTTPS": true } },
      "Web": { "${TS_CERT_DOMAIN}:443": { "Handlers": { "/": { "Proxy": "http://127.0.0.1:3000" } } } }
    }
    ```
    If Tailscale rejects this format, remove `TS_SERVE_CONFIG`, run `docker compose exec tailscale tailscale serve --bg 3000`
    once (it persists in the state volume), and record the working config from `tailscale serve status --json`.
  - `.env.example` with placeholder keys only: `GEMINI_API_KEY=`, `AI_MOCK=true`, `ALLOW_SIGNUP=true`,
    `ALLOWED_ORIGINS=`, `TS_AUTHKEY=`.
  - `deploy.ps1` (run from Windows), params `-SshHost styled`, `-Tailscale` switch. Steps:
    1. `$v = git rev-parse --short HEAD`.
    2. `git archive --format=tar.gz -o $env:TEMP\styled-$v.tar.gz HEAD`.
    3. `scp` the archive to `styled:/tmp/`.
    4. Over `ssh`: `set -e`, replace `/opt/styled/src` with the extracted archive, `cd /opt/styled/src/deploy`, then
       `STYLED_VERSION=$v docker compose --env-file /opt/styled/config/.env -f compose.yaml [-f compose.tailscale.yaml] up -d --build`.
    5. Print `docker compose ps`.

    Rollback is re-running `up -d` with `STYLED_VERSION=<previous sha>`, since older images stay local.
  - `backup.sh` (runs on the LXC):
    - nightly `docker compose exec -T api node -e "new (require('node:sqlite').DatabaseSync)('/data/styled.db').exec(\"VACUUM INTO '/data/backup-tmp.db'\")"`;
    - tar `/data/backup-tmp.db` plus `/data/uploads` out of the volume into `/opt/styled/backups/styled-<date>.tar.gz`;
    - delete the temporary DB and keep 14 days of backups.
- **P2.5 Local check without Docker** (Docker isn't installed on the PC):
  - after `npm run build`, copy `.next/static` into `.next/standalone/.next/static`;
  - run `node .next/standalone/server.js` with `PORT=3100`, `AI_MOCK=true` and a scratch `DATA_DIR`;
  - run e2e against it.

**Acceptance:** `.next/standalone/server.js` exists, and e2e passes against the standalone server.

### P3 — Deploy to the LXC (Track A; needs H2, later H3 and H6)
- **P3.1 Install Docker Engine** on Debian 13 from Docker's official apt repository:
  - Packages: `docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`.
  - Add the SSH user to the `docker` group.
  - `sudo mkdir -p /opt/styled/{src,config,backups}` and `chown` it to that user.

  **Acceptance:** `docker run --rm hello-world` works. If it fails inside the LXC:
  1. check `nesting=1,keyctl=1` (`pct config 120` on the host);
  2. retry after `pct reboot 120`;
  3. otherwise stop and suggest the VM alternative (D1).
- **P3.2 Server env file.** Copy `deploy/.env.example` to `/opt/styled/config/.env` with `AI_MOCK=true`. The HUMAN (H6)
  adds `GEMINI_API_KEY` later.
- **P3.3 Milestone A: LAN with mock AI.** Run `deploy.ps1` without `-Tailscale`.
  **Acceptance:**
  - `docker compose ps` shows `api` healthy;
  - `node scripts/e2e.mjs http://<LXC-IP>:3000` passes everything;
  - the data survives `docker compose restart api` (sign in again with a user created earlier).
- **P3.4 Real AI.**
  1. The HUMAN sets `GEMINI_API_KEY` and `AI_MOCK=false`.
  2. Redeploy.
  3. Upload one real photo in the web UI at `http://<LXC-IP>:3000`.

  **Acceptance:** the item gets a category and colour. Try-on either works (billing on) or shows the "enable billing"
  message.
- **P3.5 Milestone B: Tailscale.**
  1. The HUMAN adds `TS_AUTHKEY` and sets `ALLOWED_ORIGINS=https://styled.<tailnet>.ts.net`.
  2. `deploy.ps1 -Tailscale`.

  **Acceptance:**
  - `docker compose exec tailscale tailscale serve status` shows HTTPS → `127.0.0.1:3000`;
  - from a tailnet device, `https://styled.<tailnet>.ts.net/api/health` returns `{ok:true,…}` with a valid certificate
    (the first request can take ~1 minute while the cert is issued);
  - web sign-in and upload work over that URL (no 403);
  - the LAN URL still works.
- **P3.6 Operations.**
  - Install a cron entry for `backup.sh` (03:30 daily).
  - The HUMAN adds the LXC to a Proxmox backup job (Datacenter → Backup).
  - After the owner has created their account, set `ALLOW_SIGNUP=false` and redeploy.

  **Acceptance:** one backup archive exists, and it contains `backup-tmp.db` plus `uploads/`.

### P4 — Flutter Android app (Track B; starts after P1 is merged and needs H5)
Develop against the local mock server from P1 (`http://<PC-LAN-IP>:3100`, reachable from the phone on the same Wi-Fi; allow Node through the Windows firewall if asked).

- **P4.1 Scaffold.**
  - `flutter create --org com.styled --project-name styled --platforms android mobile`.
  - Set `minSdk = 24` in `mobile/android/app/build.gradle(.kts)`.
  - Add packages with `flutter pub add` (latest compatible versions; don't pin by hand): `go_router`,
    `flutter_riverpod`, `dio`, `flutter_secure_storage`, `camera`, `image_picker`, `flutter_image_compress`,
    `cached_network_image`, `permission_handler`, `google_fonts`. Dev dependency: `http_mock_adapter`.
- **P4.2 Android config.**
  - `src/main/AndroidManifest.xml` declares the `INTERNET` and `CAMERA` permissions.
  - Put `android:usesCleartextTraffic="true"` **only** in `src/debug/AndroidManifest.xml`, so release builds are HTTPS-only.
- **P4.3 Configuration.**
  - The base URL comes from `--dart-define=API_BASE_URL=…`.
  - A Settings screen can override it (stored in secure storage) and test it via `GET /api/health`.
  - Switching between LAN and Tailscale must not need a rebuild.
- **P4.4 Structure** (`mobile/lib/`):
  ```
  main.dart · app.dart (MaterialApp.router, theme, go_router with auth redirect)
  core/  config.dart · token_store.dart · api_client.dart · api_exception.dart · theme.dart
  models/  user.dart · wardrobe_item.dart · look.dart · try_on_result.dart   (fromJson; categories as enum)
  data/  auth_repository.dart · wardrobe_repository.dart · stylist_repository.dart · try_on_repository.dart
  features/  auth/ · wardrobe/ · stylist/ · try_on/ · settings/
  shared/widgets/  page_heading.dart · error_note.dart · look_pieces.dart · authed_image.dart · ai_notice.dart
  ```
- **P4.5 API client rules.**
  - Send `X-Client: styled-mobile` on sign-in and sign-up, and save `token` in `flutter_secure_storage`.
  - Send `Authorization: Bearer` on every other call, including images (`CachedNetworkImage(httpHeaders: …)`).
  - A 401 clears the token and redirects to sign-in.
  - Map `{error}` to `ApiException(message, status)` and show `message` to the user as-is.
  - Timeouts: connect 10 s, receive 30 s by default, **150 s** for `POST /api/items`, `POST /api/stylist` and
    `POST /api/try-on`.
  - Resolve relative `imageUrl` values against the base URL.
- **P4.6 Screens** (match the web behaviour):
  - **Sign in / sign up:** email and password (≥ 8 characters on sign-up); show server errors, including 403
    "sign-ups closed" and 429.
  - **Wardrobe:**
    - Grid with category filter chips and counts; empty state.
    - Upload bottom sheet: camera or gallery via `image_picker`. Compress with `flutter_image_compress` to max 1280 px
      JPEG q90 (EXIF is dropped). Fields: name (optional), category (`auto` or a category), colour (optional). If
      `aiMode == "unconfigured"`, all three are required.
    - Remove with a confirmation.
  - **Stylist:**
    - "Style me" / "Style me again" button with a progress state (up to 150 s).
    - Look cards: "Look 01", title, item thumbnails, reason, and a "Try this look on" button that opens Try-On with the
      look pre-selected.
    - An "only N looks" note when fewer than 3 come back.
  - **Try-On:**
    - Live **front** camera preview via `camera`. Dispose and re-initialise on app lifecycle changes, as the camera
      plugin requires.
    - Permission denied: a friendly message, "Open settings" (`openAppSettings()`) and "Use a photo".
    - Look picker (radio cards).
    - "Try it on" calls `takePicture()`, compresses, computes the nearest supported `aspectRatio`, then POSTs.
    - While waiting, show the captured photo blurred (`ImageFiltered`) with a spinner.
    - Result view with **Save** (PATCH), **Retry** (same photo) and error messages (including the billing message).
    - A saved grid with delete.
  - **Settings:** server URL with a Test button, signed-in email, AI mode notice, sign out.
  - **Theme:** use the tokens from section 4 with `google_fonts` Cormorant Garamond and Jost. The app bar shows the
    "STYLED" wordmark; bottom navigation has Wardrobe · Stylist · Try-On.
- **P4.7 Tests.**
  - `flutter analyze` with 0 issues.
  - Unit tests for the model `fromJson`, `ApiClient` error mapping and bearer header, the aspect-ratio helper, and
    relative URL resolution (using `http_mock_adapter`).
  - Widget test: sign-in form validation.
  - `flutter test` passes.
- **P4.8 Device run (debug, mock backend).** `flutter run --dart-define=API_BASE_URL=http://<PC-LAN-IP>:3100`.
  **Acceptance:** complete the checklist in P5 against the mock backend.

### P5 — Acceptance on the phone against the Proxmox backend
1. `flutter build apk --release --dart-define=API_BASE_URL=https://styled.<tailnet>.ts.net`, then
   `adb install -r mobile/build/app/outputs/flutter-apk/app-release.apk`. Debug signing is fine for sideloading a
   personal app.
2. With the phone on **mobile data** (Tailscale on), check that you can:
   - sign in,
   - upload from the camera and the gallery,
   - filter and remove items,
   - run "Style me" and open a look in Try-On,
   - deny camera permission, then recover via Settings,
   - use "Use a photo",
   - get a try-on result or the billing message,
   - save, delete a saved item, sign out and back in.
3. With the phone on **home Wi-Fi**, repeat the sign-in and one upload.
4. Confirm the release APK can't reach an `http://` URL (cleartext blocked).
5. Restart the LXC (`pct reboot 120`). The app works again within ~1 minute, and the data is still there.

## 7. Known pitfalls

- **Overloaded Gemini** can take 20–120 s to return 503. Keep the long client timeouts, and show "still working…"
  after 15 s.
- **Free Gemini keys:** vision works, image generation returns `429 quota` until billing is enabled.
- **Android:** release builds block cleartext HTTP. Use Tailscale HTTPS in release; use LAN HTTP only in debug.
- **Docker in LXC:** needs `nesting=1,keyctl=1`. On ZFS-backed storage, old ZFS versions can break overlayfs; use the VM
  fallback.
- **Compose:** `network_mode: service:tailscale` conflicts with `ports` on the same service. Use `ports: !reset []` in
  the override and publish ports on `tailscale` instead.
- **`TS_SERVE_CONFIG`** must point into a bind-mounted **directory**. HTTPS needs MagicDNS and HTTPS Certificates
  enabled in the tailnet.
- **SQLite:** a single writer, so never scale `api` beyond one replica. Back up with `VACUUM INTO`, not by copying a
  live DB file.
- **Build requirements:** `next build` needs internet (Google Fonts) and ~2–3 GB RAM on the build host.
- **Proxies and origins:** a proxy may change `Host`. `ALLOWED_ORIGINS` (P1.6) keeps browser POSTs working. Native
  requests are unaffected.
- **Vitest output:** Vitest hides `console.log` output from passing tests. Use `--silent=false` when you need that
  output.

## 8. Definition of done

- The backend runs on the Proxmox LXC under Docker Compose. It restarts automatically and has nightly backups.
- `https://styled.<tailnet>.ts.net` is reachable from the phone on any network. The web UI still works.
- `npm test` and e2e pass, including the new mobile checks. `flutter analyze` and `flutter test` are clean.
- The P5 checklist passes on the physical Android phone with a release APK.
- `README.md` links to `docs/api.md` and documents deploy, update, rollback and backup commands.
