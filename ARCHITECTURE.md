# Verbs Quest: System Architecture & Data Design

## 1. Technology Stack Selection

### Frontend Core: **Vite + React (TypeScript)**
* **Justification:** While Next.js is powerful, "Verbs Quest" is a high-interactivity application heavily reliant on client-side state and Three.js render loops.
    * **PWA Suitability:** Vite produces a static Single Page Application (SPA) bundle, which is significantly easier to cache reliably via Service Workers (Workbox) for offline play than Next.js's server-hybrid routes.
    * **Performance:** Eliminates the overhead of server-side hydration for game components, ensuring the highest possible frame rate for the Three.js canvas.

### State Management: **Zustand**
* **Justification:**
    * **Performance:** Zustand supports "transient updates" (updating state without re-rendering the component tree). This is critical for connecting Game Logic to the Three.js visual layer (React Three Fiber) without causing performance drops during animations.
    * **Simplicity:** Minimal boilerplate compared to Redux Toolkit, making the "Retry Queue" logic easier to implement and debug.

### Visual Layer: **React Three Fiber (R3F)**
* **Strategy:** A global `Canvas` component will sit at `z-index: 0` (background). The UI (Tailwind) will sit at `z-index: 10` (foreground).
* **Implementation:** Even in the MVP, the Canvas is initialized. In early stages, it will render a simple static background. In the Polish phase, it will render interactive 3D assets triggered by Zustand state changes.

---

## 2. Database Schema (Supabase PostgreSQL)

### A. Tables & Relationships

**1. `public.users`**
* **Purpose:** Local mirror of Clerk identity + Role management.
* **Columns:**
    * `id` (text, PK): Matches Clerk User ID strictly.
    * `role` (text): 'student' (default), 'admin', 'teacher'.
    * `username` (text): Synced from Clerk.
    * `created_at` (timestamp).
    * `current_level_cap` (int): Highest level unlocked (Default: 1).

**2. `public.verbs`**
* **Purpose:** The curriculum content.
* **Columns:**
    * `id` (uuid, PK).
    * `infinitive` (text).
    * `past_simple` (text).
    * `past_participle` (text).
    * `level_group` (int): The level this verb belongs to (1-N).
    * `active` (bool): Soft delete flag.

**3. `public.game_sessions`**
* **Purpose:** Historical record of runs for analytics.
* **Columns:**
    * `id` (uuid, PK).
    * `user_id` (text, FK -> users.id).
    * `level_attempted` (int).
    * `errors_count` (int).
    * `duration_seconds` (int).
    * `completed_at` (timestamp).
    * `is_perfect_run` (bool): Computed (errors == 0 && time within limit).
    * `client_timestamp_start` (timestamp): For anti-cheat validation.
    * `client_timestamp_end` (timestamp): For anti-cheat validation.

### B. The Clerk-to-Supabase Sync (Critical)
Since Supabase cannot "see" Clerk users by default, we cannot use Foreign Keys without this sync.

1.  **Trigger:** Clerk Webhook (`user.created`).
2.  **Destination:** Supabase Edge Function (`/functions/v1/clerk-webhook`).
3.  **Action:** The webhook payload contains the new `userId` and `username`. The function executes a text-to-text insert into `public.users`.
4.  **Fallback:** On the frontend, if a user logs in and the `public.users` record is missing (rare race condition), the client triggers a "Self-Heal" RPC call to insert their own record before starting the game.

---

## 3. Security Model

### A. Row-Level Security (RLS) Policies

All tables will have RLS enabled.

| Table | Policy Name | Logic |
| :--- | :--- | :--- |
| **users** | `read_own_profile` | `auth.uid() = id` |
| **users** | `admin_read_all` | `exists(select 1 from users where id = auth.uid() and role = 'admin')` |
| **verbs** | `public_read` | `true` (Game needs to download all verbs for offline cache) |
| **verbs** | `admin_write` | `exists(select 1 from users where id = auth.uid() and role = 'admin')` |
| **game_sessions** | `insert_own` | `auth.uid() = user_id` |
| **game_sessions** | `read_own` | `auth.uid() = user_id` |
| **game_sessions** | `admin_read_all` | `exists(select 1 from users where id = auth.uid() and role = 'admin')` |

### B. Anti-Cheat & Offline Sync Strategy

We cannot trust the client to say "I won." The client sends a **Payload**, and the Database decides if it's a win.

**The "Submit Result" RPC Function (`submit_level_attempt`):**
1.  **Input:** `level_id`, `start_time`, `end_time`, `error_count`, `question_log`.
2.  **Validation 1 (Time):** Calculate `duration = end_time - start_time`. Get the number of questions answered.
    * *Rule:* If `duration < (questions_count * 0.8 seconds)`, reject submission (Physically impossible to type that fast).
3.  **Validation 2 (Identity):** Ensure `auth.uid()` matches the payload user.
4.  **Execution:**
    * Insert record into `game_sessions`.
    * **IF** `error_count == 0` **AND** `duration <= level_time_limit`:
        * UPDATE `users SET current_level_cap = current_level_cap + 1`.
        * Return `{ status: 'unlocked', new_level: X }`.
    * **ELSE**: Return `{ status: 'locked' }`.

---

## 4. Game State Machine (Zustand Store)

This structure manages the active gameplay loop.

```json
{
  "session": {
    "level": 5,
    "status": "IDLE", // "PLAYING" | "PAUSED" | "FINISHED"
    "startTime": 1715000000,
    "config": {
      "timeLimit": 120,
      "baseQuestionCount": 10
    }
  },
  "gameplay": {
    "currentQuestionIndex": 0,
    "mainQueue": [
      { "verbId": "101", "tense": "PAST_SIMPLE", "target": "WENT" },
      { "verbId": "101", "tense": "PAST_PARTICIPLE", "target": "GONE" }
    ],
    "retryQueue": [], // Pushes here on wrong answer
    "history": [], // Log of all inputs for replay/validation
    "currentInput": "WE", // Bound to virtual keyboard
    "errorsInLevel": 0
  }
}
```

## 5. Folder Structure
Scalable "Feature-Sliced" structure for Vite.

```
/src
  /assets           # Static images/fonts
  /components
    /ui             # Generic Tailwind UI (Buttons, Cards)
    /game           # Game-specific UI (VirtualKeyboard, Timer)
    /3d             # R3F components (Scene, Avatar, Lights)
  /features
    /auth           # Clerk wrappers, ProtectRoute components
    /dashboard      # Admin charts, tables
    /game-engine    # The core logic (State machine, Validation)
  /lib
    /supabase       # Client setup
    /hooks          # Global hooks
    /stores         # Zustand stores (useGameStore, useUserStore)
    /utils          # Offline sync helpers, Date formatters
  /pages            # Route definitions
    /admin
    /student
  /styles           # Tailwind config
  App.tsx           # Main Router & Layouts
```
