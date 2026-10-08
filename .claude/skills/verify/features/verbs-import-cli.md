# Verb import CLI

`scripts/import-verbs-csv.mjs` loads `verbs.csv` into the `verb` table of a SpacetimeDB database. Without `--execute` it prints a per-category summary and stops, so a plain run is a safe preview. With `--execute` it empties the table with `truncate_verbs` and then upserts each of the 477 rows, leaving 75, 83, and 319 verbs in categories 1, 2, and 3, with only category 1 active because the importer marks category 1 rows active and the rest inactive.

## Sub-features

- `import-dry-run`: prints the `Import summary` and a `Dry-run complete` line, and changes nothing.
- `import-execute`: replaces the verb table and prints `Import applied successfully.`
- `import-counts`: after an execute, the table holds 75, 83, and 319 verbs by category, and 75 active verbs.

## How to get to it (user POV)

- A developer runs `node scripts/import-verbs-csv.mjs` from the repo root to preview the import, then adds `--execute` to apply it. Both forms take `--db` and `--server`, which name the database and the SpacetimeDB URL.
- The package scripts `verbs:import:dry` and `verbs:import` run the same importer against the default target, the `local` server and the `verbs-quest` database.

## Driving it with the importer CLI

Preconditions:

- `node .claude/skills/verify/scripts/doctor.mjs` reports healthy, so the scratch SpacetimeDB answers on the run's port.
- Run every importer command inside a subshell that loads the run's target, so the variables do not leak into the shell: `( set -a; . verify-evidence/current/run.env; set +a; node scripts/import-verbs-csv.mjs --db "$DB_NAME" --server "$STDB_URL" )`.
- Never run `pnpm verbs:import:dry`, `pnpm verbs:import`, or `pnpm verbs:verify:smoke` here, because they target the user's `local` server.

- **Dry run changes nothing.** Run the subshell command above, with no other flags. Expect the lines `- total rows: 477`, `- category 1: 75 verbs, 15 levels, 75 active`, `- category 2: 83 verbs, 17 levels, 0 active`, `- category 3: 319 verbs, 64 levels, 0 active`, and then `Dry-run complete. Re-run with --execute to apply changes (target: $STDB_URL/verbs-quest-verify).` Then run `node .claude/skills/verify/scripts/control.mjs sql "SELECT COUNT(*) AS n FROM verb"`, and expect `"n": 477`, the same count as before the dry run.
- **Execute.** Run `( set -a; . verify-evidence/current/run.env; set +a; node scripts/import-verbs-csv.mjs --execute --db "$DB_NAME" --server "$STDB_URL" )`. Expect the same summary and then `Import applied successfully.` In the run that wrote this recipe, the execute took about 12 seconds.
- **Counts per category.** Run `node .claude/skills/verify/scripts/control.mjs sql "SELECT COUNT(*) AS n FROM verb WHERE category = 1"`, then the same with `category = 2` and `category = 3`. Expect `"n": 75`, `"n": 83`, and `"n": 319`. Then run `node .claude/skills/verify/scripts/control.mjs sql "SELECT COUNT(*) AS n FROM verb WHERE active = true"` and expect `"n": 75`.
- **Proof.** Redirect each importer subshell into the evidence folder, for example `( ... ) > verify-evidence/current/logs/import-execute.log 2>&1`, and keep the dry-run output in `import-dry-run.log` the same way. Report the row count before and after the dry run, and the three category counts and the active count after the execute.

## Gotchas

- Without `--db` and `--server` the importer targets the `local` server and the `verbs-quest` database, which is the user's data. Pass both every time.
- The dry run is a preview only, and it prints its target. Read the target line before adding `--execute`.
- `--execute` runs `truncate_verbs` and then one `upsert_verb` call per row, so the table is empty while the import runs. An interrupted execute leaves the table partly loaded. Run the execute again, which empties and reloads the table, and wait for `Import applied successfully.` before reading counts.
- The importer makes category 1 active and the other categories inactive, whatever an admin applied before. After an execute, check the active count instead of assuming the admin's selection survived.
