import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useUser } from '@clerk/clerk-react'

export function useSelfHeal() {
    const { user, isLoaded, isSignedIn } = useUser()
    const [isHealing, setIsHealing] = useState(false)

    const checkAndHealUser = useCallback(async () => {
        if (!isLoaded || !isSignedIn || !user) return

        setIsHealing(true)
        try {
            // Check if user exists in our DB
            const { data, error } = await supabase
                .from('users')
                .select('id')
                .eq('id', user.id)
                .single()

            if (error && error.code === 'PGRST116') { // PGRST116 is PostgreSQL's NO DATA FOUND error
                console.warn('User not found in Supabase (Webhook race condition). Self-healing...')
                const displayUsername = user.username || user.firstName || 'Student'

                const { error: healError } = await supabase.rpc('sync_user_fallback', {
                    p_username: displayUsername
                })

                if (healError) throw healError
                console.log('Self-heal complete.')
            }
        } catch (e) {
            console.error('Self-heal error:', e)
        } finally {
            setIsHealing(false)
        }
    }, [user, isLoaded, isSignedIn])

    return { checkAndHealUser, isHealing }
}
