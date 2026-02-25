import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import { Button } from '../../components/ui/Button'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    // Auth UI State
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [isRegistering, setIsRegistering] = useState(false)
    const [authError, setAuthError] = useState('')
    const [isLoadingAuth, setIsLoadingAuth] = useState(false)

    useEffect(() => {
        // 1. Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setUser(session?.user ?? null)
            setLoading(false)
        })

        // 2. Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            setUser(session?.user ?? null)
            setLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [])

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthError('')
        setIsLoadingAuth(true)

        // Supabase strictly requires email or phone. 
        // We simulate "username" auth by appending a dummy domain under the hood. 
        // Using a .com domain is required to pass Supabase's internal regex validator.
        const simulatedEmail = `${username.toLowerCase().trim().replace(/[^a-z0-9]/g, '')}@verbsquest.com`

        try {
            if (isRegistering) {
                const { error } = await supabase.auth.signUp({
                    email: simulatedEmail,
                    password,
                    options: {
                        data: {
                            full_name: username.trim()
                        }
                    }
                })
                if (error) throw error
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email: simulatedEmail,
                    password,
                })
                if (error) throw error
            }
        } catch (error: any) {
            let msg = error.message
            // Aggressively sanitize the error message so the illusion is maintained
            msg = msg.replace(simulatedEmail, `"${username}"`)
            msg = msg.replace(/email/gi, 'username')
            setAuthError(msg)
        } finally {
            setIsLoadingAuth(false)
        }
    }

    const signOut = async () => {
        await supabase.auth.signOut()
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                <div className="animate-pulse rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
            </div>
        )
    }

    // Render Auth Gates if no session exists natively
    if (!session) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative z-50">
                <div className="max-w-md w-full bg-slate-800/90 backdrop-blur p-8 rounded-2xl border border-slate-700 shadow-2xl">
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 drop-shadow-sm">
                            VERBS QUEST
                        </h1>
                        <p className="text-slate-400 mt-2 font-medium">
                            {isRegistering ? 'Create your player profile.' : 'Sign in to jump back into the quest.'}
                        </p>
                    </div>

                    <form onSubmit={handleAuth} className="space-y-4">
                        {authError && (
                            <div className="p-3 rounded-lg bg-red-900/50 border border-red-500/50 text-red-200 text-sm text-center">
                                {authError}
                            </div>
                        )}

                        <div className="space-y-1 text-left">
                            <label className="text-sm font-medium text-slate-300">Username</label>
                            <input
                                type="text"
                                required
                                minLength={3}
                                maxLength={20}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Player123"
                                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                            />
                        </div>
                        <div className="space-y-1 text-left">
                            <label className="text-sm font-medium text-slate-300">Password</label>
                            <input
                                type="password"
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoadingAuth}
                            className="w-full mt-6 h-12 text-lg font-bold bg-blue-600 hover:bg-blue-500 shadow-lg hover:shadow-blue-500/25 transition-all text-white"
                        >
                            {isLoadingAuth ? '...' : (isRegistering ? 'Create Profile' : 'Play Now')}
                        </Button>
                    </form>

                    <div className="mt-8 text-center text-sm text-slate-400">
                        {isRegistering ? 'Already have a profile? ' : "New player? "}
                        <button
                            onClick={() => {
                                setIsRegistering(!isRegistering)
                                setAuthError('')
                            }}
                            type="button"
                            className="text-blue-400 hover:text-blue-300 font-semibold hover:underline focus:outline-none transition-colors"
                        >
                            {isRegistering ? 'Sign In' : 'Sign Up'}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // Authenticated: Provide contexts and render Children
    return (
        <AuthContext.Provider value={{ session, user, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}
