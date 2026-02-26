import { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'
import { useAuth } from '../../features/auth/AuthContext'

export function useProfile() {
    const { user } = useAuth()
    const [levelCap, setLevelCap] = useState<number>(1)
    const [role, setRole] = useState<'student' | 'admin'>('student')
    const [isLoadingProfile, setIsLoadingProfile] = useState(true)

    useEffect(() => {
        if (!user) {
            setIsLoadingProfile(false)
            return
        }

        const fetchProfile = async () => {
            setIsLoadingProfile(true)
            try {
                const { data, error } = await supabase
                    .from('users')
                    .select('current_level_cap, role')
                    .eq('id', user.id)
                    .single()

                if (data && !error) {
                    setLevelCap(data.current_level_cap || 1)
                    setRole(data.role as 'student' | 'admin' || 'student')
                }
            } catch (err) {
                console.error("Failed to fetch profile", err)
            } finally {
                setIsLoadingProfile(false)
            }
        }

        fetchProfile()
    }, [user])

    return { levelCap, role, isLoadingProfile }
}
