#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { REPO, loadRun, sqlRows } from './lib.mjs'

const PROTECTED_PORTS = [3000, 4173, 5173]
const results = []

function report(name, ok, detail) {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`)
}

function tryRun(command, args) {
  try {
    return { ok: true, stdout: execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (error) {
    return { ok: false, stdout: String(error.stdout ?? '') }
  }
}

function listenerPids(port) {
  return tryRun('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    .stdout.split('\n')
    .map((line) => Number(line.trim()))
    .filter(Boolean)
}

function commandOf(pid) {
  return tryRun('ps', ['-o', 'command=', '-p', String(pid)]).stdout.trim()
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function fetchText(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) })
    return { status: response.status, body: await response.text() }
  } catch {
    return { status: 0, body: '' }
  }
}

function countCsvCategories(file) {
  const counts = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(1)) {
    const category = Number(line.split(',')[0])
    if (Number.isInteger(category)) counts[category] = (counts[category] ?? 0) + 1
  }
  return counts
}

function scalar(run, query) {
  const [row] = sqlRows(run, query)
  return Number(Object.values(row)[0])
}

let run
try {
  run = loadRun()
} catch (error) {
  report('run recorded', false, error.message)
  process.exit(1)
}

report('run recorded', true, `${run.RUN_ID} (started ${run.STARTED_AT}, git ${run.GIT_HEAD})`)

if (run.CLEANED_AT) {
  report('run still active', false, `cleaned up at ${run.CLEANED_AT}; start a new run with launch.sh`)
  process.exit(1)
}

report('scratch state present', fs.existsSync(run.SCRATCH_DIR), run.SCRATCH_DIR)

const stdbOwner = listenerPids(run.STDB_PORT).find((pid) => commandOf(pid).includes(run.SCRATCH_DIR))
report(
  'SpacetimeDB port owned by this run',
  Boolean(stdbOwner),
  stdbOwner ? `pid ${stdbOwner} listens on ${run.STDB_PORT}` : `no listener on ${run.STDB_PORT} carries ${run.SCRATCH_DIR}`,
)

const ping = tryRun('spacetime', ['server', 'ping', run.STDB_URL])
report('SpacetimeDB answers ping', /Server is online/.test(ping.stdout), run.STDB_URL)

const viteOwner = listenerPids(run.VITE_PORT).find((pid) => {
  const command = commandOf(pid)
  return command.includes('vite') && command.includes(`--port ${run.VITE_PORT}`)
})
report(
  'Vite port owned by this run',
  Boolean(viteOwner),
  viteOwner ? `pid ${viteOwner} listens on ${run.VITE_PORT}` : `no vite listener on ${run.VITE_PORT}`,
)

const app = await fetchText(run.APP_URL)
report('app serves index.html', app.status === 200 && app.body.includes('id="root"'), `HTTP ${app.status} from ${run.APP_URL}`)

const chromeOwner = listenerPids(run.CDP_PORT).find((pid) => commandOf(pid).includes(run.SCRATCH_DIR))
report(
  'Chrome DevTools port owned by this run',
  Boolean(chromeOwner),
  chromeOwner ? `pid ${chromeOwner} listens on ${run.CDP_PORT}` : `no listener on ${run.CDP_PORT} carries ${run.SCRATCH_DIR}`,
)

const version = await fetchText(`${run.CDP_URL}/json/version`)
report(
  'Chrome DevTools endpoint answers',
  version.status === 200 && version.body.includes('webSocketDebuggerUrl'),
  `HTTP ${version.status} from ${run.CDP_URL}/json/version`,
)

const ports = [run.STDB_PORT, run.VITE_PORT, run.CDP_PORT].map(Number)
report(
  'run ports avoid the user defaults',
  ports.every((port) => !PROTECTED_PORTS.includes(port)),
  ports.join(', '),
)

const login = tryRun('spacetime', ['login', 'show', '--token'])
report('CLI login present (token not printed)', /auth token/i.test(login.stdout), 'spacetime login show --token')

const csvCounts = countCsvCategories(path.join(REPO, 'verbs.csv'))
for (const category of [1, 2, 3]) {
  try {
    const actual = scalar(run, `SELECT COUNT(*) AS n FROM verb WHERE category = ${category}`)
    report(
      `scratch DB has category ${category} verbs`,
      actual === csvCounts[category],
      `${actual} rows, verbs.csv has ${csvCounts[category]}`,
    )
  } catch (error) {
    report(`scratch DB has category ${category} verbs`, false, String(error.message).split('\n')[0])
  }
}

try {
  const admins = scalar(run, "SELECT COUNT(*) AS n FROM user WHERE role = 'admin'")
  report('scratch DB has an admin user', admins >= 1, `${admins} admin row(s)`)
  const active = scalar(run, 'SELECT COUNT(*) AS n FROM verb WHERE active = true')
  report('lobby verb list is populated', active > 0, `${active} active verbs`)
} catch (error) {
  report('scratch DB answers queries', false, String(error.message).split('\n')[0])
}

const failed = results.filter((ok) => !ok).length
console.log(
  failed === 0
    ? `doctor: healthy (${results.length}/${results.length} checks)`
    : `doctor: unhealthy (${failed} of ${results.length} checks failed)`,
)
process.exit(failed === 0 ? 0 : 1)
