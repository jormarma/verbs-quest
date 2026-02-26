import { useState, useCallback } from 'react'
import { supabase } from '../supabase/client'

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

    const fetchOverview = useCallback(async () => {
        setIsLoadingOverview(true)
        setOverviewError(null)
        try {
            const { data, error } = await supabase.rpc('get_admin_users_overview')
            if (error) throw error
            setOverviewData(data || [])
        } catch (err: any) {
            console.error("Failed to fetch admin overview:", err)
            setOverviewError(err.message)
        } finally {
            setIsLoadingOverview(false)
        }
    }, [])

    const fetchUserDetails = useCallback(async (userId: string) => {
        setIsLoadingDetails(true)
        setDetailsError(null)
        try {
            const { data, error } = await supabase.rpc('get_admin_user_details', {
                p_user_id: userId
            })
            if (error) throw error
            setDetailsData(data || [])
        } catch (err: any) {
            console.error("Failed to fetch user details:", err)
            setDetailsError(err.message)
        } finally {
            setIsLoadingDetails(false)
        }
    }, [])

    const fetchUserLevelRuns = useCallback(async (userId: string, level: number) => {
        setIsLoadingLevelRuns(true)
        setLevelRunsError(null)
        try {
            const { data, error } = await supabase.rpc('get_admin_user_level_runs', {
                p_user_id: userId,
                p_level: level
            })
            if (error) throw error
            setLevelRunsData(data?.runs || [])
            setLevelVerbs(data?.verbs || [])
        } catch (err: any) {
            console.error("Failed to fetch user level runs:", err)
            setLevelRunsError(err.message)
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
        fetchUserLevelRuns
    }
}
