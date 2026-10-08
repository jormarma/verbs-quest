# Sign-in gate

A visitor who is not signed in sees the Verbs Quest header, the tagline, and the prompt "Sign in with your Google account to play." instead of the lobby, and no game control appears until a Google sign-in is stored. The app stores the sign-in method under `verbs-quest.auth.method` and the token under `verbs-quest.stdb.token`, so removing those keys sends the visitor back to the gate. This feature proves the gate screen and the controls it hides; it does not perform the Google OAuth exchange, which needs a real Google account and a browser popup.

## Sub-features

- `gate-prompt`: the prompt "Sign in with your Google account to play." appears where the lobby would be.
- `gate-hides-game`: the buttons Preview as student, Play, and Start Quest are not visible while signed out.
- `gate-after-sign-out`: choosing Sign Out in the admin dashboard returns the visitor to the gate.

## How to get to it (user POV)

- Open the app in a browser profile with no stored sign-in. The gate is the first screen.
- From the admin dashboard, choose Sign Out in the top right. The gate returns.

## Driving it with control.mjs

Preconditions:

- `node .claude/skills/verify/scripts/doctor.mjs` reports healthy for the current run.
- No session is needed to start. `control.mjs session-signed-out` clears the stored sign-in and reloads, so it works from any state.

- **Gate shown.** Run `node .claude/skills/verify/scripts/control.mjs session-signed-out`. Expect `PASS: sign-in gate visible`.
- **Prompt and screenshot.** Run `node .claude/skills/verify/scripts/control.mjs expect "Sign in with your Google account to play." --exact --shot sign-in-gate`. Expect `PASS: "Sign in with your Google account to play." is visible` and a screenshot line for `screens/sign-in-gate.png`.
- **Game controls hidden.** Run `node .claude/skills/verify/scripts/control.mjs absent "Preview as student" --exact`, then the same with `"Play"` and with `"Start Quest"`. Each expects a PASS line ending in `is not visible`, for example `PASS: "Play" is not visible`.
- **Sign-out returns to the gate.** Run `node .claude/skills/verify/scripts/control.mjs session-admin`, then `node .claude/skills/verify/scripts/control.mjs click "Sign Out" --exact`, then `node .claude/skills/verify/scripts/control.mjs expect "Sign in with your Google account to play." --exact --shot sign-in-gate-after-sign-out`. Expect `PASS: clicked button "Sign Out"` and the prompt line.
- **Proof.** The gate screenshot, the three `absent` lines, and the prompt line after sign-out, all reported together.

## Gotchas

- The header and the language button are on the gate too, so they do not prove it. Check the prompt text.
- The Google button comes from Google's sign-in widget, and its label follows the browser language. In this Chrome profile it reads "Continuar con Google" while the app text is English. Do not match on that label, and no flow clicks it.
- Only `session-admin` leaves the gate in this harness, and it waits for the app's anonymous connection before it writes the token. Run `session-signed-out` before checking the gate, because the scratch profile keeps an injected token until it is removed.
- The gate proves the screen, not the sign-in. A real Google sign-in is outside this harness, so report the sign-in itself as not verified.
