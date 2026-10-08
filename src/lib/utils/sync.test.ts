import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submitLevelAttempt, type LevelAttemptPayload } from './sync'

const fake = vi.hoisted(() => ({ connection: null as unknown }))

vi.mock('../spacetime/client', () => ({
  getConnection: () => fake.connection,
}))

const CALLER = 'caller'
const OTHER = 'other'
const OFFLINE_QUEUE_KEY = 'verbs_quest_offline_queue'

interface Identity {
  toHexString(): string
}

interface Micros {
  microsSinceUnixEpoch: bigint
}

interface AttemptRow {
  identity: Identity
  lastStatus: string
  lastNewLevel: number
  lastCompletedAt: Micros
}

interface SessionRow {
  id: bigint
  userIdentity: Identity
  levelAttempted: number
  errorsCount: number
  durationSeconds: number
  completedAt: Micros
  isPerfectRun: boolean
  clientTimestampStart: Micros
  clientTimestampEnd: Micros
}

interface ReducerArgs {
  levelId: number
  startTimeIso: string
  endTimeIso: string
  errorCount: number
  questionsCount: number
}

interface Server {
  attempts: AttemptRow[]
  sessions: SessionRow[]
  submit: (args: ReducerArgs, server: Server) => void | Promise<void>
}

const identity = (hex: string): Identity => ({ toHexString: () => hex })
const micros = (ms: number): Micros => ({ microsSinceUnixEpoch: BigInt(ms * 1000) })

const attemptRow = (owner: string, status: string, newLevel: number): AttemptRow => ({
  identity: identity(owner),
  lastStatus: status,
  lastNewLevel: newLevel,
  lastCompletedAt: micros(1_000),
})

const sessionRow = (owner: string, level: number, durationSeconds: number, perfect: boolean, id: number): SessionRow => ({
  id: BigInt(id),
  userIdentity: identity(owner),
  levelAttempted: level,
  errorsCount: perfect ? 0 : 1,
  durationSeconds,
  completedAt: micros(2_000 + id),
  isPerfectRun: perfect,
  clientTimestampStart: micros(1_000),
  clientTimestampEnd: micros(2_000),
})

function recordRun(args: ReducerArgs, server: Server): void {
  const perfect = args.errorCount === 0
  const durationSeconds = (Date.parse(args.endTimeIso) - Date.parse(args.startTimeIso)) / 1000
  server.sessions.push(sessionRow(CALLER, args.levelId, durationSeconds, perfect, server.sessions.length + 1))
  server.attempts = server.attempts.filter((row) => row.identity.toHexString() !== CALLER)
  server.attempts.push(
    attemptRow(CALLER, perfect ? 'unlocked' : 'maintained', perfect ? args.levelId + 1 : args.levelId),
  )
}

function emptyServer(submit: Server['submit'] = recordRun): Server {
  return { attempts: [], sessions: [], submit }
}

// Models the SDK client cache: a subscription fills it with the caller's rows
// once applied, and a reducer's rows reach it before the reducer call resolves.
interface FakeSubscriptionBuilder {
  onApplied(callback: () => void): FakeSubscriptionBuilder
  onError(callback: (error: Error) => void): FakeSubscriptionBuilder
  subscribe(): { unsubscribe: () => void }
}

function fakeConnection(server: Server) {
  let subscribed = false
  let cachedAttempts: AttemptRow[] = []
  let cachedSessions: SessionRow[] = []
  let applied: (() => void) | undefined

  const refresh = () => {
    cachedAttempts = server.attempts.filter((row) => row.identity.toHexString() === CALLER)
    cachedSessions = server.sessions.filter((row) => row.userIdentity.toHexString() === CALLER)
  }

  const builder: FakeSubscriptionBuilder = {
    onApplied(callback) {
      applied = callback
      return builder
    },
    onError() {
      return builder
    },
    subscribe() {
      setTimeout(() => {
        subscribed = true
        refresh()
        applied?.()
      }, 0)
      return { unsubscribe: () => {} }
    },
  }

  return {
    identity: identity(CALLER),
    subscriptionBuilder: () => builder,
    db: {
      user_attempt: { iter: () => cachedAttempts.values() },
      game_session: { iter: () => cachedSessions.values() },
    },
    reducers: {
      submitLevelAttempt: async (args: ReducerArgs) => {
        await server.submit(args, server)
        if (subscribed) refresh()
      },
    },
  }
}

const payload: LevelAttemptPayload = {
  levelId: 1,
  startTime: '2026-10-09T10:00:00.000Z',
  endTime: '2026-10-09T10:00:12.000Z',
  errorCount: 0,
  questionsCount: 5,
}

describe('submitLevelAttempt', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("returns the server's verdict for this run and the caller's own times", async () => {
    const server = emptyServer()
    server.attempts.push(attemptRow(CALLER, 'maintained', 1))
    server.sessions.push(sessionRow(CALLER, 1, 20, false, 1))
    server.sessions.push(sessionRow(OTHER, 1, 5, true, 2))
    server.sessions.push(sessionRow(CALLER, 2, 7, true, 3))
    fake.connection = fakeConnection(server)

    const result = await submitLevelAttempt(payload)

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ status: 'unlocked', new_level: 2 })
    expect(result.topScores?.map((score) => score.duration_seconds)).toEqual([12, 20])
  })

  it('does not invent a verdict when the server recorded none', async () => {
    const server = emptyServer((args, target) => {
      target.sessions.push(sessionRow(CALLER, args.levelId, 12, true, target.sessions.length + 1))
    })
    fake.connection = fakeConnection(server)

    const result = await submitLevelAttempt(payload)

    expect(result.success).toBe(false)
    expect(result.data).toBeUndefined()
  })

  it('reports an anti-cheat rejection as rejected, with no verdict', async () => {
    const server = emptyServer(() => {
      throw new Error('Anti-cheat triggered: Completion time physically impossible')
    })
    fake.connection = fakeConnection(server)

    const result = await submitLevelAttempt(payload)

    expect(result).toMatchObject({ success: false, rejected: true })
    expect(result.data).toBeUndefined()
  })

  it('reports another server error as a failure and does not queue it', async () => {
    const server = emptyServer(() => {
      throw new Error('Invalid level attempt for active verb list')
    })
    fake.connection = fakeConnection(server)

    const result = await submitLevelAttempt(payload)

    expect(result.success).toBe(false)
    expect(result.data).toBeUndefined()
    expect(result.error).toContain('Invalid level attempt')
    expect(localStorage.getItem(OFFLINE_QUEUE_KEY)).toBeNull()
  })

  it('gives up on a run the server never answers, without queueing it', async () => {
    vi.useFakeTimers()
    try {
      fake.connection = fakeConnection(emptyServer(() => new Promise<void>(() => {})))

      const pending = submitLevelAttempt(payload)
      await vi.advanceTimersByTimeAsync(60_000)
      const result = await pending

      expect(result.success).toBe(false)
      expect(result.data).toBeUndefined()
      expect(localStorage.getItem(OFFLINE_QUEUE_KEY)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
