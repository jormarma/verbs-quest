import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import { Button } from '../../components/ui/Button'
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher'
import { AuthContext } from './AuthContext'
import { Swords, BookOpen } from 'lucide-react'
import { Scene } from '../../components/3d/Scene'
import { useTranslation } from '../../lib/hooks/useTranslation'

export function AuthProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation()
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
    const usernameInputRef = useRef<HTMLInputElement>(null)
    const passwordInputRef = useRef<HTMLInputElement>(null)
    const repeatPasswordInputRef = useRef<HTMLInputElement>(null)

    const resetAuthForm = () => {
        setUsername('')
        setPassword('')
        setRepeatPassword('')
        setAuthError('')
        setIsRegistering(false)
    }

    useEffect(() => {
        // 1. Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setUser(session?.user ?? null)
            if (!session) {
                resetAuthForm()
            }
            setLoading(false)
        })

        // 2. Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            setUser(session?.user ?? null)
            if (!session) {
                resetAuthForm()
            }
            setLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [])

    useEffect(() => {
        if (loading || session) return

        const clearNativeInputs = () => {
            if (usernameInputRef.current) usernameInputRef.current.value = ''
            if (passwordInputRef.current) passwordInputRef.current.value = ''
            if (repeatPasswordInputRef.current) repeatPasswordInputRef.current.value = ''
        }

        clearNativeInputs()
        const timeoutId = window.setTimeout(clearNativeInputs, 0)
        return () => window.clearTimeout(timeoutId)
    }, [loading, session, isRegistering])

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthError('')

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            setAuthError(t('auth.error.username_chars'))
            return
        }

        if (isRegistering && password !== repeatPassword) {
            setAuthError(t('auth.error.password_mismatch'))
            return
        }

        setIsLoadingAuth(true)

        // Supabase strictly requires email or phone. 
        // We simulate "username" auth by appending a dummy domain under the hood. 
        // Using a .com domain is required to pass Supabase's internal regex validator.
        // We preserve underscores to guarantee that identical alphanumeric strings with different underscores are unique.
        const simulatedEmail = `${username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '')}@verbsquest.com`

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

            // Clear the form fields upon successful completion
            setUsername('')
            setPassword('')
            setRepeatPassword('')
            setAuthError('')
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
        // Ensure returning to login is always a fresh start
        resetAuthForm()
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
            <div className="relative min-h-screen w-full overflow-hidden text-slate-100">
                <Scene />
                <div className="relative z-10 flex min-h-screen flex-col p-4 md:p-8">
                    {/* Header matching the app */}
                    <header className="flex flex-col w-full max-w-5xl mx-auto gap-2 sm:gap-4 mb-2 sm:mb-4">
                        <div className="flex flex-col items-center w-full">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <BookOpen className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-blue-400" strokeWidth={2.5} />
                                <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 drop-shadow-sm">
                                    {t('app.title')}
                                </h1>
                                <Swords className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-emerald-400" strokeWidth={2.5} />
                            </div>
                            <p className="mt-2 text-slate-300 font-semibold text-center text-sm sm:text-lg max-w-lg">
                                {t('auth.tagline')}
                            </p>
                        </div>
                    </header>

                    <div className="flex-1 flex items-center justify-center -mt-8 sm:-mt-16">
                        <div className="max-w-md w-full p-6 sm:px-8 py-6 rounded-2xl bg-transparent border border-transparent shadow-none">
                            <div className="flex justify-end mb-3">
                                <LanguageSwitcher />
                            </div>
                            <form onSubmit={handleAuth} className="space-y-4" autoComplete="off">
                                {authError && (
                                    <div className="p-3 rounded-lg bg-red-900/50 border border-red-500/50 text-red-200 text-sm text-center">
                                        {authError}
                                    </div>
                                )}

                                <div className="space-y-1 text-left">
                                    <label className="text-sm font-medium text-slate-300">{t('auth.username')}</label>
                                    <input
                                        ref={usernameInputRef}
                                        type="text"
                                        name="vq_username"
                                        required
                                        minLength={3}
                                        maxLength={12}
                                        pattern="^[a-zA-Z0-9_]+$"
                                        title={t('auth.username_hint')}
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder={t('auth.placeholder_username')}
                                        autoComplete="off"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                                    />
                                </div>
                                <div className="space-y-1 text-left">
                                    <label className="text-sm font-medium text-slate-300">{t('auth.password')}</label>
                                    <input
                                        ref={passwordInputRef}
                                        type="password"
                                        name="vq_password"
                                        required
                                        minLength={6}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="off"
                                        className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                                    />
                                </div>

                                {isRegistering && (
                                    <div className="space-y-1 text-left animate-in fade-in slide-in-from-top-1">
                                        <label className="text-sm font-medium text-slate-300">{t('auth.repeat_password')}</label>
                                        <input
                                            ref={repeatPasswordInputRef}
                                            type="password"
                                            name="vq_repeat_password"
                                            required
                                            minLength={6}
                                            value={repeatPassword}
                                            onChange={(e) => {
                                                setRepeatPassword(e.target.value)
                                                setAuthError('')
                                            }}
                                            autoComplete="off"
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
                                        {isLoadingAuth ? '...' : (isRegistering ? t('auth.create_profile') : t('auth.play_now'))}
                                    </Button>
                                </div>
                            </form>

                            <div className="mt-6 text-center text-sm text-slate-400">
                                {isRegistering ? t('auth.already_have_profile') : t('auth.new_player')}
                                <button
                                    onClick={() => {
                                        setIsRegistering(!isRegistering)
                                        setAuthError('')
                                        setRepeatPassword('')
                                    }}
                                    type="button"
                                    className="text-blue-400 hover:text-blue-300 font-semibold hover:underline focus:outline-none transition-colors"
                                >
                                    {isRegistering ? t('auth.signin') : t('auth.signup')}
                                </button>
                            </div>
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
