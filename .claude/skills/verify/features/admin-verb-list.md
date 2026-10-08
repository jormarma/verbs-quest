# Admin verb list

Admins choose which verb list players practise from the Verbs tab of the admin dashboard. The tab says that only one category is active at a time, and it shows a card for each list: Basic (Category 1), Complete (Category 2), and Extremely Complete (Category 3), each with its total verbs and total levels. The active card carries an ACTIVE badge, and the Apply list button, which stays disabled until the selection differs from the active list, applies a different choice to the database. The active list decides which verbs and levels players see.

## Sub-features

- `verbs-tab`: the Verbs tab opens with the heading "Choose the verb list used by players".
- `verbs-totals`: each card shows its total verbs and total levels, which are 75 and 15, 83 and 17, and 319 and 64.
- `verbs-active`: the active card shows the ACTIVE badge, and the line "Selected list: Basic (Category 1) (75 verbs, 15 levels)." names it.
- `verbs-apply`: choosing another card enables Apply list, and pressing it shows "Verb list updated successfully" and changes the active verbs in the database.

## How to get to it (user POV)

- Sign in as the admin. The admin dashboard has Stats, Settings, and Verbs tabs.
- Choose Verbs.
- Choose a category card, then choose Apply list.

## Driving it with control.mjs

Preconditions:

- `node .claude/skills/verify/scripts/control.mjs session-admin` has passed in this run, which opens the admin dashboard.
- Baseline: Category 1 is active. `node .claude/skills/verify/scripts/control.mjs sql "SELECT COUNT(*) AS n FROM verb WHERE active = true"` returns `"n": 75`. The last step below restores it.

- **Tab and cards.** Run `node .claude/skills/verify/scripts/control.mjs click Verbs --exact`, then `node .claude/skills/verify/scripts/control.mjs expect "Choose the verb list used by players" --exact --shot admin-verb-list`. Expect two PASS lines and the screenshot. The screenshot shows the Basic card with the ACTIVE badge and the totals 75 and 15, and the Complete card with 83 and 17. The Extremely Complete totals fall below the fold, so the SQL counts in the next steps are the proof for them.
- **Active line.** Run `node .claude/skills/verify/scripts/control.mjs expect "Selected list: Basic (Category 1) (75 verbs, 15 levels)." --exact`. Expect the PASS line.
- **Apply Category 2.** Run `node .claude/skills/verify/scripts/control.mjs click "Complete (Category 2)"`, then `node .claude/skills/verify/scripts/control.mjs click "Apply list" --exact`, then `node .claude/skills/verify/scripts/control.mjs expect "Verb list updated successfully" --shot admin-verb-list-applied`. Expect a `PASS: clicked button "Apply list"` line and the success line. Then run the active-count SQL from the preconditions and expect `"n": 83`.
- **Restore Category 1.** Run `node .claude/skills/verify/scripts/control.mjs click "Basic (Category 1)"`, then `node .claude/skills/verify/scripts/control.mjs click "Apply list" --exact`, then `node .claude/skills/verify/scripts/control.mjs expect "Selected list: Basic (Category 1) (75 verbs, 15 levels)." --exact`. Then run the active-count SQL and expect `"n": 75`.
- **Proof.** The two screenshots, the SQL count after the apply (83) and after the restore (75), and the success line.

## Gotchas

- Apply list stays disabled until the selected card differs from the active one. A disabled button is a state, not a failure, so select a different card before you press it.
- Card names match as substrings, so click them without `--exact`. The `--exact` flag is for the Apply list button and the other short labels.
- Applying a list lowers any player's level cap that exceeds the new list's level count, in the server reducer `set_active_verb_category`. Category 1 has 15 levels and Category 2 has 17, so the scratch admin's cap of 15 is not lowered by either.
- Restore Category 1 at the end of any run that applies another list. The quest and practice recipes assume Category 1, where level 1 holds BE, BECOME, BEGIN, BITE, and BLEED.
