# verbs-quest feature map

This folder maps the user-visible behavior of verbs-quest to the commands and proof that verify it. Read this index before driving the app, then open the feature file that matches the change. Each feature file is a recipe: its user path, its preconditions, its exact commands, and what counts as proof.

## Baseline preconditions

- Launch the stack with `.claude/skills/verify/scripts/launch.sh`, then run `node .claude/skills/verify/scripts/doctor.mjs` and require `doctor: healthy (15/15 checks)`.
- The scratch database is `verbs-quest-verify` on the run's SpacetimeDB port, loaded from `verbs.csv`: 75, 83, and 319 verbs in categories 1, 2, and 3, with category 1 active.
- The scratch admin is the CLI login identity. The verb import clamps its level cap to the 15 levels of the active list, so levels 16 and above do not exist for it.
- Start the session each feature needs: `node .claude/skills/verify/scripts/control.mjs session-admin` for the admin dashboard and the player lobby, or `session-signed-out` for the sign-in gate.
- Never drive an instance that the current run did not launch.

## Driving conventions

- Start each recipe from the baseline. If a recipe changes state, restore it in its last step. For example, apply Category 1 again after applying Category 2.
- Click by accessible name with `control.mjs click NAME`, and add `--exact` when the name must match in full. Do not click by position.
- The app is English by default, and every expected string in these files is English.
- Use `control.mjs` for browser steps and SQL reads, `flows/level-run.mjs` for whole level runs, and the importer CLI for imports.

## Proof and skip reporting

- Show the action and its result. A `PASS` line alone is not enough; add a screenshot of the state, or a SQL read of the rows the action wrote.
- Quest and practice proof is the flow JSON in `verify-evidence/current/flows/`, with every assertion listed.
- If a path cannot be reached, report the command you tried and the precondition that was not met.
- Do not report an entry point as verified when you drove a different one. Name the path you drove.

## Feature entry contract

Each feature file has an H1 title and one paragraph that describes the user-visible behavior. After that come four H2 sections, in this order:

1. `Sub-features` lists the behaviors as short IDs, one line each.
2. `How to get to it (user POV)` lists the user's entry points.
3. A `Driving it with` heading that names the harness, such as `Driving it with control.mjs`, starts with `Preconditions:`, then gives labeled steps. Each step has an exact command and the observable result that proves it.
4. `Gotchas` lists the traps that waste a run or make a result untrustworthy.

Keep implementation detail out of the map. Name user paths, stable on-screen text, required state, commands, and proof.

## Features

- [Sign-in gate](./sign-in-gate.md): the signed-out screen, its prompt, the controls it hides, and its return after sign-out.
- [Verb import CLI](./verbs-import-cli.md): the importer's dry run, its execute mode, and the per-category counts it leaves behind.
- [Admin verb list](./admin-verb-list.md): the admin Verbs tab, its category totals, and applying a list.
- [Quest run](./quest-run.md): a timed level from countdown to finish, with and without misses, and what it saves.
- [Practice run](./practice-run.md): an untimed level that saves nothing and finishes with a result.
