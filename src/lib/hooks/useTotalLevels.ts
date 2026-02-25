import { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'

export function useTotalLevels() {
    const [totalLevels, setTotalLevels] = useState<number>(0)
    const [isLoadingTotalLevels, setIsLoadingTotalLevels] = useState(true)

    useEffect(() => {
        let isMounted = true

        const fetchTotalLevels = async () => {
            setIsLoadingTotalLevels(true)
            try {
                // Fetch the highest level_group from the verbs table
                const { data, error } = await supabase
                    .from('verbs')
                    .select('level_group')
                    .order('level_group', { ascending: false })
                    .limit(1)

                if (isMounted) {
                    if (data && data.length > 0 && !error) {
                        setTotalLevels(data[0].level_group)
                    } else {
                        setTotalLevels(18) // Graceful fallback
                    }
                }
            } catch (err) {
                console.error("Failed to fetch total levels", err)
                if (isMounted) setTotalLevels(18) // fallback
            } finally {
                if (isMounted) setIsLoadingTotalLevels(false)
            }
        }

        fetchTotalLevels()

        return () => {
            isMounted = false
        }
    }, [])

    return { totalLevels, isLoadingTotalLevels }
}
