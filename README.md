# Verbs Quest

Irregular-verb conjugation trainer built with React + Three.js on the frontend
and a SpacetimeDB Rust module on the backend.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Vite + React 19 (TypeScript), Zustand, React Three Fiber, Tailwind, vite-plugin-pwa |
| Backend | SpacetimeDB 2.6 (Rust module) at `spacetimedb/`, single source of truth for users, verbs, sessions, and settings |
| Auth | Per-device SpacetimeDB identity (auto-signed JWT in localStorage) + argon2-hashed passwords |

## Run locally

Prerequisites: Node ≥ 20, pnpm ≥ 10, Rust + `wasm32-unknown-unknown` target,
[SpacetimeDB CLI](https://spacetimedb.com/install) ≥ 2.6.

```bash
# Terminal 1 — start SpacetimeDB (only needed once per boot)
spacetime start --jwt-key-dir ~/.mavis/agents/mavis/spacetime/

# Terminal 2 — build + publish the Rust module
pnpm stdb:build
pnpm stdb:publish:local

# Terminal 3 — seed verbs and (optionally) bootstrap an admin
pnpm verbs:import:dry   # see what would be inserted
pnpm verbs:import       # actually insert all 490 verbs across the 3 categories

# Bootstrap the very first admin (no admin exists yet)
spacetime call --server local verbs-quest register_admin '"admin"' '"yourpassword"'

# Terminal 4 — frontend
pnpm dev
```

Open <http://localhost:5173>. The very first connection auto-generates a
device identity and stores its JWT in `localStorage`. Subsequent visits reuse
that identity so the player stays logged in.

If you ever want to log out (or move to a new device), open DevTools → Application
→ Local Storage and delete the `verbs-quest.stdb.token` key.

## Build locally

```bash
cp .env.production.example .env.production.local   # first time only
pnpm build:prod
pnpm preview                                          # http://localhost:4173
```

Production output is written to `dist/` (not committed to git).

## Deploy to Cloudflare Pages

Connect the GitHub repo in the Cloudflare dashboard with these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Build command | `pnpm build:prod` |
| Build output directory | `dist` |
| Node version | `20` (or use repo `.node-version`) |

**Environment variables** (Production):

| Variable | Value |
| --- | --- |
| `VITE_SPACETIMEDB_URI` | `wss://maincloud.spacetimedb.com` |
| `VITE_SPACETIMEDB_DB` | `verbs-quest` |

`wrangler.toml` sets `pages_build_output_dir = "dist"` for Wrangler-based
workflows. SPA routing is handled by `public/_redirects`.

### Backend (SpacetimeDB Maincloud)

Publish the database module and seed verbs before the live site can work:

```bash
pnpm stdb:publish:maincloud
pnpm verbs:import
spacetime call verbs-quest register_admin '"admin"' '"yourpassword"'
```

## Tests

Unit and component tests use [Vitest](https://vitest.dev/):

```bash
pnpm test          # run once
pnpm test:watch    # watch mode
```

Pure game logic lives under `src/lib/game/` with co-located `*.test.ts` files.

Rust module unit tests:

```bash
pnpm test:rust
```

## Google sign-in (OIDC)

Google "Sign in with Google" is supported via SpacetimeDB's OpenID Connect
support. SpacetimeDB accepts any OIDC-compliant JWT and derives a **stable
`Identity` from the token's `iss` + `sub`**, so one Google account maps to one
identity across every device/browser automatically.

The Google **client ID is public** (the client *secret* is never used in this
browser ID-token flow), so nothing secret ships in the PWA. The button is hidden
until `VITE_GOOGLE_CLIENT_ID` is set.

### 1. Google Cloud Console
1. APIs & Services → **OAuth consent screen**: configure (External), add your
   email as a test user while in "Testing".
2. APIs & Services → **Credentials → Create credentials → OAuth client ID →
   Web application**.
3. **Authorized JavaScript origins**: add `http://localhost:5173` (dev) and
   `https://verbs-quest.pages.dev` (prod). No redirect URI is needed for the
   GIS ID-token flow.
4. Copy the **Client ID** (`...apps.googleusercontent.com`).

### 2. SpacetimeDB module
Set the same client ID as `GOOGLE_CLIENT_ID` in
[`spacetimedb/src/lib.rs`](./spacetimedb/src/lib.rs) (used to validate the token
`aud` claim), then rebuild + publish:

```bash
pnpm stdb:build && pnpm stdb:publish:local   # or :maincloud
```

### 3. Frontend
Set `VITE_GOOGLE_CLIENT_ID` to the same value:
- Local: in `.env.development.local`
- Cloudflare Pages: as a Production environment variable

The first time a Google user signs in they pick a display name (3–12 chars),
which calls the password-less `register_google_user` reducer.

## Cross-device login (username/password)

Alternatively, sign in with an existing username and password on a new device.
The `login_user` reducer verifies credentials and re-binds progress to the
current device identity. Sign out first if the device already has a profile.

After changing the Rust module, regenerate client bindings:

```bash
pnpm stdb:generate
```

## Full verification

```bash
pnpm verify
```

Runs lint + unit tests + production build + admin-verbs smoke test.

## Import verbs from CSV

The verb source file is [`verbs.csv`](./verbs.csv) with header:

```csv
category,present,past,participle
```

Commands:

```bash
pnpm verbs:import:dry   # see the planned import without touching the DB
pnpm verbs:import       # execute the import (requires admin identity)
```

Import behavior:

- `present` → `verb.infinitive`
- `past` → `verb.past_simple`
- `participle` → `verb.past_participle`
- `category` is stored in `verb.category`
- category 1 is initially active; categories 2 and 3 are inactive until the
  admin selects one (see below)

## Admin verb categories

In Admin → `Verbs` tab, the admin selects one active list:

- `1` basic
- `2` complete
- `3` extremely complete

When applying a category:

- active verbs are switched atomically
- app setting `active_verb_category` is updated
- user level caps are clamped to the new maximum level

## Multi-answer verb forms

For answers containing `/` (for example `burnt/burned`):

- any listed variant is accepted as correct
- wrong-answer feedback shows all accepted variants separated by ` / `

## Automated smoke check (local DB)

```bash
pnpm verbs:verify:smoke
```

This validates:

- all 3 categories exist with data
- only one category is active at a time
- admin can update app settings while non-admin updates are blocked
- app settings range constraints are enforced
- admin can switch active category
- switching from larger to smaller category clamps user level caps
- (category-switching is admin-only by reducer check)

## Manual verification checklist

1. Run `pnpm verbs:import` to seed the verbs table.
2. Register an admin with `register_admin` (see above).
3. Log in as the admin and open the `Verbs` tab.
4. Switch category to `2`, apply, refresh, and verify category persists.
5. Switch category to `3`, apply, and verify more levels are available to players.
6. Start a run with a verb that has alternative forms (e.g. `burn`), verify
   both alternatives are accepted.
7. Submit a wrong answer and verify all valid alternatives are shown in feedback.

## Architecture overview

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full data + security model
and the SpacetimeDB schema.