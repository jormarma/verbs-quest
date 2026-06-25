#!/usr/bin/env node
//
// Smoke test for the admin verb-category flow on SpacetimeDB.
// Runs against an already-published `verbs-quest` database. The caller is
// assumed to be the admin identity (same one that published the module).
//
// Equivalent to the old `verify-admin-verbs-smoke.mjs` Postgres script but
// driven through `spacetime sql` + `spacetime call`.

import process from 'node:process'
import { spawnSync } from 'node:child_process'

const DEFAULT_DB = process.env.SPACETIMEDB_DB ?? 'verbs-quest'
const DEFAULT_SERVER = process.env.SPACETIMEDB_SERVER ?? 'local'

function parseArgs(argv) {
  const args = {
    db: DEFAULT_DB,
    server: DEFAULT_SERVER,
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--db') {
      args.db = argv[++i] ?? ''
      continue
    }
    if (token === '--server') {
      args.server = argv[++i] ?? ''
      continue
    }
    if (token === '--help' || token === '-h') {
      printHelp()
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${token}`)
  }

  return args
}

function printHelp() {
  console.log(
    [
      'Smoke test for the admin verb-category flow on SpacetimeDB.',
      '',
      'Usage:',
      '  node scripts/verify-admin-verbs-smoke.mjs [--db <name>] [--server <name>]',
      '',
      'Defaults:',
      `  --db      ${DEFAULT_DB}`,
      `  --server  ${DEFAULT_SERVER}`,
    ].join('\n'),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI wrappers
// ─────────────────────────────────────────────────────────────────────────────

function runSql(server, db, sql) {
  const result = spawnSync(
    'spacetime',
    ['sql', '--server', server, db, sql],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(
      `spacetime sql failed (status=${result.status}):\n${result.stderr ?? result.stdout ?? ''}`,
    )
  }
  // The CLI emits a table-formatted block. Strip the warning banner (which
  // goes to stderr) and keep the last non-empty line, which is the value row.
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('-') && !/^[a-z_]/i.test(line))
    .pop()
}

function runCall(server, db, reducer, ...args) {
  const result = spawnSync(
    'spacetime',
    ['call', '--server', server, db, reducer, ...args],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(
      `spacetime call ${reducer} failed (status=${result.status}):\n${result.stderr ?? result.stdout ?? ''}`,
    )
  }
  return (result.stdout ?? '').trim()
}

function expectCallFailure(server, db, reducer, ...args) {
  const result = spawnSync(
    'spacetime',
    ['call', '--server', server, db, reducer, ...args],
    { encoding: 'utf8' },
  )
  if (result.status === 0) {
    throw new Error(
      `Expected ${reducer} to fail but it succeeded. Output:\n${result.stdout ?? ''}`,
    )
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

function jsonArg(value) {
  return JSON.stringify(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertions
// ─────────────────────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function containsInsensitive(value, fragment) {
  return value.toLowerCase().includes(fragment.toLowerCase())
}

function parseCategoryCountRows(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [categoryRaw, countRaw] = line.split('|')
      return { category: Number(categoryRaw), count: Number(countRaw) }
    })
    .filter(({ category, count }) => Number.isInteger(category) && Number.isInteger(count))
}

function parsePipeNumbers(line, expectedLength) {
  const parts = line.split('|').map(Number)
  if (parts.length !== expectedLength) {
    throw new Error(`Expected ${expectedLength} tuple values, got: ${line}`)
  }
  return parts
}

// ─────────────────────────────────────────────────────────────────────────────
// Smoke checks
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2))
  const { server, db } = args

  console.log('Running admin verbs smoke checks...')

  // 1. All three categories must exist with at least one verb.
  // (SpacetimeDB SQL doesn't support GROUP BY — count per category directly.)
  const categoryCounts = new Map()
  for (const c of [1, 2, 3]) {
    const count = Number(
      runSql(server, db, `SELECT COUNT(*) AS n FROM verb WHERE category = ${c};`),
    )
    categoryCounts.set(c, count)
    assert(count > 0, `Category ${c} is missing or empty`)
  }

  // 2. Exactly one category should be active at a time, matching app_settings.
  const activeCategory = Number(
    runSql(
      server,
      db,
      'SELECT active_verb_category FROM app_setting WHERE id = 1;',
    ),
  )
  assert([1, 2, 3].includes(activeCategory), 'active_verb_category must be 1, 2, or 3')

  let activeTotal = 0
  const activeMap = new Map()
  for (const c of [1, 2, 3]) {
    const count = Number(
      runSql(server, db, `SELECT COUNT(*) AS n FROM verb WHERE active = true AND category = ${c};`),
    )
    activeMap.set(c, count)
    activeTotal += count
  }

  assert(activeTotal > 0, 'No active verbs found')
  assert(
    (activeMap.get(activeCategory) ?? 0) > 0,
    'Configured active category has no active verbs',
  )
  for (const c of [1, 2, 3]) {
    if (c !== activeCategory) {
      assert(
        (activeMap.get(c) ?? 0) === 0,
        `Category ${c} should not have active verbs`,
      )
    }
  }

  // 3. Find an admin and a student to drive the rest of the checks.
  // (SpacetimeDB SQL doesn't support ORDER BY — just take any matching row.)
  const adminIdentity = runSql(
    server,
    db,
    "SELECT identity FROM user WHERE role = 'admin' LIMIT 1;",
  )
  const studentIdentity = runSql(
    server,
    db,
    "SELECT identity FROM user WHERE role = 'student' LIMIT 1;",
  )
  assert(adminIdentity, 'No admin user found')
  assert(studentIdentity, 'No student user found')

  // 4. Admin can update app settings; non-admin cannot.
  runCall(
    server,
    db,
    'update_app_settings',
    jsonArg(65),
    jsonArg(6),
  )
  const afterUpdate = runSql(
    server,
    db,
    'SELECT time_limit_seconds, verbs_per_level FROM app_setting WHERE id = 1;',
  )
  const [timeLimit, verbsPerLevel] = parsePipeNumbers(afterUpdate, 2)
  assert(timeLimit === 65, `expected time_limit_seconds=65, got ${timeLimit}`)
  assert(verbsPerLevel === 6, `expected verbs_per_level=6, got ${verbsPerLevel}`)

  // Restore default
  runCall(server, db, 'update_app_settings', jsonArg(180), jsonArg(5))

  // 5. Invalid values are rejected by the reducer.
  const lowLimitErr = expectCallFailure(
    server,
    db,
    'update_app_settings',
    jsonArg(59),
    jsonArg(5),
  )
  assert(
    containsInsensitive(lowLimitErr, 'time_limit_seconds must be between'),
    'time_limit_seconds range check did not fire',
  )
  const lowVerbsErr = expectCallFailure(
    server,
    db,
    'update_app_settings',
    jsonArg(180),
    jsonArg(4),
  )
  assert(
    containsInsensitive(lowVerbsErr, 'verbs_per_level must be between'),
    'verbs_per_level range check did not fire',
  )

  // 6. Admin can switch the active verb category.
  runCall(server, db, 'set_active_verb_category', jsonArg(2))
  const afterSwitch = Number(
    runSql(server, db, 'SELECT active_verb_category FROM app_setting WHERE id = 1;'),
  )
  assert(afterSwitch === 2, `expected active_verb_category=2, got ${afterSwitch}`)

  const inCategory2 = Number(
    runSql(server, db, 'SELECT COUNT(*) AS n FROM verb WHERE active = true AND category = 2;'),
  )
  const outsideCategory2 = Number(
    runSql(server, db, 'SELECT COUNT(*) AS n FROM verb WHERE active = true AND category <> 2;'),
  )
  assert(inCategory2 > 0, 'Category 2 should have active verbs after switch')
  assert(outsideCategory2 === 0, 'Other categories should not have active verbs')

  // Restore category 1
  runCall(server, db, 'set_active_verb_category', jsonArg(1))

  console.log('OK: all admin verbs smoke checks passed.')
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Smoke test failed: ${message}`)
  process.exit(1)
}