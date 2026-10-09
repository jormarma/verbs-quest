import { getConnection } from '../spacetime/client'
import type { TopScoreEntry } from '../stores/useGameStore'

export interface LevelAttemptPayload {
    levelId: number
    startTime: string
    endTime: string
    errorCount: number
    questionsCount: number
}

const OFFLINE_QUEUE_KEY = 'verbs_quest_offline_queue'
const SERVER_TIMEOUT_MS = 10_000
type Connection = ReturnType<typeof getConnection>

export interface SubmitAttemptResult {
    success: boolean
    rejected?: boolean
    queued?: boolean
    reason?: string
    error?: string
    data?: {
        status: string
        new_level: number
    }
    previousLevelCap?: number
    topScores?: TopScoreEntry[]
}

export async function submitLevelAttempt(payload: LevelAttemptPayload): Promise<SubmitAttemptResult> {
    if (!navigator.onLine) {
        console.warn('Device is offline. Queuing attempt for later sync.')
        queueAttemptLocally(payload)
        return { success: false, queued: true }
    }

    try {
        const conn = getConnection()
        const caller = conn.identity
        if (!caller) {
            return queueUnsent(payload, 'SpacetimeDB has not assigned an identity yet')
        }
        const callerHex = caller.toHexString()

        // Rows the reducer writes reach the cache only through a subscription that
        // is already applied, so subscribe before calling it.
        try {
            await ensureCallerSubscription(conn, callerHex)
        } catch (e: unknown) {
            return queueUnsent(payload, e instanceof Error ? e.message : String(e))
        }
        const previousLevelCap = conn.db.user.identity.find(caller)?.currentLevelCap

        // A timed-out reducer may still commit. Its message must not contain "network"
        // or "fetch", or the catch below would queue it and the run could be recorded twice.
        await withTimeout(
            conn.reducers.submitLevelAttempt({
                levelId: payload.levelId,
                startTimeIso: payload.startTime,
                endTimeIso: payload.endTime,
                errorCount: payload.errorCount,
                questionsCount: payload.questionsCount,
            }),
            SERVER_TIMEOUT_MS,
            'the server did not answer in time',
        )

        const attempt = [...conn.db.user_attempt.iter()].find(
            (a) => a.identity.toHexString() === callerHex,
        )
        if (!attempt) {
            return { success: false, error: 'the server returned no verdict for this run' }
        }

        return {
            success: true,
            queued: false,
            data: { status: attempt.lastStatus, new_level: attempt.lastNewLevel },
            previousLevelCap,
            topScores: loadTopScores(conn, payload.levelId),
        }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        // Anti-cheat rejections come back as SenderError with the reducer's Err string.
        if (message.toLowerCase().includes('anti-cheat')) {
            return { success: false, rejected: true, reason: message }
        }
        if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
            queueAttemptLocally(payload)
            return { success: false, queued: true, error: message }
        }
        console.error('Failed to submit level attempt:', e)
        return { success: false, error: message }
    }
}

const callerSubscriptions = new WeakMap<Connection, Promise<void>>()

/**
 * Subscribes to the caller's own attempt and session rows, once per connection.
 * A failed or timed-out subscription is dropped so the next attempt subscribes again.
 */
function ensureCallerSubscription(conn: Connection, callerHex: string): Promise<void> {
    let subscribed = callerSubscriptions.get(conn)
    if (!subscribed) {
        subscribed = withTimeout(
            new Promise<void>((resolve, reject) => {
                conn.subscriptionBuilder()
                    .onApplied(() => resolve())
                    .onError((ctx) => {
                        callerSubscriptions.delete(conn)
                        reject(ctx.event ?? new Error('subscription failed'))
                    })
                    .subscribe([
                        `SELECT * FROM user_attempt WHERE identity = 0x${callerHex}`,
                        `SELECT * FROM game_session WHERE user_identity = 0x${callerHex}`,
                    ])
            }),
            SERVER_TIMEOUT_MS,
            'the subscription to your runs was not applied in time',
        )
        callerSubscriptions.set(conn, subscribed)
        subscribed.catch(() => callerSubscriptions.delete(conn))
    }
    return subscribed
}

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
    })
    return Promise.race([work, expired]).finally(() => clearTimeout(timer))
}

/**
 * Pull the current user's top-5 game sessions for the given level out of the
 * local subscription cache. Sorted ascending by duration (best time first),
 * with ties broken by most-recent completion time.
 */
function toMicros(ts: { microsSinceUnixEpoch?: bigint | number } | number): number {
    if (typeof ts === 'number') return ts
    if (typeof ts.microsSinceUnixEpoch === 'bigint') return Number(ts.microsSinceUnixEpoch)
    if (typeof ts.microsSinceUnixEpoch === 'number') return ts.microsSinceUnixEpoch
    return Number(ts)
}
function loadTopScores(conn: ReturnType<typeof getConnection>, level: number): TopScoreEntry[] {
    try {
        const myIdentity = conn.identity?.toHexString()
        if (!myIdentity) return []

        const sessions = [...conn.db.game_session.iter()]
            .filter(
                (s) =>
                    s.userIdentity.toHexString() === myIdentity &&
                    s.levelAttempted === level,
            )
            .sort((a, b) => {
                if (a.durationSeconds !== b.durationSeconds) {
                    return a.durationSeconds - b.durationSeconds
                }
                const aMicros = toMicros(a.completedAt)
                const bMicros = toMicros(b.completedAt)
                return Number(bMicros - aMicros)
            })
            .slice(0, 5)

        return sessions.map((s) => {
            const micros = toMicros(s.completedAt)
            return {
                duration_seconds: s.durationSeconds,
                is_perfect_run: s.isPerfectRun,
                completed_at: new Date(Number(micros) / 1000).toISOString(),
            }
        })
    } catch (e) {
        console.warn('Failed to load top scores locally:', e)
        return []
    }
}

// Only for failures before the reducer is called: nothing reached the server,
// so retrying later cannot record the run twice.
function queueUnsent(payload: LevelAttemptPayload, error: string): SubmitAttemptResult {
    queueAttemptLocally(payload)
    return { success: false, queued: true, error }
}

// Simple localStorage queue for PWA offline capabilities
function queueAttemptLocally(payload: LevelAttemptPayload) {
    try {
        const existingQueue = localStorage.getItem(OFFLINE_QUEUE_KEY)
        const queue: LevelAttemptPayload[] = existingQueue ? JSON.parse(existingQueue) : []
        queue.push(payload)
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
    } catch (e) {
        console.error('Failed to queue attempt locally:', e)
    }
}

export async function syncOfflineQueue() {
    if (!navigator.onLine) return

    try {
        const existingQueue = localStorage.getItem(OFFLINE_QUEUE_KEY)
        if (!existingQueue) return

        const queue: LevelAttemptPayload[] = JSON.parse(existingQueue)
        if (queue.length === 0) return

        console.log(`Syncing ${queue.length} offline attempts...`)

        const remainingQueue: LevelAttemptPayload[] = []
        let syncedCount = 0

        for (const attempt of queue) {
            const result = await submitLevelAttempt(attempt)
            if (result.queued) {
                remainingQueue.push(attempt)
            } else if (result.success) {
                syncedCount++
            }
        }

        if (remainingQueue.length > 0) {
            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue))
        } else {
            localStorage.removeItem(OFFLINE_QUEUE_KEY)
        }

        if (syncedCount > 0) {
            alert(`Successfully synced ${syncedCount} offline level attempt${syncedCount > 1 ? 's' : ''} to the server!`)
            window.dispatchEvent(new Event('offline-sync-complete'))
        }
    } catch (e) {
        console.error('Error during offline sync:', e)
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', syncOfflineQueue)
}