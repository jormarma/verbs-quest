---
name: verify
description: Verify the verbs-quest app, a React and Vite irregular-verb game with a player lobby, quest and practice runs, an admin dashboard, and a SpacetimeDB module, plus its verb import CLI. Launches an isolated copy on spare ports, checks it with a read-only doctor, drives the real UI in headless Chrome, and keeps screenshots and database checks under verify-evidence. Use when asked to verify, smoke test, prove, or demo a change to the game, the admin verb list, the sign-in gate, or the verb import.
---

# verify: verbs-quest

verbs-quest is a React 19 and Vite game for irregular past-tense verbs. It runs on a SpacetimeDB 2.11 module in `spacetimedb/`, and its admin dashboard lets an admin choose the active verb list. This skill proves behavior through the browser UI (the signed-out gate, the admin Verbs tab, the player lobby, quest runs, and practice runs) and through the verb import CLI. The feature map in `features/` lists each behavior with its user path and its proof.

## Boundaries

- Drive only the stack this skill launches. Its ports come from SpacetimeDB 3100 to 3199, Vite 5187 to 5199, and Chrome DevTools 9340 to 9349. Never use port 3000 (the user's SpacetimeDB), 4173, or 5173, the `verbs-quest` database, or maincloud.
- The package scripts `verbs:import`, `verbs:import:dry`, `verbs:verify:smoke`, `stdb:publish:local`, and `stdb:publish:maincloud` target the user's servers. Do not run them while verifying. Every command in this skill uses the scratch database and server recorded in `verify-evidence/current/run.env`.
- Never print, log, or commit the CLI auth token. `control.mjs session-admin` reads it from `spacetime login show --token` and writes it into the scratch Chrome profile, which cleanup deletes.
- Google sign-in is not exercised. The admin session uses the CLI login token with the Google sign-in flag set, so every driven screen is the signed-in app. The signed-out gate has its own feature, which checks the gate screen.

## Launch

Prerequisites, which the launcher also checks: the `spacetime` CLI logged in (`spacetime login show --token` prints an auth token); `node`, `nc`, `lsof`, `pgrep`, `ps`, and `perl` on PATH; `pnpm install` done in the repo (`node_modules/vite` exists); and Google Chrome at `/Applications/Google Chrome.app`. Publishing compiles `spacetimedb/` with Rust, so a Rust toolchain of rustc 1.96 or newer must be installed.

From the repo root:

```bash
.claude/skills/verify/scripts/launch.sh
```

The launcher runs these steps in order:

1. Picks the first free port in each range.
2. Starts SpacetimeDB detached on that port, with `--in-memory` and a data directory inside the run's folder under `/tmp/verbs-quest-verify/`. The explicit data directory keeps it away from the user's default one.
3. Publishes `spacetimedb/` as the database `verbs-quest-verify` with `--delete-data=always`. The line `Could not find wasm-opt` in `logs/publish.log` is expected; the module ships unoptimized.
4. Imports `verbs.csv` into that database with `--execute`, which loads 477 verbs.
5. Starts Vite detached with `VITE_SPACETIMEDB_URI` and `VITE_SPACETIMEDB_DB` pointing at the scratch server, using `--strictPort`.
6. Starts headless Chrome detached, with remote debugging on its port and a scratch profile.
7. Writes `run.env` into the run's folder under `verify-evidence/` and points `verify-evidence/current` at that run.

The launcher prints `launched run`, the run ID, and four lines: the SpacetimeDB URL, the app URL, the Chrome DevTools URL, and the evidence folder. `verify-evidence/current/run.env` holds the same values and the process IDs.

A failed step makes the launcher stop what it started, run cleanup, and exit non-zero. The error names the log that failed, under the run's `logs/` folder. The launcher also refuses to start while the run in `verify-evidence/current` still has a live process; clean that run up first.

Teardown is the Cleanup section below. A successful launch stays up until cleanup runs.

## Doctor

Read-only. Run it after launch, and again before driving whenever a result looks wrong:

```bash
node .claude/skills/verify/scripts/doctor.mjs
```

A healthy run prints `doctor: healthy (15/15 checks)` and exits 0. The checks are:

- `run recorded`: `verify-evidence/current/run.env` exists and names the run.
- `scratch state present`: the run's folder under `/tmp/verbs-quest-verify/` exists.
- `SpacetimeDB port owned by this run`: the listener on the run's SpacetimeDB port has the scratch path on its command line.
- `SpacetimeDB answers ping`: `spacetime server ping` reports `Server is online`.
- `Vite port owned by this run`: the listener on the run's Vite port runs `vite --port` with that port.
- `app serves index.html`: the app URL answers HTTP 200 with `id="root"`.
- `Chrome DevTools port owned by this run`: the listener on the run's Chrome port has the scratch path on its command line.
- `Chrome DevTools endpoint answers`: `/json/version` returns a `webSocketDebuggerUrl`.
- `run ports avoid the user defaults`: none of the run's ports is 3000, 4173, or 5173.
- `CLI login present (token not printed)`: `spacetime login show --token` shows an auth token.
- `scratch DB has category 1 verbs`, `category 2`, and `category 3`: the row counts match `verbs.csv` (75, 83, and 319).
- `scratch DB has an admin user`: at least one `user` row has the role `admin`.
- `lobby verb list is populated`: at least one verb is active.

On any FAIL, do not drive. Read the matching log under `verify-evidence/current/logs/`, run Cleanup, and launch again. A run that was already cleaned up fails at once with `run still active`.

## Drive

Start from a healthy doctor. `control.mjs` drives the first tab of the run's Chrome over CDP. Each command prints `PASS:` or `FAIL:` and exits 0 or 1. Run every command from the repo root.

### Sessions

```bash
node .claude/skills/verify/scripts/control.mjs session-admin
node .claude/skills/verify/scripts/control.mjs session-signed-out
```

`session-admin` waits until the app's anonymous connection has stored its token, then writes the CLI login token and the Google sign-in flag into localStorage and reloads. The admin dashboard appears with a "Preview as student" button that opens the player lobby. Skipping the wait lets the anonymous connection overwrite the injected token, and the page then sticks at "Choose your display name". `session-signed-out` removes both keys and reloads to the sign-in gate.

### Steps

`control.mjs` commands, which act on the run's Chrome tab as it stands:

- `goto` opens the app root. `goto PATH` opens a path under it.
- `click NAME` clicks a button by its accessible name. `--exact` requires the whole name, and `--role link` clicks another role.
- `expect TEXT` waits up to 10 seconds for visible text. `--exact` requires the whole text, and `--shot NAME` also saves `screens/NAME.png`.
- `absent TEXT` passes when the text is not visible within 5 seconds. `--exact` applies as for `expect`.
- `press KEY` presses one key, such as `Enter`. `type TEXT` types into the focused element; `--delay MS` sets the gap between keys, 50 by default.
- `text` prints the visible page text, up to 4000 characters.
- `shot NAME` saves `screens/NAME.png`.
- `sql "SELECT ..."` runs a read-only query against the scratch database and prints JSON rows. Anything other than `SELECT` is refused.
- `call REDUCER ARGS...` calls a reducer on the scratch database. It changes state, so use it only to seed a scratch case that the UI cannot reach, and say so in the report.

### Flows

A flow drives a whole level through the UI and checks the database. Use flows for quest and practice proof:

```bash
node .claude/skills/verify/scripts/flows/level-run.mjs --mode quest --level 1 --wrong 1
node .claude/skills/verify/scripts/flows/level-run.mjs --mode quest --level 1 --wrong 0
node .claude/skills/verify/scripts/flows/level-run.mjs --mode practice --level 1 --wrong 2
```

- `--mode` is `quest` or `practice`. `--level` is a level in the active list and within the user's cap. `--wrong` is the number of deliberate misses, sent as `zzz` on the first answers; the app asks each missed verb again. `--pace-ms` sets the wait before each answer, 900 by default.
- Exit 0 means every assertion passed. Each run writes a JSON file into `flows/`, named by mode, level, and misses, such as `flows/quest-level1-wrong1.json`. It holds each answer and its feedback, the database rows before and after, and each assertion.
- `NOTE  known issue` lines report app defects that the flow observed. They are recorded in the JSON `knownIssues` and do not fail the run. See Known app gaps below.

### Feature map

`features/README.md` indexes the five features: the sign-in gate, the verb import CLI, the admin verb list, quest runs, and practice runs. Each feature file gives the user paths, the commands, and the proof. Verify a change by driving every feature it touches, and report any you did not drive.

## Evidence

Everything a run produces lives in the run's folder under `verify-evidence/` at the repo root. The folder is git-ignored, and cleanup keeps it.

- `screens/` holds screenshots named for the feature and the state, such as `admin-verb-list.png` or `quest-finished-level1-wrong1.png`.
- `flows/` holds one JSON file per flow run: the answers with their feedback, the finish heading, the `game_session` rows before and after, the `user_attempt` rows before and after, `knownIssues`, and every assertion with its result.
- `logs/` holds `stdb.log`, `publish.log`, `import.log`, `vite.log`, and `chrome.log` from the launch.
- `run.env` holds the ports, process IDs, scratch path, git HEAD, and start and cleanup times. It never holds the token.
- `verify-evidence/current` is a symlink to the newest run.

Proof standards:

- Drive the real UI for the behavior under test. The only steps that skip the UI are the admin session injection, the CLI import, and the SQL reads; each feature file names the ones it uses.
- Capture the action and its result: a `PASS` line for the expected text, a screenshot after the action, and the database rows the action wrote.
- Check side effects, not only the screen. A quest adds exactly one `game_session` row with the right level, error count, and perfect flag, and the server stores `unlocked` for a perfect run and `maintained` otherwise. Practice adds no row and leaves `user_attempt` unchanged.
- Use no mocks. Everything runs on the real SpacetimeDB module and the real Vite app, against the scratch database only.
- Report exactly what you drove. A check you did not run is reported as not verified, never as passed.

After cleanup, confirm the evidence with `ls verify-evidence/current/screens verify-evidence/current/flows`.

## Cleanup

```bash
.claude/skills/verify/scripts/cleanup.sh
```

Cleanup stops only the processes that this run started. A process belongs to the run when its command line carries the run's scratch path, or, for Vite, when it has `--port` with the run's Vite port. That covers the PIDs recorded in `run.env` and anything listening on the run's ports. Cleanup sends SIGTERM, waits up to 10 seconds, and sends SIGKILL to anything left. Then it deletes the run's scratch folder under `/tmp/verbs-quest-verify/` (the scratch database and the Chrome profile that holds the admin token), appends `CLEANED_AT` to `run.env`, and reports the three ports as closed. Exit 0 means the ports are closed and no process from the scratch path remains.

Run cleanup:

- when you finish driving, every time;
- after a failed launch, which launch also does on its own;
- before any new launch, if launch reports a live run.

To clean an older run, pass its folder name under `verify-evidence/` as the argument. That is the run ID that `launch.sh` printed after `launched run`.

## Helpers

| Script | Run it as | Purpose |
| --- | --- | --- |
| `scripts/launch.sh` | `.claude/skills/verify/scripts/launch.sh` | Start the isolated stack and record it |
| `scripts/doctor.mjs` | `node .claude/skills/verify/scripts/doctor.mjs` | Read-only health check of the current run |
| `scripts/control.mjs` | `node .claude/skills/verify/scripts/control.mjs COMMAND` | One session, browser, or SQL step |
| `scripts/flows/level-run.mjs` | `node .claude/skills/verify/scripts/flows/level-run.mjs --mode quest --level 1 --wrong 1` | Drive a whole quest or practice level and check the database |
| `scripts/cleanup.sh` | `.claude/skills/verify/scripts/cleanup.sh` | Stop the run's processes, delete scratch state, keep evidence |
| `scripts/lib.mjs` | Imported by the Node helpers; not run directly | Run loading, SQL, browser connection, and argument parsing |

The Node helpers need `playwright-core`, which `launch.sh` installs into `scripts/` with `npm ci` the first time it runs.

## Known app gaps

These app defects are real and verified. The skill reports them and does not fix them.

- Nothing subscribes to the `game_session` and `user_attempt` tables, so the client reads an empty cache. "TOP 3 TIMES" stays on "Loading...", and a perfect run shows "Good job, but you need a perfect run to unlock the next level." even though the server stored `unlocked`. The reading code is in `src/lib/utils/sync.ts`, and the perfect-run branches are in `src/App.tsx`. The quest flow reports both as NOTE lines.

## Maintenance

When the app changes, run `/maintain-verification-skill` to bring this skill and its feature map back in line with the code.
