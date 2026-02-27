#!/usr/bin/env node

import process from 'node:process'
import { spawnSync } from 'node:child_process'

const DEFAULT_DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function parseArgs(argv) {
  const args = {
    dbUrl: DEFAULT_DB_URL,
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--db-url') {
      args.dbUrl = argv[++i] ?? ''
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
      'Smoke test for admin verb-category flow.',
      '',
      'Usage:',
      '  node scripts/verify-admin-verbs-smoke.mjs [--db-url <url>]',
      '',
      'Default DB URL:',
      `  ${DEFAULT_DB_URL}`,
    ].join('\n')
  )
}

function runPsql(dbUrl, sql, expectFailure = false) {
  const result = runPsqlRaw(dbUrl, sql)
  const { stdout, stderr, status } = result

  if (!expectFailure && status !== 0) {
    throw new Error(stderr || `psql exited with status ${status}`)
  }

  if (expectFailure && status === 0) {
    throw new Error(`Expected failure but command succeeded. Output: ${stdout}`)
  }

  return result
}

function runPsqlRaw(dbUrl, sql) {
  const result = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], {
    encoding: 'utf8',
  })

  const stdout = result.stdout?.trim() ?? ''
  const stderr = result.stderr?.trim() ?? ''
  const status = result.status ?? 1

  return { stdout, stderr, status }
}

function queryLines(dbUrl, sql) {
  const { stdout } = runPsql(dbUrl, sql)
  if (!stdout) return []
  return stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function containsInsensitive(value, fragment) {
  return value.toLowerCase().includes(fragment.toLowerCase())
}

function parseCategoryCountRows(lines) {
  const map = new Map()
  for (const line of lines) {
    const [categoryRaw, countRaw] = line.split('|')
    const category = Number(categoryRaw)
    const count = Number(countRaw)
    if (Number.isInteger(category) && Number.isInteger(count)) {
      map.set(category, count)
    }
  }
  return map
}

function parsePipeNumberTuple(value, expectedLength) {
  const parts = value.split('|').map((part) => Number(part))
  assert(parts.length === expectedLength, `Expected ${expectedLength} tuple values, got: ${value}`)
  assert(parts.every((num) => Number.isFinite(num)), `Tuple contains non-numeric values: ${value}`)
  return parts
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const dbUrl = args.dbUrl

  console.log('Running admin verbs smoke checks...')

  const categoryRows = queryLines(
    dbUrl,
    `select category || '|' || count(*) from public.verbs group by category order by category;`
  )
  const categoryCounts = parseCategoryCountRows(categoryRows)

  assert(categoryCounts.has(1) && categoryCounts.get(1) > 0, 'Category 1 is missing or empty')
  assert(categoryCounts.has(2) && categoryCounts.get(2) > 0, 'Category 2 is missing or empty')
  assert(categoryCounts.has(3) && categoryCounts.get(3) > 0, 'Category 3 is missing or empty')

  const activeCategoryLine = queryLines(
    dbUrl,
    'select active_verb_category::text from public.app_settings where id = 1;'
  )[0]
  const activeCategory = Number(activeCategoryLine)
  assert([1, 2, 3].includes(activeCategory), 'active_verb_category must be 1, 2, or 3')

  const activeRows = queryLines(
    dbUrl,
    `select category || '|' || count(*) from public.verbs where active = true group by category order by category;`
  )
  const activeCounts = parseCategoryCountRows(activeRows)
  const activeTotal = [...activeCounts.values()].reduce((acc, n) => acc + n, 0)

  assert(activeTotal > 0, 'No active verbs found')
  assert((activeCounts.get(activeCategory) ?? 0) > 0, 'Configured active category has no active verbs')
  for (const category of [1, 2, 3]) {
    if (category !== activeCategory) {
      assert((activeCounts.get(category) ?? 0) === 0, `Category ${category} should not have active verbs`)
    }
  }

  const adminId = queryLines(
    dbUrl,
    "select id::text from public.users where role = 'admin' order by created_at limit 1;"
  )[0]
  const studentId = queryLines(
    dbUrl,
    "select id::text from public.users where role = 'student' order by created_at limit 1;"
  )[0]

  assert(Boolean(adminId), 'No admin user found')
  assert(Boolean(studentId), 'No student user found')

  const adminSettingsUpdateSql = [
    'begin;',
    'set local role authenticated;',
    `select set_config('request.jwt.claim.role','authenticated', true);`,
    `select set_config('request.jwt.claim.sub','${adminId}', true);`,
    "update public.app_settings set time_limit_seconds = 65, verbs_per_level = 6 where id = 1;",
    'select time_limit_seconds::text || \'|\' || verbs_per_level::text from public.app_settings where id = 1;',
    'rollback;'
  ].join(' ')

  const adminSettingsLines = queryLines(dbUrl, adminSettingsUpdateSql).filter((line) => !['BEGIN', 'SET', 'ROLLBACK', 'authenticated', adminId].includes(line))
  assert(adminSettingsLines.includes('65|6'), 'Admin could not update app settings in transaction')

  const studentSettingsUpdateSql = [
    'begin;',
    'set local role authenticated;',
    `select set_config('request.jwt.claim.role','authenticated', true);`,
    `select set_config('request.jwt.claim.sub','${studentId}', true);`,
    'update public.app_settings set time_limit_seconds = 70 where id = 1;',
    'rollback;'
  ].join(' ')

  const studentSettingsResult = runPsqlRaw(dbUrl, studentSettingsUpdateSql)
  if (studentSettingsResult.status === 0) {
    assert(
      containsInsensitive(studentSettingsResult.stdout, 'UPDATE 0'),
      'Non-admin settings update must not change any rows'
    )
  } else {
    assert(
      containsInsensitive(studentSettingsResult.stderr, 'row-level security') ||
        containsInsensitive(studentSettingsResult.stderr, 'permission denied'),
      'Non-admin settings update did not fail with an expected policy error'
    )
  }

  const invalidTimeLimitSql = [
    'begin;',
    'set local role authenticated;',
    `select set_config('request.jwt.claim.role','authenticated', true);`,
    `select set_config('request.jwt.claim.sub','${adminId}', true);`,
    'update public.app_settings set time_limit_seconds = 59 where id = 1;',
    'rollback;'
  ].join(' ')

  const invalidTimeLimit = runPsql(dbUrl, invalidTimeLimitSql, true)
  assert(
    containsInsensitive(invalidTimeLimit.stderr, 'app_settings_time_limit_seconds_check'),
    'time_limit_seconds constraint was not enforced'
  )

  const invalidVerbsPerLevelSql = [
    'begin;',
    'set local role authenticated;',
    `select set_config('request.jwt.claim.role','authenticated', true);`,
    `select set_config('request.jwt.claim.sub','${adminId}', true);`,
    'update public.app_settings set verbs_per_level = 4 where id = 1;',
    'rollback;'
  ].join(' ')

  const invalidVerbsPerLevel = runPsql(dbUrl, invalidVerbsPerLevelSql, true)
  assert(
    containsInsensitive(invalidVerbsPerLevel.stderr, 'app_settings_verbs_per_level_check'),
    'verbs_per_level constraint was not enforced'
  )

  const adminSwitchSql = [
    'begin;',
    'set local role authenticated;',
    `with ctx as (select set_config('request.jwt.claim.role','authenticated', true), set_config('request.jwt.claim.sub','${adminId}', true))`,
    "select (payload->>'active_verb_category') || '|' || (payload->>'max_level') || '|' || (payload->>'active_verbs') || '|' || (payload->>'users_clamped') from (select public.set_active_verb_category(2) as payload from ctx) s;",
    'select active_verb_category::text from public.app_settings where id = 1;',
    'select count(*)::text from public.verbs where active = true and category = 2;',
    'select count(*)::text from public.verbs where active = true and category <> 2;',
    'rollback;'
  ].join(' ')

  const adminLines = queryLines(dbUrl, adminSwitchSql).filter((line) => !['BEGIN', 'SET', 'ROLLBACK'].includes(line))
  const [payloadLine, activeCategoryAfterSwitch, activeInCategory2, activeOutsideCategory2] = adminLines

  assert(Boolean(payloadLine), 'Missing RPC payload from admin switch check')
  assert(payloadLine.startsWith('2|'), 'Admin switch payload did not report category 2')
  assert(activeCategoryAfterSwitch === '2', 'app_settings.active_verb_category not updated to 2 inside transaction')
  assert(Number(activeInCategory2) > 0, 'Category 2 has no active verbs after admin switch')
  assert(Number(activeOutsideCategory2) === 0, 'Other categories remained active after admin switch')

  const studentBlockedSql = [
    'begin;',
    'set local role authenticated;',
    `with ctx as (select set_config('request.jwt.claim.role','authenticated', true), set_config('request.jwt.claim.sub','${studentId}', true))`,
    'select public.set_active_verb_category(2) from ctx;',
    'rollback;'
  ].join(' ')

  const studentBlocked = runPsql(dbUrl, studentBlockedSql, true)
  assert(
    studentBlocked.stderr.includes('Only admins can change the active verb category'),
    'Non-admin category switch did not fail with expected error'
  )

  const invalidLevelSql = [
    'begin;',
    'set local role authenticated;',
    `with admin_ctx as (select set_config('request.jwt.claim.role','authenticated', true), set_config('request.jwt.claim.sub','${adminId}', true))`,
    'select public.set_active_verb_category(2) from admin_ctx;',
    `with student_ctx as (select set_config('request.jwt.claim.role','authenticated', true), set_config('request.jwt.claim.sub','${studentId}', true))`,
    "select public.submit_level_attempt(18, now() - interval '120 seconds', now(), 0, 5) from student_ctx;",
    'rollback;'
  ].join(' ')

  const invalidLevel = runPsql(dbUrl, invalidLevelSql, true)
  assert(
    invalidLevel.stderr.includes('Invalid level attempt for active verb list'),
    'Invalid level for active category was not rejected as expected'
  )

  const clampScenarioSql = [
    'begin;',
    'set local role authenticated;',
    `select set_config('request.jwt.claim.role','authenticated', true);`,
    `select set_config('request.jwt.claim.sub','${adminId}', true);`,
    "select public.set_active_verb_category(3);",
    `select set_config('request.jwt.claim.sub','${studentId}', true);`,
    "select public.submit_level_attempt(64, now() - interval '55 seconds', now(), 0, 5);",
    `select 'cap_before=' || current_level_cap::text from public.users where id='${studentId}';`,
    `select set_config('request.jwt.claim.sub','${adminId}', true);`,
    "select 'switch_payload=' || (payload->>'users_clamped') || '|' || (payload->>'max_level') from (select public.set_active_verb_category(1) as payload) s;",
    `select set_config('request.jwt.claim.sub','${studentId}', true);`,
    `select 'cap_after=' || current_level_cap::text from public.users where id='${studentId}';`,
    'rollback;'
  ].join(' ')

  const clampLines = queryLines(dbUrl, clampScenarioSql)
  const capBeforeLine = clampLines.find((line) => line.startsWith('cap_before='))
  const switchPayloadLine = clampLines.find((line) => line.startsWith('switch_payload='))
  const capAfterLine = clampLines.find((line) => line.startsWith('cap_after='))

  assert(Boolean(capBeforeLine), 'Missing cap_before output in clamp scenario')
  assert(Boolean(switchPayloadLine), 'Missing switch_payload output in clamp scenario')
  assert(Boolean(capAfterLine), 'Missing cap_after output in clamp scenario')

  const capBefore = Number(capBeforeLine.split('=')[1])
  const payloadValues = switchPayloadLine.split('=')[1]
  const [usersClamped, switchMaxLevel] = parsePipeNumberTuple(payloadValues, 2)
  const capAfter = Number(capAfterLine.split('=')[1])

  assert(capBefore === 64, `Expected cap_before=64, got ${capBefore}`)
  assert(usersClamped >= 1, `Expected at least one clamped user, got ${usersClamped}`)
  assert(switchMaxLevel === 18, `Expected switch max level to be 18, got ${switchMaxLevel}`)
  assert(capAfter === 18, `Expected cap_after=18, got ${capAfter}`)

  console.log('OK: all admin verbs smoke checks passed.')
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Smoke test failed: ${message}`)
  process.exit(1)
}
