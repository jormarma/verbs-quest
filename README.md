# Verbs Quest

## Run

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

## Full verification

```bash
pnpm verify
```

Runs lint + build + local DB smoke checks.

## Import verbs from CSV

The verb source file is [`verbs.csv`](./verbs.csv) with header:

```csv
category,present,past,participle
```

Commands:

```bash
# dry run (no DB writes)
pnpm verbs:import:dry

# execute import
pnpm verbs:import
```

Import behavior:

- `present` -> `verbs.infinitive`
- `past` -> `verbs.past_simple`
- `participle` -> `verbs.past_participle`
- `category` is stored in `verbs.category`
- category `1` is initially active; categories `2` and `3` are inactive until selected by admin

## Admin verbs list categories

In Admin -> `Verbs` tab, admin selects one active list:

- `1` basic
- `2` complete
- `3` extremely complete

When applying a category:

- active verbs are switched atomically
- app setting `active_verb_category` is updated
- user level caps are clamped to the new maximum level for that category

## Multi-answer verb forms

For answers containing `/` (for example `burnt/burned`):

- any listed variant is accepted as correct
- wrong-answer feedback shows all accepted variants separated by ` / `

## Manual verification checklist

1. Import CSV with `pnpm verbs:import`.
2. Login as admin and open `Verbs` tab.
3. Switch category to `2`, apply, refresh, and verify category persists.
4. Switch category to `3`, apply, and verify more levels are available to players.
5. Start a run with a verb that has alternative forms (e.g. `burn`), verify both alternatives are accepted.
6. Submit a wrong answer and verify all valid alternatives are shown in feedback.

## Automated smoke check (local DB)

```bash
pnpm verbs:verify:smoke
```

This validates:

- all 3 categories exist with data
- only one category is active at a time
- admin can update app settings while non-admin updates are blocked
- app settings range constraints are enforced
- admin can switch active category
- switching from larger to smaller category clamps user level caps
- student cannot switch active category
- invalid level attempts above active category max are rejected
