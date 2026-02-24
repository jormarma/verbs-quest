import { supabase } from '../supabase/client'

export interface LevelAttemptPayload {
    levelId: number
    startTime: string
    endTime: string
    errorCount: number
    questionsCount: number
}

const OFFLINE_QUEUE_KEY = 'verbs_quest_offline_queue'

export async function submitLevelAttempt(payload: LevelAttemptPayload) {
    if (!navigator.onLine) {
        console.warn('Device is offline. Queuing attempt for later sync.')
        queueAttemptLocally(payload)
        return { success: false, queued: true }
    }

    try {
        const { data, error } = await supabase.rpc('submit_level_attempt', {
            p_level_id: payload.levelId,
            p_start_time: payload.startTime,
            p_end_time: payload.endTime,
            p_error_count: payload.errorCount,
            p_questions_count: payload.questionsCount
        })

        if (error) {
            console.error('RPC Error:', error.message)
            // If it's a network error, we might still want to queue it
            if (error.message.includes('fetch') || error.message.includes('network')) {
                queueAttemptLocally(payload)
                return { success: false, queued: true, error: error.message }
            }
            throw error
        }

        // Check if the RPC returned a cheat rejection
        if (data && data.status === 'rejected') {
            console.error('Anti-Cheat Rejection:', data.reason)
            return { success: false, rejected: true, reason: data.reason }
        }

        console.log('Level attempt submitted successfully:', data)
        return { success: true, queued: false, data }

    } catch (e: any) {
        console.error('Failed to submit level attempt:', e)
        return { success: false, error: e.message }
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

        for (const attempt of queue) {
            const result = await submitLevelAttempt(attempt)
            if (result.queued) {
                // Still failing (maybe went offline again during sync)
                remainingQueue.push(attempt)
            }
        }

        if (remainingQueue.length > 0) {
            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue))
        } else {
            localStorage.removeItem(OFFLINE_QUEUE_KEY)
        }

    } catch (e) {
        console.error('Error during offline sync:', e)
    }
}

// Optional: Set up an event listener to trigger sync when coming back online
if (typeof window !== 'undefined') {
    window.addEventListener('online', syncOfflineQueue)
}
