import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = path.dirname(fileURLToPath(import.meta.url))

export const REPO = path.resolve(here, '../../../..')
export const EVIDENCE_ROOT = path.join(REPO, 'verify-evidence')
export const TOKEN_KEY = 'verbs-quest.stdb.token'
export const AUTH_METHOD_KEY = 'verbs-quest.auth.method'
export const SIGNIN_PROMPT = 'Sign in with your Google account to play.'

export function loadRun(runId = 'current') {
  const file = path.join(EVIDENCE_ROOT, runId, 'run.env')
  if (!fs.existsSync(file)) {
    throw new Error(`no run recorded at ${file}; start one with .claude/skills/verify/scripts/launch.sh`)
  }
  const run = { RUN_DIR: fs.realpathSync(path.dirname(file)) }
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (match) run[match[1]] = match[2]
  }
  return run
}

export function evidencePath(run, ...parts) {
  const target = path.join(run.RUN_DIR, ...parts)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  return target
}

export function loginToken() {
  const output = execFileSync('spacetime', ['login', 'show', '--token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const match = output.match(/auth token[^\n]*?\bis\s+(\S+)/i)
  if (!match) throw new Error('spacetime login show --token printed no token; run `spacetime login` first')
  return match[1]
}

export function sqlRows(run, query) {
  const output = execFileSync(
    'spacetime',
    ['sql', '--server', run.STDB_URL, '--format', 'json', run.DB_NAME, query],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const start = output.search(/^\[\s*\{/m)
  if (start < 0) throw new Error(`spacetime sql returned no JSON for: ${query}`)
  const [statement] = JSON.parse(output.slice(start))
  const names = statement.schema.elements.map((element) => element.name.some)
  return statement.rows.map((row) => Object.fromEntries(names.map((name, index) => [name, row[index]])))
}

export async function openPage(run) {
  const browser = await chromium.connectOverCDP(run.CDP_URL)
  const context = browser.contexts()[0] ?? (await browser.newContext())
  const page = context.pages()[0] ?? (await context.newPage())
  return { browser, page }
}

export function parseArgs(argv, booleans = []) {
  const positional = []
  const flags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }
    const name = token.slice(2)
    const next = argv[index + 1]
    if (booleans.includes(name) || next === undefined || next.startsWith('--')) {
      flags[name] = true
    } else {
      flags[name] = next
      index += 1
    }
  }
  return { positional, flags }
}
