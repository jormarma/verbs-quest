import { useState, useCallback } from 'react'
import { Identity } from 'spacetimedb'
import type { UserOverview, UserLevelDetail, LevelRunsResponse, LevelRunDetail, LevelVerbDetail } from '../spacetime/module_bindings/types'
import { getConnection } from '../spacetime/client'

export interface AdminUserOverview {
    user_id: string
    username: string
    current_level_cap: number
    total_runs: number
    total_perfect_runs: number
}

export interface AdminUserDetails {
    level_attempted: number
    total_runs: number
    perfect_runs: number
    best_time_seconds: number | null
    global_rank: number | null
}

export interface AdminRunDetails {
    duration_seconds: number
    is_perfect_run: boolean
    completed_at: string
    errors_count: number
    client_timestamp_start: string
}

export interface AdminVerb {
    id: string
    infinitive: string
    past_simple: string
    past_participle: string
}

export function useAdminStats() {
    const [overviewData, setOverviewData] = useState<AdminUserOverview[]>([])
    const [isLoadingOverview, setIsLoadingOverview] = useState(false)
    const [overviewError, setOverviewError] = useState<string | null>(null)

    const [detailsData, setDetailsData] = useState<AdminUserDetails[]>([])
    const [isLoadingDetails, setIsLoadingDetails] = useState(false)
    const [detailsError, setDetailsError] = useState<string | null>(null)

    const [levelRunsData, setLevelRunsData] = useState<AdminRunDetails[]>([])
    const [levelVerbs, setLevelVerbs] = useState<AdminVerb[]>([])
    const [isLoadingLevelRuns, setIsLoadingLevelRuns] = useState(false)
    const [levelRunsError, setLevelRunsError] = useState<string | null>(null)

    const getErrorMessage = (error: unknown) => {
        if (error instanceof Error) return error.message
        return String(error)
    }

const fetchOverview = useCallback(async () => {
        setIsLoadingOverview(true)
        setOverviewError(null)
        try {
            const conn = getConnection()
            const rows = (await conn.procedures.getUsersOverview({})) as UserOverview[]
            setOverviewData(
                rows.map((r) => ({
                    user_id: r.userIdentity,
                    username: r.username,
                    current_level_cap: r.currentLevelCap,
                    total_runs: Number(r.totalRuns),
                    total_perfect_runs: Number(r.totalPerfectRuns),
                })),
            )
        } catch (err: unknown) {
            console.error('Failed to fetch admin overview:', err)
            setOverviewError(getErrorMessage(err))
        } finally {
            setIsLoadingOverview(false)
        }
    }, [])

const fetchUserDetails = useCallback(async (userId: string) => {
        setIsLoadingDetails(true)
        setDetailsError(null)
        try {
            const conn = getConnection()
            let identity: Identity
            try {
                identity = Identity.fromString(userId)
            } catch {
                throw new Error(`Invalid user id: ${userId}`)
            }
            const rows = (await conn.procedures.getUserLevelDetails({ target: identity })) as UserLevelDetail[]
            setDetailsData(
                rows.map((r) => ({
                    level_attempted: r.levelAttempted,
                    total_runs: Number(r.totalRuns),
                    perfect_runs: Number(r.perfectRuns),
                    best_time_seconds: r.bestTimeSeconds ?? null,
                    global_rank: r.globalRank ? Number(r.globalRank) : null,
                })),
            )
        } catch (err: unknown) {
            console.error('Failed to fetch user details:', err)
            setDetailsError(getErrorMessage(err))
        } finally {
            setIsLoadingDetails(false)
        }
    }, [])

const fetchUserLevelRuns = useCallback(async (userId: string, level: number) => {
        setIsLoadingLevelRuns(true)
        setLevelRunsError(null)
        try {
            const conn = getConnection()
            const identity = Identity.fromString(userId)
            const resp = (await conn.procedures.getUserLevelRuns({ target: identity, level })) as LevelRunsResponse
            setLevelRunsData(
                resp.runs.map((r: LevelRunDetail) => ({
                    duration_seconds: r.durationSeconds,
                    is_perfect_run: r.isPerfectRun,
                    completed_at: r.completedAt.toISOString(),
                    errors_count: r.errorsCount,
                    client_timestamp_start: r.clientTimestampStart.toISOString(),
                })),
            )
            setLevelVerbs(
                resp.verbs.map((v: LevelVerbDetail) => ({
                    id: String(v.id),
                    infinitive: v.infinitive,
                    past_simple: v.pastSimple,
                    past_participle: v.pastParticiple,
                })),
            )
        } catch (err: unknown) {
            console.error('Failed to fetch user level runs:', err)
            setLevelRunsError(getErrorMessage(err))
        } finally {
            setIsLoadingLevelRuns(false)
        }
    }, [])

    return {
        overviewData,
        isLoadingOverview,
        overviewError,
        fetchOverview,
        detailsData,
        isLoadingDetails,
        detailsError,
        fetchUserDetails,
        levelRunsData,
        levelVerbs,
        isLoadingLevelRuns,
        levelRunsError,
        fetchUserLevelRuns,
    }
}