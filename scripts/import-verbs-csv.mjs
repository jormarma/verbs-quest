#!/usr/bin/env node
//
// Import verbs from verbs.csv into the SpacetimeDB `verbs-quest` database.
// Uses the `spacetime call` CLI under the hood; the caller must already be
// registered as an admin (see README → "Bootstrap an admin").

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const CWD = process.cwd()
const DEFAULT_CSV = path.join(CWD, 'verbs.csv')
const DEFAULT_DB = 'verbs-quest'
const DEFAULT_SERVER = 'local'
const DEFAULT_CHUNK_SIZE = 5

function parseArgs(argv) {
  const args = {
    csvPath: DEFAULT_CSV,
    db: process.env.SPACETIMEDB_DB ?? DEFAULT_DB,
    server: process.env.SPACETIMEDB_SERVER ?? DEFAULT_SERVER,
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
    if (token === '--db') {
      args.db = argv[++i] ?? ''
      continue
    }
    if (token === '--server') {
      args.server = argv[++i] ?? ''
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
      'Import verbs from verbs.csv into the SpacetimeDB verbs-quest module.',
      '',
      'Usage:',
      '  node scripts/import-verbs-csv.mjs [--csv <path>] [--chunk-size <n>] [--db <name>] [--server <local|maincloud>] [--execute]',
      '',
      'Options:',
      '  --csv <path>           CSV path (default: ./verbs.csv)',
      '  --chunk-size <n>       Verbs per level group inside each category (default: 5)',
      '  --db <name>            SpacetimeDB database name (default: verbs-quest)',
      '  --server <name>        SpacetimeDB server nickname (default: local)',
      '  --execute              Apply changes. Without this flag, runs as dry-run.',
    ].join('\n'),
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
  if (
    header.length !== expected.length ||
    header.some((value, index) => value !== expected[index])
  ) {
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
      // Keep gameplay stable until admin picks category 2/3.
      active: row.category === 1,
    }
  })
}

function printSummary(records) {
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
  for (const category of [1, 2, 3]) {
    const summary = byCategory.get(category)
    if (!summary) continue
    console.log(
      `- category ${category}: ${summary.count} verbs, ${summary.maxLevel} levels, ${summary.activeCount} active`,
    )
  }
}

/**
 * Encode a value as JSON for use as a positional CLI arg to `spacetime call`.
 * spawnSync passes args directly to execvp — no shell quoting needed.
 */
function jsonArg(value) {
  return JSON.stringify(value)
}

function callUpsertVerb(server, db, record) {
  return spawnSync(
    'spacetime',
    [
      'call',
      '--server', server,
      db,
      'upsert_verb',
      jsonArg(record.infinitive),
      jsonArg(record.pastSimple),
      jsonArg(record.pastParticiple),
      jsonArg(record.levelGroup),
      jsonArg(record.category),
      jsonArg(record.active),
    ],
    { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] },
  )
}

function callTruncateVerbs(server, db) {
  return spawnSync(
    'spacetime',
    ['call', '--server', server, db, 'truncate_verbs'],
    { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] },
  )
}

function applyImport(server, db, records) {
  // Clear the existing verbs first so the import is deterministic.
  const truncate = callTruncateVerbs(server, db)
  if (truncate.status !== 0) {
    process.stderr.write(truncate.stderr ?? '')
    throw new Error(`truncate_verbs failed (status=${truncate.status})`)
  }

  for (const record of records) {
    const result = callUpsertVerb(server, db, record)
    if (result.status !== 0) {
      process.stderr.write(result.stderr ?? '')
      throw new Error(
        `upsert_verb failed for "${record.infinitive}" (status=${result.status})`,
      )
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const rows = loadCsvRows(args.csvPath)
  const records = buildVerbRecords(rows, args.chunkSize)

  printSummary(records)

  if (!args.execute) {
    console.log(
      `\nDry-run complete. Re-run with --execute to apply changes (target: ${args.server}/${args.db}).`,
    )
    return
  }

  applyImport(args.server, args.db, records)
  console.log('\nImport applied successfully.')
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Import failed: ${message}`)
  process.exit(1)
}