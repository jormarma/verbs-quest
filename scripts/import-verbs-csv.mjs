#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const CWD = process.cwd()
const DEFAULT_CSV = path.join(CWD, 'verbs.csv')
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const DEFAULT_CHUNK_SIZE = 5

function parseArgs(argv) {
  const args = {
    csvPath: DEFAULT_CSV,
    dbUrl: process.env.DATABASE_URL || DEFAULT_DB_URL,
    chunkSize: DEFAULT_CHUNK_SIZE,
    execute: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--execute') {
      args.execute = true
      continue
    }
    if (token === '--csv') {
      args.csvPath = path.resolve(CWD, argv[++i] ?? '')
      continue
    }
    if (token === '--db-url') {
      args.dbUrl = argv[++i] ?? ''
      continue
    }
    if (token === '--chunk-size') {
      const parsed = Number(argv[++i] ?? '')
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--chunk-size must be a positive integer')
      }
      args.chunkSize = parsed
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
      'Import verbs from verbs.csv into public.verbs.',
      '',
      'Usage:',
      '  node scripts/import-verbs-csv.mjs [--csv <path>] [--chunk-size <n>] [--db-url <url>] [--execute]',
      '',
      'Options:',
      '  --csv <path>         CSV path (default: ./verbs.csv)',
      '  --chunk-size <n>     Verbs per level group inside each category (default: 5)',
      '  --db-url <url>       Postgres URL (default: $DATABASE_URL or local Supabase)',
      '  --execute            Execute SQL against DB. Without this flag, script runs as dry-run.',
    ].join('\n')
  )
}

function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
      continue
    }

    current += char
  }

  result.push(current)
  return result.map((cell) => cell.trim())
}

function normalizeWord(value) {
  return value.trim().toLowerCase()
}

function escapeSql(value) {
  return value.replace(/'/g, "''")
}

function loadCsvRows(csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`)
  }

  const raw = fs.readFileSync(csvPath, 'utf8')
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    throw new Error('CSV must include a header and at least one data row')
  }

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
  const expected = ['category', 'present', 'past', 'participle']
  if (header.length !== expected.length || header.some((value, index) => value !== expected[index])) {
    throw new Error(`Invalid CSV header. Expected: ${expected.join(',')}`)
  }

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    if (cells.length !== 4) {
      throw new Error(`Invalid row at line ${i + 1}: expected 4 columns, got ${cells.length}`)
    }

    const category = Number(cells[0])
    if (!Number.isInteger(category) || category < 1 || category > 3) {
      throw new Error(`Invalid category at line ${i + 1}: "${cells[0]}"`)
    }

    const present = normalizeWord(cells[1])
    const past = normalizeWord(cells[2])
    const participle = normalizeWord(cells[3])

    if (!present || !past || !participle) {
      throw new Error(`Empty value at line ${i + 1}`)
    }

    rows.push({
      category,
      infinitive: present,
      pastSimple: past,
      pastParticiple: participle,
    })
  }

  return rows
}

function buildVerbRecords(rows, chunkSize) {
  const categoryCounters = new Map([
    [1, 0],
    [2, 0],
    [3, 0],
  ])

  return rows.map((row) => {
    const nextIndex = (categoryCounters.get(row.category) ?? 0) + 1
    categoryCounters.set(row.category, nextIndex)

    return {
      category: row.category,
      infinitive: row.infinitive,
      pastSimple: row.pastSimple,
      pastParticiple: row.pastParticiple,
      levelGroup: Math.floor((nextIndex - 1) / chunkSize) + 1,
      // Keep current gameplay stable until category-selection rollout is complete.
      active: row.category === 1,
    }
  })
}

function buildSql(records) {
  const valuesSql = records
    .map((record) => {
      const cells = [
        `'${escapeSql(record.infinitive)}'`,
        `'${escapeSql(record.pastSimple)}'`,
        `'${escapeSql(record.pastParticiple)}'`,
        `${record.levelGroup}`,
        record.active ? 'true' : 'false',
        `${record.category}`,
      ]
      return `(${cells.join(', ')})`
    })
    .join(',\n')

  return `
BEGIN;
TRUNCATE TABLE public.verbs;
INSERT INTO public.verbs (infinitive, past_simple, past_participle, level_group, active, category)
VALUES
${valuesSql};
COMMIT;
`.trim()
}

function printSummary(records, chunkSize) {
  const byCategory = new Map([
    [1, { count: 0, maxLevel: 0, activeCount: 0 }],
    [2, { count: 0, maxLevel: 0, activeCount: 0 }],
    [3, { count: 0, maxLevel: 0, activeCount: 0 }],
  ])

  for (const record of records) {
    const summary = byCategory.get(record.category)
    if (!summary) continue
    summary.count += 1
    summary.maxLevel = Math.max(summary.maxLevel, record.levelGroup)
    if (record.active) summary.activeCount += 1
  }

  console.log('Import summary')
  console.log(`- total rows: ${records.length}`)
  console.log(`- level chunk size: ${chunkSize}`)
  for (const category of [1, 2, 3]) {
    const summary = byCategory.get(category)
    if (!summary) continue
    console.log(
      `- category ${category}: ${summary.count} verbs, ${summary.maxLevel} levels, ${summary.activeCount} active`
    )
  }
}

function runSql(dbUrl, sql) {
  const result = spawnSync(
    'psql',
    [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    {
      input: sql,
      stdio: ['pipe', 'inherit', 'inherit'],
      encoding: 'utf8',
    }
  )

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`psql exited with status ${result.status}`)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const rows = loadCsvRows(args.csvPath)
  const records = buildVerbRecords(rows, args.chunkSize)

  printSummary(records, args.chunkSize)

  if (!args.execute) {
    console.log('\nDry-run complete. Re-run with --execute to apply changes.')
    return
  }

  const sql = buildSql(records)
  runSql(args.dbUrl, sql)
  console.log('\nImport applied successfully.')
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Import failed: ${message}`)
  process.exit(1)
}
