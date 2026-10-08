#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import {
  AUTH_METHOD_KEY,
  REPO,
  SIGNIN_PROMPT,
  TOKEN_KEY,
  evidencePath,
  loadRun,
  loginToken,
  openPage,
  parseArgs,
  sqlRows,
} from './lib.mjs'

const USAGE = `usage: node .claude/skills/verify/scripts/control.mjs <command> [args]

  goto [path]                             open the app, or a path under it
  session-admin                           inject the CLI login as the admin session, then reload
  session-signed-out                     clear the injected session, reload to the sign-in gate
  text                                    print the visible page text
  expect <text> [--exact] [--shot name]   wait up to 10 s for visible text; optional screenshot
  absent <text> [--exact]                 pass when the text is not visible within 5 s
  click <name> [--role button] [--exact]  click by ARIA role and accessible name
  press <key>                             press one key, e.g. Enter
  type <text> [--delay ms]                type into the focused element
  shot <name>                             save screens/<name>.png in the run's evidence folder
  sql "<SELECT ...>"                      read-only query against the scratch database
  call <reducer> [args...]                call a reducer on the scratch database (changes state)
`

const { positional, flags } = parseArgs(process.argv.slice(2), ['exact'])
const [command, ...args] = positional

if (!command) {
  console.error(USAGE)
  process.exit(2)
}

async function expectText(page, text, exact = false) {
  await page.getByText(text, { exact }).first().waitFor({ state: 'visible', timeout: 10000 })
}

async function screenshot(run, page, name) {
  const file = evidencePath(run, 'screens', `${name}.png`)
  await page.screenshot({ path: file })
  console.log(`PASS: screenshot ${path.relative(REPO, file)}`)
}

async function sessionAdmin(run, page) {
  const token = loginToken()
  await page.goto(run.APP_URL, { waitUntil: 'domcontentloaded' })
  await page
    .getByText(SIGNIN_PROMPT)
    .or(page.getByRole('button', { name: 'Preview as student', exact: true }))
    .or(page.getByText('Choose your display name'))
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForFunction((key) => Boolean(localStorage.getItem(key)), TOKEN_KEY, { timeout: 20000 })
  await page.evaluate(
    ({ tokenKey, methodKey, value }) => {
      localStorage.setItem(tokenKey, value)
      localStorage.setItem(methodKey, 'google')
    },
    { tokenKey: TOKEN_KEY, methodKey: AUTH_METHOD_KEY, value: token },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Preview as student', exact: true }).waitFor({ state: 'visible', timeout: 20000 })
  console.log('PASS: admin session active; admin dashboard visible (token not recorded)')
}

async function sessionSignedOut(run, page) {
  await page.goto(run.APP_URL, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ tokenKey, methodKey }) => {
      localStorage.removeItem(tokenKey)
      localStorage.removeItem(methodKey)
    },
    { tokenKey: TOKEN_KEY, methodKey: AUTH_METHOD_KEY },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expectText(page, SIGNIN_PROMPT)
  console.log('PASS: sign-in gate visible')
}

function runSql(run, query) {
  if (!/^\s*SELECT\b/i.test(query)) throw new Error('sql accepts only SELECT statements; use call for reducers')
  console.log(JSON.stringify(sqlRows(run, query), null, 2))
}

function runCall(run, reducerArgs) {
  if (reducerArgs.length === 0) throw new Error('usage: control.mjs call <reducer> [args...]')
  execFileSync('spacetime', ['call', '--server', run.STDB_URL, run.DB_NAME, ...reducerArgs], { stdio: 'inherit' })
  console.log(`PASS: called ${reducerArgs[0]} on ${run.DB_NAME}`)
}

async function main() {
  const run = loadRun()

  if (command === 'sql') return runSql(run, args.join(' '))
  if (command === 'call') return runCall(run, args)

  const { page } = await openPage(run)
  switch (command) {
    case 'goto': {
      const url = new URL(args[0] ?? '', run.APP_URL)
      await page.goto(url.href, { waitUntil: 'domcontentloaded' })
      console.log(`PASS: at ${url.href} ("${await page.title()}")`)
      return
    }
    case 'session-admin':
      return sessionAdmin(run, page)
    case 'session-signed-out':
      return sessionSignedOut(run, page)
    case 'text': {
      const text = await page.locator('body').innerText({ timeout: 5000 })
      console.log(text.trim().slice(0, 4000))
      return
    }
    case 'expect': {
      await expectText(page, args[0], flags.exact === true)
      console.log(`PASS: "${args[0]}" is visible`)
      if (flags.shot) await screenshot(run, page, flags.shot)
      return
    }
    case 'absent': {
      const hidden = await page
        .getByText(args[0], { exact: flags.exact === true })
        .first()
        .waitFor({ state: 'hidden', timeout: 5000 })
        .then(() => true, () => false)
      if (!hidden) throw new Error(`"${args[0]}" is still visible`)
      console.log(`PASS: "${args[0]}" is not visible`)
      return
    }
    case 'click': {
      const role = flags.role ?? 'button'
      await page.getByRole(role, { name: args[0], exact: flags.exact === true }).click({ timeout: 10000 })
      console.log(`PASS: clicked ${role} "${args[0]}"`)
      return
    }
    case 'press':
      await page.keyboard.press(args[0])
      console.log(`PASS: pressed ${args[0]}`)
      return
    case 'type':
      await page.keyboard.type(args[0], { delay: Number(flags.delay ?? 50) })
      console.log(`PASS: typed ${args[0].length} characters`)
      return
    case 'shot':
      return screenshot(run, page, args[0])
    default:
      throw new Error(`unknown command "${command}"\n${USAGE}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`FAIL: ${String(error.message).split('\n')[0]}`)
    process.exit(1)
  })
