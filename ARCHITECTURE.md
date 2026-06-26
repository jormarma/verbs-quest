# Verbs Quest: System Architecture & Data Design

## 1. Technology Stack Selection

### Frontend Core: **Vite + React 19 (TypeScript)**
- High-interactivity SPA, easy to cache via Workbox for offline play.
- PWA-ready: service worker + offline verbs cache + offline attempt queue.

### State Management: **Zustand**
- Transient updates: connect game logic to the R3F canvas without re-renders.
- Minimal boilerplate for the retry-queue loop.

### Visual Layer: **React Three Fiber (R3F)**
- Canvas at `z-index: 0` (background), Tailwind UI at `z-index: 10`.

### Backend: **SpacetimeDB 2.6 (Rust module)**
- Single source of truth: tables, reducers, and procedures are colocated in
  the WASM-compiled Rust crate at `spacetimedb/`.
- Subscriptions let the client react to server-side state changes without
  polling.
- TypeScript bindings are generated from the module (`src/lib/spacetime/module_bindings/`)
  so the client and server share the same schema.

---

## 2. Database Schema (SpacetimeDB Rust)

### A. Tables

**1. `user` (public)**
- Mirrors `auth.users` from the old Supabase schema — plus role management.
- `identity: Identity` (PK) — the SpacetimeDB connection identity, auto-
  generated per device and persisted in localStorage as a signed JWT.
- `username_lower: String` (unique) — case-folded for unique lookups.
- `username: String` — display name.
- `password_hash: String` — argon2 PHC string (kept for future cross-device
  login; not currently validated server-side since each device has its own
  identity).
- `role: String` — `"student"` (default) or `"admin"`.
- `current_level_cap: u32` — highest unlocked level.
- `created_at: Timestamp`.

**2. `verb` (public)**
- `id: u64` (PK, auto-inc).
- `infinitive`, `past_simple`, `past_participle: String`.
- `level_group: u32` — which level the verb belongs to.
- `category: u32` — 1 (basic), 2 (complete), 3 (extremely complete).
- `active: bool` — only one category is active at a time.

**3. `game_session` (public)**
- `id: u64` (PK, auto-inc).
- `user_identity: Identity` (indexed).
- `level_attempted: u32` (indexed).
- `errors_count`, `duration_seconds: u32`.
- `is_perfect_run: bool`.
- `client_timestamp_start`, `client_timestamp_end`, `completed_at: Timestamp`.

**4. `app_setting` (public, singleton)**
- `id: u8 = 1` (PK).
- `time_limit_seconds: u32` (60..=300).
- `verbs_per_level: u32` (5..=25).
- `active_verb_category: u32` (1..=3).
- `updated_at: Timestamp`, `updated_by: Identity`.

**5. `user_attempt` (public)**
- `identity: Identity` (PK).
- `last_status: String` — `"unlocked" | "maintained" | "downgraded"`.
- `last_new_level: u32`.
- `last_completed_at: Timestamp`.
- Written by `submit_level_attempt` so clients can pick up the result via
  a subscription (SpacetimeDB reducers can't return values directly).

### B. Lifecycle

`init` reducer seeds `app_setting` row 1 with defaults
(180 s time limit, 5 verbs per level, category 1 active).

---

## 3. Security Model

### A. Auth

There is no separate `auth.users` table — SpacetimeDB identities ARE users.
The web SDK generates a per-device identity on first connection and signs it
into a JWT stored in `localStorage`. Subsequent visits reuse the same token
so the player stays logged in.

Username uniqueness is enforced server-side (case-folded). Passwords are
hashed with argon2 (`SaltString::from_b64(...)` with salt bytes from
`ctx.rng()`, since SpacetimeDB disallows `getrandom`).

The very first `register_admin` call is allowed even without an existing
admin; subsequent admin registrations are rejected (`promote_to_admin` is
the only path after that).

**Google sign-in (OIDC).** SpacetimeDB accepts any OpenID Connect compliant
JWT and derives the `Identity` from the token's `iss` + `sub` claims, so a
Google account maps to a single stable identity across all devices (no
password). The client obtains a Google ID token via Google Identity Services
and passes it through `DbConnection.builder().withToken(idToken)`. The
`register_google_user(username)` reducer validates the token's issuer
(`accounts.google.com`) and audience (`GOOGLE_CLIENT_ID`, a public value via
`ctx.sender_auth().jwt()`) before creating a password-less `user` row. The
Google client ID is public (no secret in the PWA). Anonymous/device identities
and username/password login continue to work alongside Google sign-in.

### B. Authorization

All admin-only operations check `ctx.sender()` against the user table
inside the reducer:

```rust
fn require_admin(ctx: &ReducerContext) -> Result<User, String> { ... }
```

Reductions with this gate: `update_app_settings`, `set_active_verb_category`,
`upsert_verb`, `delete_verb`, `truncate_verbs`, `promote_to_admin`.

Public tables (no RLS in SpacetimeDB — subscriptions are gated client-side):
`user`, `verb`, `game_session`, `app_setting`, `user_attempt`.

Procedures (`get_users_overview`, `get_user_level_details`,
`get_user_level_runs`) are read-only and can be called by any authenticated
client.

### C. Anti-Cheat & Submission Validation

**`submit_level_attempt(level_id, start_time_iso, end_time_iso, error_count, questions_count)`**

1. Validates identity (auto via `require_user`).
2. Validates level is within the active verb list's max level.
3. Parses ISO-8601 timestamps server-side so the client can stay in
   `Date` semantics.
4. Anti-cheat: rejects attempts faster than
   `questions_count * 0.8` seconds.
5. Computes `is_perfect = on_time && no_errors`.
6. Inserts the `game_session` row.
7. Updates `user.current_level_cap`:
   - perfect → `max(cap, level+1)` clamped to active max level, status `unlocked`
   - on time with errors → cap unchanged, status `maintained`
   - slow → `cap-1` clamped to `[1, max_level]`, status `downgraded`
8. Writes the result to `user_attempt` so subscribers can read it.

---

## 4. Game State Machine (Zustand Store)

Identical to the original design — see the store file for the full shape:

```json
{
  "session": {
    "level": 5,
    "status": "IDLE", // "PLAYING" | "PAUSED" | "FINISHED"
    "startTime": 1715000000,
    "config": { "timeLimit": 120, "baseQuestionCount": 10 }
  },
  "gameplay": {
    "currentQuestionIndex": 0,
    "mainQueue": [ { "verbId": "101", "tense": "PAST_SIMPLE", "target": "WENT" }, ... ],
    "retryQueue": [],
    "history": [],
    "currentInput": "WE",
    "errorsInLevel": 0,
    "topScores": [ ... ],
    "submissionStatus": "unlocked" | "maintained" | "downgraded" | "rejected" | null,
    "submissionNewLevel": 6
  }
}
```

---

## 5. Folder Structure

```
/spacetimedb               # Rust module (server-side)
  /src/lib.rs              # Tables, reducers, procedures, helpers
  Cargo.toml
/src
  /components
    /ui                    # Generic Tailwind UI (Buttons, Cards, etc.)
    /game                  # Game-specific UI (VirtualKeyboard, Timer)
    /3d                    # R3F components (Scene, Avatar, Lights)
  /features
    /auth                  # AuthProvider + AuthContext (SpacetimeDB identity)
    /admin                 # AdminDashboard, AdminSettingsPanel, AdminVerbsPanel,
                            # GlobalLeaderboardTable
    /game-engine           # (state machine lives in /lib/stores/useGameStore.ts)
  /lib
    /spacetime             # SpacetimeDB client + auto-generated bindings
      /module_bindings/    # Generated TypeScript SDK (DO NOT EDIT)
      client.ts            # Shared DbConnection + token persistence
    /hooks                 # useProfile, useVerbs, useAppSettings, useAdminStats, ...
    /stores                # Zustand stores (useGameStore, useSettingsStore)
    /utils                 # sync (offline queue + submit), cn (classNames)
  /pages                   # Route definitions (kept for future)
    /admin
    /student
  App.tsx                  # Main Router & Layouts
/scripts                   # CSV import + smoke test (CLI-driven)
/verbs.csv                 # Source of truth for verbs
```