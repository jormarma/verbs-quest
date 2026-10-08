# Quest run

A player who can reach a level plays it as a timed quest. The lobby lists the level's verbs, a three-second countdown runs, and then each verb asks for its past simple and past participle. A wrong answer is asked again later, and when the last question is answered the run is saved as one game session. A run with no errors is perfect, and the server unlocks the next level only for a perfect run. The finish screen reports the result and the error count.

## Sub-features

- `quest-countdown`: Start Quest runs a three-second countdown, after which the timer runs and Pause appears.
- `quest-grading`: each answer is graded CORRECT! or INCORRECT!, and the next question follows.
- `quest-requeue`: a missed verb comes back later, so a run has two questions per verb plus one per miss.
- `quest-save`: finishing writes one game session with the level, the error count, and the perfect flag, and the server stores the run status.
- `quest-finish`: the finish screen shows Level Complete!, then "Errors made:" with the miss count, a TOP 3 TIMES panel, and a Continue button. A run with errors shows the message that a perfect run is needed, and so does a perfect run today, which is a known app issue listed under Gotchas.

## How to get to it (user POV)

- Sign in as a student, or as the admin choose Preview as student on the dashboard.
- Choose Play, then choose a level number.
- Choose Start Quest. After the countdown, type each answer and press Enter to submit it; press Enter again to move on.

## Driving it with flows/level-run.mjs

Preconditions:

- `node .claude/skills/verify/scripts/doctor.mjs` reports healthy, and `control.mjs session-admin` has passed in this run.
- Level 1 is in the active list. In the baseline that is Category 1, where level 1 holds five verbs: BE, BECOME, BEGIN, BITE, and BLEED. If an admin recipe changed the list, restore Category 1 first.
- The scratch admin's level cap of 15 covers level 1.

- **Perfect quest.** Run `node .claude/skills/verify/scripts/flows/level-run.mjs --mode quest --level 1 --wrong 0`. Expect `PASS  lesson lists the level verbs: level 1: BE, BECOME, BEGIN, BITE, BLEED`, 10 answers with 0 incorrect, `PASS  finish screen heading: "Level Complete!"`, `PASS  one game_session row written: 1 new row(s)`, `PASS  perfect flag matches error count: is_perfect_run true with 0 error(s)`, and `PASS  server stores the run status: user_attempt.last_status unlocked, expected unlocked`. The NOTE lines for the two known issues below are expected, and the command exits 0. Evidence: `flows/quest-level1-wrong0.json` and `screens/quest-finished-level1-wrong0.png`.
- **Quest with one miss.** Run `node .claude/skills/verify/scripts/flows/level-run.mjs --mode quest --level 1 --wrong 1`. Expect 11 answers with 1 incorrect, `PASS  row records level and error count` with `errors 1`, `PASS  server stores the run status: user_attempt.last_status maintained, expected maintained`, `PASS  screen shows the error count: Errors made: 1`, and `PASS  screen explains that a perfect run is needed`. Evidence: `flows/quest-level1-wrong1.json` and `screens/quest-finished-level1-wrong1.png`.
- **Manual start, for debugging a failed flow.** Run these commands in order, each as `node .claude/skills/verify/scripts/control.mjs ...`: `click "Preview as student" --exact`, `click Play --exact`, `click 1 --exact`, `expect "BE, BECOME, BEGIN, BITE, BLEED" --exact`, `click "Start Quest" --exact`, and `expect Pause --exact`. Read the question with `text`, type the answer with `type became` for BECOME in the past simple, and press Enter twice with `press Enter`, once to submit and once to move on.
- **Proof.** The flow exit code 0, the JSON file, the finish screenshot, and each assertion line from the run.

## Gotchas

- The lobby selects a level by itself once the profile loads, which can overwrite an early click on a level number. The flow clicks again until the lesson line lists that level's verbs. Do the same by hand, and read the lesson line before you press Start Quest.
- Pause appears only after the three-second countdown. The flow waits for the CORRECT! or INCORRECT! overlay to disappear before it types the next answer; do the same by hand.
- The server rejects a quest that finishes in under 0.8 seconds per question, with "Anti-cheat triggered: Completion time physically impossible", and saves nothing. The flow paces answers at 900 ms, far above that floor.
- The default time limit is 180 seconds, from the app settings. A run over the limit is stored as `downgraded`. The flows do not drive that path, so report it as not verified.
- Keep `--level` within the scratch admin's cap of 15 and within the active list. Category 1 has 15 levels, so asking for level 16 fails at once with `no active verbs in level 16`, which is a setup problem, not an app defect.
- Known app issue `perfect-run-message`: a perfect run shows "Good job, but you need a perfect run to unlock the next level." instead of the perfect message, because the client reads `user_attempt`, and nothing subscribes to that table. The server stored `unlocked`, so the database row is the truth. The flow reports this as a NOTE and does not fail. The reading code is in `src/lib/utils/sync.ts`, and the branches are in `src/App.tsx`.
- Known app issue `top-3-times-loading`: "TOP 3 TIMES" stays on "Loading..." after every run, because the client reads `game_session` and nothing subscribes to that table. Do not wait for it to change. The reading code is in `src/lib/utils/sync.ts`.
- The UI is in English by default, and the flow matches English button names and headings. Keep the app language on EN before you drive it.
