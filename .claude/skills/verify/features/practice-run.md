# Practice run

Practice lets a player work through a level without a timer, a countdown, or a saved result. Its questions and feedback match a quest, and a missed verb still comes back, but the run ends on "Practice complete!" with a result line and writes nothing: no game session is stored and the unlock progress does not change. Players use it to rehearse a level from the lobby.

## Sub-features

- `practice-start`: the Practice level button for a level starts that run at once, with no countdown and no Pause button.
- `practice-grading`: answers are graded the same way as quest answers, and a missed verb is asked again.
- `practice-finish`: the finish screen reads "Practice complete!", with "Perfect practice run" when nothing was missed and "Errors made:" followed by the miss count otherwise.
- `practice-no-save`: no game session is written, and the `user_attempt` row is unchanged.

## How to get to it (user POV)

- Choose Play, then choose a level number.
- Choose the Practice level button for that level. On level 1 it reads "Practice level 1".
- Answer each question. A Cancel Run button stays on screen for the whole run.

## Driving it with flows/level-run.mjs

Preconditions:

- `node .claude/skills/verify/scripts/doctor.mjs` reports healthy, and `node .claude/skills/verify/scripts/control.mjs session-admin` has passed in this run.
- Level 1 is in the active list. In the baseline that is Category 1, where level 1 holds BE, BECOME, BEGIN, BITE, and BLEED. If an admin recipe changed the list, restore Category 1 first.

- **Clean practice.** Run `node .claude/skills/verify/scripts/flows/level-run.mjs --mode practice --level 1 --wrong 0`. Expect `PASS  lesson lists the level verbs: level 1: BE, BECOME, BEGIN, BITE, BLEED`, 10 answers with 0 incorrect, `PASS  finish screen heading: "Practice complete!"`, `PASS  practice writes no game_session row: 0 new row(s)`, `PASS  screen shows the practice result: Perfect practice run`, and `PASS  practice leaves user_attempt (unlock progress) unchanged`. The command exits 0. Evidence: `flows/practice-level1-wrong0.json` and `screens/practice-finished-level1-wrong0.png`.
- **Practice with misses.** Run `node .claude/skills/verify/scripts/flows/level-run.mjs --mode practice --level 1 --wrong 2`. Expect 12 answers with 2 incorrect, `PASS  screen shows the practice result: Errors made: 2`, and still `PASS  practice writes no game_session row: 0 new row(s)`. Evidence: `flows/practice-level1-wrong2.json` and `screens/practice-finished-level1-wrong2.png`.
- **Manual practice, for debugging a failed flow.** Run these commands in order, each as `node .claude/skills/verify/scripts/control.mjs ...`: `click "Preview as student" --exact`, `click Play --exact`, `click 1 --exact`, `click "Practice level 1" --exact`, and `expect "Cancel Run" --exact`. Answer as in the quest run. The next recipe's `goto` reloads the app, which ends this unsaved run.
- **Proof.** The flow exit code 0, the JSON file, the finish screenshot, and the `game_session` and `user_attempt` assertions from the run.

## Gotchas

- Practice has no countdown, no Pause button, and no submission step, so there is no timer to race and no save to wait for.
- Practice saves nothing, so it cannot unlock a level. The flow checks that the `game_session` rows and the `user_attempt` row are unchanged. Never use a practice run as proof of a quest result.
- The finish message depends on the misses: "Perfect practice run" only when no answer was incorrect, and "Errors made:" followed by the miss count otherwise. The flow checks the matching text for the run it played.
- The lobby can select a level by itself after the profile loads, so the lesson line must list the level's verbs before you press the Practice level button. The flow waits for that line; by hand, read it first.
- The separate "Practice my weak verbs" entry point is not covered by this map. If a change touches it, report it as not verified.
