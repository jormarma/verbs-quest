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

        // Snapshot the top-5 sessions BEFORE the reducer runs so we know which
        // ones already existed; the new session will appear once the reducer
        // commits.
        const beforeTop = loadTopScores(conn, payload.levelId)

        await conn.reducers.submitLevelAttempt({
            levelId: payload.levelId,
            startTimeIso: payload.startTime,
            endTimeIso: payload.endTime,
            errorCount: payload.errorCount,
            questionsCount: payload.questionsCount,
        })

        // Read back the user_attempt row (set by the reducer) to get status + new level
        const attempts = [...conn.db.user_attempt.iter()]
        const me = attempts.find(
            (a) => a.identity.toHexString() === conn.identity?.toHexString(),
        )

        // Top scores — after the call, the new session is in the subscription.
        const topScores = loadTopScores(conn, payload.levelId)
        const newTopScores = topScores.length > 0 ? topScores : beforeTop

        return {
            success: true,
            queued: false,
            data: me
                ? { status: me.lastStatus, new_level: me.lastNewLevel }
                : { status: 'maintained', new_level: 1 },
            topScores: newTopScores,
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