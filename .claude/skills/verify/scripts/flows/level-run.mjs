#!/usr/bin/env node
import fs from 'node:fs'
import { evidencePath, loadRun, openPage, parseArgs, sqlRows } from '../lib.mjs'

const { flags } = parseArgs(process.argv.slice(2))
const mode = flags.mode ?? 'quest'
const level = Number(flags.level ?? 1)
const wrongTarget = Number(flags.wrong ?? 1)
const paceMs = Number(flags['pace-ms'] ?? 900)

if (!['quest', 'practice'].includes(mode)) throw new Error('--mode must be quest or practice')
if (!Number.isInteger(level) || level < 1) throw new Error('--level must be a positive integer')
if (!Number.isInteger(wrongTarget) || wrongTarget < 0) throw new Error('--wrong must be a non-negative integer')

const run = loadRun()
const watchdog = setTimeout(() => {
  console.error('FAIL: level-run exceeded 240 s')
  process.exit(2)
}, 240000)
watchdog.unref()

const verbs = sqlRows(
  run,
  `SELECT infinitive, past_simple, past_participle FROM verb WHERE level_group = ${level} AND active = true`,
)
if (verbs.length === 0) throw new Error(`no active verbs in level ${level}; check the active category`)
const lessonLine = [...new Set(verbs.map((verb) => verb.infinitive))]
  .sort((a, b) => a.localeCompare(b))
  .join(', ')
  .toUpperCase()

const sessionColumns = 'id, user_identity, level_attempted, errors_count, is_perfect_run, duration_seconds'
const attemptQuery = 'SELECT last_status, last_new_level FROM user_attempt'
const capQuery = 'SELECT current_level_cap FROM user'
const sessionsBefore = sqlRows(run, `SELECT ${sessionColumns} FROM game_session`)
const attemptBefore = sqlRows(run, attemptQuery)
const capBefore = Number(sqlRows(run, capQuery)[0]?.current_level_cap)
const beforeIds = new Set(sessionsBefore.map((row) => row.id))

const assertions = []
const record = (name, pass, detail) => {
  assertions.push({ name, pass: Boolean(pass), detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${detail}`)
}

const feedbackText = /^(CORRECT!|INCORRECT!)$/

async function readQuestion(page) {
  return page.evaluate(() => {
    const headings = [...document.querySelectorAll('h2')].map((heading) => heading.textContent.trim())
    const verb = headings.find((text) => /^[A-Za-z]+$/.test(text)) ?? null
    const tense =
      [...document.querySelectorAll('div')]
        .find((element) => element.children.length === 0 && /^PAST (SIMPLE|PARTICIPLE)$/.test(element.textContent.trim()))
        ?.textContent.trim() ?? null
    const finished = headings.find((text) => /Level (Complete|Failed)|Practice complete/i.test(text)) ?? null
    return { verb, tense, finished }
  })
}

async function selectLevel(page) {
  const levelButton = page.getByRole('button', { name: String(level), exact: true })
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await levelButton.click()
    const shown = await page
      .waitForFunction(
        (expected) => [...document.querySelectorAll('p')].some((p) => p.textContent.trim() === expected),
        lessonLine,
        { timeout: 2000 },
      )
      .then(() => true, () => false)
    if (shown) return true
  }
  return false
}

async function waitForSubmission(expectedCount) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const rows = sqlRows(run, `SELECT ${sessionColumns} FROM game_session`)
    if (rows.length - sessionsBefore.length >= expectedCount) return rows
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return sqlRows(run, `SELECT ${sessionColumns} FROM game_session`)
}

const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

async function waitForTopTimes(page) {
  let shown = []
  for (let attempt = 0; attempt < 20; attempt += 1) {
    shown = await page.evaluate(() => {
      const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.trim() === 'Top 3 Times')
      if (!heading) return []
      return [...heading.parentElement.querySelectorAll('li span.font-mono')].map((span) => span.textContent.trim())
    })
    if (shown.length > 0) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return shown
}

let page = null

async function main() {
  const opened = await openPage(run)
  page = opened.page
  await page.goto(run.APP_URL, { waitUntil: 'domcontentloaded' })

  const previewButton = page.getByRole('button', { name: 'Preview as student', exact: true })
  const playButton = page.getByRole('button', { name: 'Play', exact: true })
  await previewButton
    .or(playButton)
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .catch(() => {
      throw new Error('no admin dashboard or player lobby visible; run control.mjs session-admin first')
    })
  if (await previewButton.isVisible()) await previewButton.click()
  await playButton.click()

  const lessonShown = await selectLevel(page)
  record('lesson lists the level verbs', lessonShown, `level ${level}: ${lessonLine}`)
  if (!lessonShown) throw new Error(`lesson never showed the verbs of level ${level}`)
  await page.screenshot({ path: evidencePath(run, 'screens', `${mode}-lobby-level${level}.png`) })

  if (mode === 'quest') {
    await page.getByRole('button', { name: 'Start Quest', exact: true }).click()
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor({ state: 'visible', timeout: 15000 })
  } else {
    await page.getByRole('button', { name: `Practice level ${level}`, exact: true }).click()
    await page.getByRole('button', { name: 'Cancel Run', exact: true }).waitFor({ state: 'visible', timeout: 15000 })
  }

  const answers = []
  let wrongLeft = wrongTarget
  let finished = null
  for (let step = 0; step < 300 && !finished; step += 1) {
    const question = await readQuestion(page)
    if (question.finished) {
      finished = question.finished
      break
    }
    if (!question.verb || !question.tense) {
      await page.waitForTimeout(250)
      continue
    }
    const verb = verbs.find((row) => row.infinitive === question.verb.toLowerCase())
    if (!verb) throw new Error(`question shows "${question.verb}", which is not in level ${level}`)

    const correctForm = question.tense === 'PAST SIMPLE' ? verb.past_simple : verb.past_participle
    const expected = correctForm.split('/')[0].trim().toLowerCase()
    const shouldMiss = wrongLeft > 0
    if (shouldMiss) wrongLeft -= 1
    const typed = shouldMiss ? 'zzz' : expected

    await page.waitForTimeout(paceMs)
    await page.keyboard.type(typed, { delay: 50 })
    await page.keyboard.press('Enter')
    const feedback = (await page.getByText(feedbackText).first().textContent({ timeout: 5000 })).trim()
    answers.push({
      verb: question.verb,
      tense: question.tense,
      typed,
      feedback,
      expectedFeedback: shouldMiss ? 'INCORRECT!' : 'CORRECT!',
    })
    await page.keyboard.press('Enter')
    await page.getByText(feedbackText).first().waitFor({ state: 'hidden', timeout: 5000 })
  }

  if (!finished) {
    await page.screenshot({ path: evidencePath(run, 'screens', `${mode}-stuck-level${level}.png`) })
    throw new Error('no finish screen after 300 steps; see screens/ for the stuck state')
  }

  const errorCount = answers.filter((answer) => answer.feedback === 'INCORRECT!').length
  const gradedAsExpected = answers.every((answer) => answer.feedback === answer.expectedFeedback)
  record('answers graded as expected', gradedAsExpected, `${answers.length} answers, ${errorCount} incorrect`)
  record(
    'question count is two per verb plus one per miss',
    answers.length === 2 * verbs.length + errorCount,
    `${answers.length} answers for ${verbs.length} verbs and ${errorCount} misses`,
  )

  const expectedHeading = mode === 'quest' ? 'Level Complete!' : 'Practice complete!'
  record('finish screen heading', finished === expectedHeading, `"${finished}"`)

  const expectedNewRows = mode === 'quest' ? 1 : 0
  if (mode === 'practice') await new Promise((resolve) => setTimeout(resolve, 3000))
  const sessionsAfter = await waitForSubmission(expectedNewRows)
  const newSessions = sessionsAfter.filter((row) => !beforeIds.has(row.id))
  const attemptAfter = sqlRows(run, attemptQuery)

  const shownTimes = mode === 'quest' ? await waitForTopTimes(page) : []
  await page.waitForTimeout(500)
  await page.screenshot({ path: evidencePath(run, 'screens', `${mode}-finished-level${level}-wrong${wrongTarget}.png`) })
  const bodyText = await page.locator('body').innerText()

  if (mode === 'quest') {
    record('one game_session row written', newSessions.length === 1, `${newSessions.length} new row(s)`)
    const [row] = newSessions
    if (row) {
      record(
        'row records level and error count',
        row.level_attempted === level && row.errors_count === errorCount,
        `level ${row.level_attempted}, errors ${row.errors_count}, expected level ${level}, errors ${errorCount}`,
      )
      record(
        'perfect flag matches error count',
        row.is_perfect_run === (errorCount === 0),
        `is_perfect_run ${row.is_perfect_run} with ${errorCount} error(s)`,
      )
    }
    const expectedStatus = errorCount === 0 ? 'unlocked' : 'maintained'
    record(
      'server stores the run status',
      attemptAfter[0]?.last_status === expectedStatus,
      `user_attempt.last_status ${attemptAfter[0]?.last_status}, expected ${expectedStatus}`,
    )
    if (errorCount > 0) {
      record(
        'screen shows the error count',
        bodyText.includes(`Errors made: ${errorCount}`),
        `Errors made: ${errorCount}`,
      )
      record(
        'screen explains that a perfect run is needed',
        bodyText.includes('need a perfect run'),
        'Good job, but you need a perfect run to unlock the next level.',
      )
    } else {
      const lastNewLevel = Number(attemptAfter[0]?.last_new_level)
      const raisedCap = lastNewLevel > capBefore
      const expectedMessage = raisedCap ? 'Level unlocked' : 'Perfect run!'
      const shownLine = bodyText.match(/(Perfect run|Level unlocked)[^\n]*/)?.[0] ?? 'no perfect-run message on screen'
      record(
        `perfect run shows "${expectedMessage}"`,
        bodyText.includes(expectedMessage),
        `${shownLine} (server cap ${capBefore} to ${lastNewLevel})`,
      )
    }
    const callerIdentity = newSessions[0]?.user_identity
    const expectedTimes = sessionsAfter
      .filter((row) => row.user_identity === callerIdentity && row.level_attempted === level)
      .sort((a, b) => a.duration_seconds - b.duration_seconds)
      .slice(0, 3)
      .map((row) => formatTime(row.duration_seconds))
    record(
      'TOP 3 TIMES lists the saved runs',
      JSON.stringify(shownTimes) === JSON.stringify(expectedTimes),
      `shows ${shownTimes.join(', ') || 'nothing'}, expected ${expectedTimes.join(', ')}`,
    )
  } else {
    record('practice writes no game_session row', newSessions.length === 0, `${newSessions.length} new row(s)`)
    const practiceMessage = errorCount === 0 ? 'Perfect practice run' : `Errors made: ${errorCount}`
    record('screen shows the practice result', bodyText.includes(practiceMessage), practiceMessage)
  }

  const attemptChanged = JSON.stringify(attemptAfter) !== JSON.stringify(attemptBefore)
  if (mode === 'practice') {
    record('practice leaves user_attempt (unlock progress) unchanged', !attemptChanged, JSON.stringify(attemptAfter))
  }

  return {
    mode,
    level,
    wrongRequested: wrongTarget,
    lesson: lessonLine,
    answers,
    finished,
    sessionsBefore,
    sessionsAfter,
    newSessions,
    attemptBefore,
    attemptAfter,
    assertions,
  }
}

let result
try {
  result = await main()
  result.pass = result.assertions.every((assertion) => assertion.pass)
} catch (error) {
  console.error(`FAIL  ${mode} level ${level}: ${String(error.message).split('\n')[0]}`)
  if (page) {
    await page
      .screenshot({ path: evidencePath(run, 'screens', `${mode}-error-level${level}.png`) })
      .catch(() => {})
  }
  result = { mode, level, wrongRequested: wrongTarget, error: String(error.message), assertions, pass: false }
}

result.finishedAt = new Date().toISOString()
const file = evidencePath(run, 'flows', `${mode}-level${level}-wrong${wrongTarget}.json`)
fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`)
console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${mode} level ${level} with ${wrongTarget} planned miss(es): ${file}`)
process.exit(result.pass ? 0 : 1)
