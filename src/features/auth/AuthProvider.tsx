import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import { Button } from '../../components/ui/Button'
import { AuthContext } from './AuthContext'
import { Swords, BookOpen } from 'lucide-react'

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    // Auth UI State
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [repeatPassword, setRepeatPassword] = useState('')
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

        if (isRegistering && password !== repeatPassword) {
            setAuthError('Passwords do not match.')
            return
        }

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
            <div className="min-h-screen bg-slate-900 flex flex-col p-4 md:p-8 relative z-50">
                {/* Header matching the app */}
                <header className="flex flex-col w-full max-w-5xl mx-auto gap-2 sm:gap-4 mb-2 sm:mb-4">
                    <div className="flex flex-col items-center w-full">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <BookOpen className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-blue-400" strokeWidth={2.5} />
                            <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 drop-shadow-sm">
                                VERBS QUEST
                            </h1>
                            <Swords className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-emerald-400" strokeWidth={2.5} />
                        </div>
                        <p className="mt-2 text-slate-300 font-semibold text-center text-sm sm:text-lg max-w-lg">
                            Master English irregular verbs<br />through an epic adventure!
                        </p>
                    </div>
                </header>

                <div className="flex-1 flex items-center justify-center -mt-8 sm:-mt-16">
                    <div className="max-w-md w-full bg-slate-800/90 backdrop-blur p-6 sm:px-8 py-6 rounded-2xl border border-slate-700 shadow-2xl">
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
                                    className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
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
                                    className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                                />
                            </div>

                            {isRegistering && (
                                <div className="space-y-1 text-left animate-in fade-in slide-in-from-top-1">
                                    <label className="text-sm font-medium text-slate-300">Repeat Password</label>
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={repeatPassword}
                                        onChange={(e) => {
                                            setRepeatPassword(e.target.value)
                                            if (authError === 'Passwords do not match.') {
                                                setAuthError('')
                                            }
                                        }}
                                        className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                                    />
                                </div>
                            )}

                            <div className="flex justify-center pt-2">
                                <Button
                                    type="submit"
                                    variant="default"
                                    disabled={isLoadingAuth}
                                    className="w-fit min-w-[140px] mt-2 h-11 text-base sm:text-lg font-bold"
                                >
                                    {isLoadingAuth ? '...' : (isRegistering ? 'Create Profile' : 'Play Now')}
                                </Button>
                            </div>
                        </form>

                        <div className="mt-6 text-center text-sm text-slate-400">
                            {isRegistering ? 'Already have a profile? ' : "New player? "}
                            <button
                                onClick={() => {
                                    setIsRegistering(!isRegistering)
                                    setAuthError('')
                                    setRepeatPassword('')
                                }}
                                type="button"
                                className="text-blue-400 hover:text-blue-300 font-semibold hover:underline focus:outline-none transition-colors"
                            >
                                {isRegistering ? 'Sign In' : 'Sign Up'}
                            </button>
                        </div>
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
