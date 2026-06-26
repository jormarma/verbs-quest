# Verbs Quest — Feature Improvement Plan

Ordered implementation plan for six learner- and admin-facing improvements.
Each feature is developed with **TDD**: write failing tests first, implement until green,
then run `pnpm test`, `pnpm lint`, and `pnpm build` before commit.

## Test infrastructure (Task 0)

| Item | Detail |
| --- | --- |
| Stack | Vitest + jsdom + `@testing-library/react` |
| Scripts | `pnpm test`, `pnpm test:watch`; `pnpm verify` includes `pnpm test` |
| Convention | Pure logic in `src/lib/game/`; co-located `*.test.ts` files |
| Rust | `#[cfg(test)]` unit tests in `spacetimedb/src/lib.rs` for auth helpers |

### Acceptance criteria

- [x] `pnpm test` runs and passes
- [x] `pnpm verify` runs lint + test + build + smoke
- [x] README documents the test command

---

## Feature 1 — Post-run mistake review

**Goal:** After a level, show wrong answers using existing `gameplay.history`.

### Spec

- `getRunReviewItems(history)` returns incorrect `AnswerStamp` entries, newest first.
- `RunReviewPanel` renders on the FINISHED screen when mistakes exist.
- "Continue" calls `resetGame()` (no full page reload).
- i18n keys for EN and ES.

### Acceptance criteria

- [x] Unit tests cover empty history, all-correct, and mixed wrong/correct
- [x] FINISHED screen shows review panel when errors occurred
- [x] Continue resets store without `window.location.reload()`
- [x] `pnpm verify` passes

---

## Feature 2 — Practice mode

**Goal:** Practice skips server submission and level cap changes.

### Spec

- `session.gameMode`: `'quest' | 'practice'`
- Practice: no `submitLevelAttempt`, timer optional/hidden
- Lobby: "Practice level N" button
- Finish screen copy reflects practice

### Acceptance criteria

- [x] `shouldSubmitLevelAttempt('practice')` is false
- [x] Practice run does not call `submitLevelAttempt`
- [x] Quest behavior unchanged

---

## Feature 3 — Pause + physical keyboard

### Acceptance criteria

- [x] Timer elapsed accounts for paused duration
- [x] Physical key handler for letter/backspace/enter
- [x] Pause stops countdown to zero

---

## Feature 4 — Weak-verb drill

### Acceptance criteria

- [x] Stats increment on wrong answers
- [x] Weak-verb practice starts practice mode with targeted verbs

---

## Feature 5 — Cross-device login

### Acceptance criteria

- [x] `login_user` reducer with identity migration
- [x] Client sign-in calls `loginUser`
- [x] Rust unit tests for auth helpers

---

## Feature 6 — Admin preview as student

### Acceptance criteria

- [x] Admin can toggle preview and see student UI
- [x] Toggle back restores admin dashboard

---

## Commit strategy

1. `chore: add vitest and test infrastructure`
2. `feat: post-run mistake review and lobby continue without reload`
3. `feat: practice mode without progression submission`
4. `feat: pause game and physical keyboard input`
5. `feat: weak-verb drill from local error stats`
6. `feat: cross-device login via login_user reducer`
7. `feat: admin preview as student`
