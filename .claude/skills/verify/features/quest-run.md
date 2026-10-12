# Quest run

A player who can reach a level plays it as a timed quest. The lobby lists the level's verbs, a three-second countdown runs, and then each verb asks for its past simple and past participle. A wrong answer is asked again later, and when the last question is answered the run is saved as one game session. A run with no errors is perfect, and the server unlocks the next level only for a perfect run. The finish screen reports the result and the error count.

## Sub-features

- `quest-countdown`: Start Quest runs a three-second countdown, after which the timer runs and Pause appears.
- `quest-grading`: each answer is graded CORRECT! or INCORRECT!, and the next question follows.
- `quest-requeue`: a missed verb comes back later, so a run has two questions per verb plus one per miss.
- `quest-save`: finishing writes one game session with the level, the error count, and the perfect flag, and the server stores the run status.
- `quest-finish`: the finish screen shows the verdict the server stored, with the error count, a TOP 3 TIMES panel of the player's own times, and a Continue button. A run with errors says a perfect run is needed. A perfect run says "Perfect run!", and adds "Level unlocked." only when it raises the level cap. A run that ran out of time shows "Level Failed!" and no TOP 3 panel. A run the server did not confirm shows "Run not saved" and no verdict.
- `quest-unlock`: a perfect run that raises the level cap makes the next level selectable on the same page, without a reload.

## How to get to it (user POV)

- Sign in as a student, or as the admin choose Preview as student on the dashboard.
- Choose Play, then choose a level number.
- Choose Start Quest. After the countdown, type each answer and press Enter to submit it; press Enter again to move on.

## Driving it with flows/level-run.mjs

Preconditions:

- `node .claude/skills/verify/scripts/doctor.mjs` reports healthy, and `control.mjs session-admin` has passed in this run.
- Level 1 is in the active list. In the baseline that is Category 1, where level 1 holds five verbs: BE, BECOME, BEGIN, BITE, and BLEED. If an admin recipe changed the list, restore Category 1 first.
- The scratch admin's level cap starts at 15 and covers level 1.

Run the cases in this order. `--idle` lowers the cap, and the unlock case needs the cap to equal its level.

- **Perfect quest.** Run `node .claude/skills/verify/scripts/flows/level-run.mjs --mode quest --level 1 --wrong 0`. Expect 10 answers with 0 incorrect, `PASS  finish screen heading: "Level Complete!"`, `PASS  one game_session row written: 1 new row(s)`, `PASS  server stores the run status: user_attempt.last_status unlocked, expected unlocked`, and `PASS  perfect run shows "Perfect run!": Perfect run! Well done practicing. (server cap 15 to 15)`. At cap 15 nothing is unlocked, so the message has no "Level unlocked". The TOP 3 TIMES check passes against the caller's own sessions. Evidence: `flows/quest-level1-wrong0.json` and `screens/quest-finished-level1-wrong0.png`.
- **Quest with one miss.** Run `node .claude/skills/verify/scripts/flows/level-run.mjs --mode quest --level 1 --wrong 1`. Expect 11 answers with 1 incorrect, `PASS  row records level and error count` with `errors 1`, `PASS  server stores the run status: user_attempt.last_status maintained, expected maintained`, `PASS  screen shows the error count: Errors made: 1`, and `PASS  screen explains that a perfect run is needed`. Evidence: `flows/quest-level1-wrong1.json` and `screens/quest-finished-level1-wrong1.png`.
- **Time-out.** Run `node .claude/skills/verify/scripts/flows/level-run.mjs --mode quest --level 1 --idle`. It answers nothing and takes about three minutes. Expect `PASS  finish screen heading: "Level Failed!"`, `PASS  row records level and error count` with `errors 1`, `PASS  server stores the run status: user_attempt.last_status downgraded, expected downgraded`, `PASS  screen shows the time-out failure: Time's up!`, `PASS  failed run hides TOP 3 TIMES`, and `PASS  server lowers the cap by one: server cap 15 to 14` on a fresh run. Evidence: `flows/quest-level1-idle.json` and `screens/quest-finished-level1-idle.png`.
- **Unlock, then the next level.** Run `node .claude/skills/verify/scripts/flows/level-run.mjs --mode quest --level 14 --wrong 0 --then-level 15` after the time-out run, when the cap is 14. Expect `PASS  perfect run shows "Level unlocked": Perfect run! Level unlocked. (server cap 14 to 15)`, `PASS  server stores the run status: user_attempt.last_status unlocked, expected unlocked`, `PASS  level 15 is selectable after the run: lesson lists THROW, UNDERSTAND, WEAR, WIN, WRITE`, and `PASS  no page load between the finish screen and the next level`. Evidence: `screens/quest-selectable-level15-after-level14.png`.
- **Offline run.** Run `node .claude/skills/verify/scripts/flows/level-run.mjs --mode quest --level 1 --offline`. The flow goes offline after Start Quest and answers as usual, so the finish screen cannot save the run. Expect `PASS  finish screen heading: "Run not saved"`, `PASS  no game_session row while offline`, `PASS  screen says the run is not saved`, and `PASS  run waits in the offline queue`. The flow then goes back online, and expects `PASS  queued run is saved once back online` and `PASS  offline queue is empty after the sync`. Evidence: `flows/quest-level1-offline.json` and `screens/quest-finished-level1-offline.png`.
- **Manual start, for debugging a failed flow.** Run these commands in order, each as `node .claude/skills/verify/scripts/control.mjs ...`: `click "Preview as student" --exact`, `click Play --exact`, `click 1 --exact`, `expect "BE, BECOME, BEGIN, BITE, BLEED" --exact`, `click "Start Quest" --exact`, and `expect Pause --exact`. Read the question with `text`, type the answer with `type became` for BECOME in the past simple, and press Enter twice with `press Enter`, once to submit and once to move on.
- **Proof.** The flow exit code 0, the JSON file, the finish screenshot, and each assertion line from the run.

## Gotchas

- The lobby selects a level by itself once the profile loads, which can overwrite an early click on a level number. The flow clicks again until the lesson line lists that level's verbs. Do the same by hand, and read the lesson line before you press Start Quest.
- The lobby redraws often, so a click on a level number can miss. The flow retries each click for up to eight rounds. By hand, click again.
- Continue returns to the lobby menu, not to the level list. Choose Play, then the level number. This is how the lobby behaves today; the unlock case checks it.
- Pause appears only after the three-second countdown. The flow waits for the CORRECT! or INCORRECT! overlay to disappear before it types the next answer; do the same by hand.
- The server rejects a quest that finishes in under 0.8 seconds per question, with "Anti-cheat triggered: Completion time physically impossible", and saves nothing. The flow paces answers at 900 ms, far above that floor.
- The default time limit is 180 seconds, from the app settings. A run over the limit is stored as `downgraded`, and `--idle` drives that path. It lowers the scratch admin's level cap by one, so run it after the other quest runs and before the unlock case.
- Keep `--level` within the scratch admin's cap and within the active list. Category 1 has 15 levels, so asking for level 16 fails at once with `no active verbs in level 16`, which is a setup problem, not an app defect.
- Flag names change the evidence file names: `--idle` writes `quest-level1-idle.json`, and `--offline` writes `quest-level1-offline.json`. Without either, the name carries the misses, as in `quest-level1-wrong1.json`.
- The UI is in English by default, and the flow matches English button names and headings. Keep the app language on EN before you drive it.
