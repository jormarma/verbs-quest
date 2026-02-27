import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'

export interface AppSettings {
    timeLimitSeconds: number
    verbsPerLevel: number
    activeVerbCategory: 1 | 2 | 3
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
    timeLimitSeconds: 180,
    verbsPerLevel: 5,
    activeVerbCategory: 1
}

function normalizeActiveCategory(value: unknown): 1 | 2 | 3 {
    return value === 2 || value === 3 ? value : 1
}

export function useAppSettings() {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
    const [isLoadingSettings, setIsLoadingSettings] = useState(true)

    useEffect(() => {
        let isMounted = true

        const fetchSettings = async () => {
            setIsLoadingSettings(true)

            try {
                const { data, error } = await supabase
                    .from('app_settings')
                    .select('time_limit_seconds, verbs_per_level, active_verb_category')
                    .eq('id', 1)
                    .maybeSingle()

                if (error) throw error

                if (isMounted && data) {
                    setSettings({
                        timeLimitSeconds: data.time_limit_seconds ?? DEFAULT_APP_SETTINGS.timeLimitSeconds,
                        verbsPerLevel: data.verbs_per_level ?? DEFAULT_APP_SETTINGS.verbsPerLevel,
                        activeVerbCategory: normalizeActiveCategory(data.active_verb_category)
                    })
                }
            } catch (err) {
                console.error('Failed to fetch app settings', err)
                if (isMounted) {
                    setSettings(DEFAULT_APP_SETTINGS)
                }
            } finally {
                if (isMounted) {
                    setIsLoadingSettings(false)
                }
            }
        }

        fetchSettings()

        return () => {
            isMounted = false
        }
    }, [])

    return { settings, isLoadingSettings }
}
