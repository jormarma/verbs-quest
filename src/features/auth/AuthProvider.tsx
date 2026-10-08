import { useState, useEffect, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'
import { tables } from '../../lib/spacetime/module_bindings'
import type { User } from '../../lib/spacetime/module_bindings/types'
import {
    getConnection,
    clearStoredToken,
    beginGoogleSession,
    getAuthMethod,
    GOOGLE_CLIENT_ID,
} from '../../lib/spacetime/client'
import { renderGoogleButton, googleSignOut } from './googleAuth'
import { Button } from '../../components/ui/Button'
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher'
import { AuthContext } from './AuthContext'
import { Swords, BookOpen } from 'lucide-react'
import { Scene } from '../../components/3d/Scene'
import { useTranslation } from '../../lib/hooks/useTranslation'

const GOOGLE_ENABLED = GOOGLE_CLIENT_ID.length > 0

function GoogleSignInButton({
    onCredential,
    onError,
}: {
    onCredential: (idToken: string) => void
    onError: () => void
}) {
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const el = ref.current
        if (!el || !GOOGLE_ENABLED) return
        renderGoogleButton(el, GOOGLE_CLIENT_ID, onCredential).catch(() => onError())
    }, [onCredential, onError])
    return <div ref={ref} className="flex justify-center min-h-[44px]" />
}

function Spinner() {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
            <div className="animate-pulse rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        </div>
    )
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation()
    const { isActive: isConnected, identity, connectionError } = useSpacetimeDB()
    const identityHex = identity?.toHexString() ?? null

    const [username, setUsername] = useState('')
    const [authError, setAuthError] = useState('')
    const [isLoadingAuth, setIsLoadingAuth] = useState(false)
    const isGoogleSession = getAuthMethod() === 'google'

    const getErrorMessage = (error: unknown) => {
        if (error instanceof Error) return error.message
        return String(error)
    }

    // ──────────────────────────────────────────────────────────────────────
    // Google sign-in: the GIS button hands us an ID token. We persist it as the
    // SpacetimeDB connection token and reload — the connection is cached by
    // (uri, db), so a reload is the reliable way to reconnect with the new
    // token (mirrors signOut()).
    // ──────────────────────────────────────────────────────────────────────

    const handleGoogleCredential = useCallback((idToken: string) => {
        beginGoogleSession(idToken)
        window.location.reload()
    }, [])

    const handleGoogleError = useCallback(() => setAuthError(t('auth.google_failed')), [t])

    const handleGoogleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthError('')

        if (!/^[a-zA-Z0-9_]+$/.test(username) || username.length < 3 || username.length > 12) {
            setAuthError(t('auth.error.username_chars'))
            return
        }

        setIsLoadingAuth(true)
        try {
            await getConnection().reducers.registerGoogleUser({ username: username.trim() })
            setUsername('')
        } catch (error: unknown) {
            setAuthError(getErrorMessage(error))
        } finally {
            setIsLoadingAuth(false)
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Profile subscription — derive auth state from the user table for
    // the connected identity.
    // ──────────────────────────────────────────────────────────────────────

    const [userRows, userRowsReady] = useTable(tables.user)
    const user: User | null =
        (identityHex && userRows.find((u) => u.identity.toHexString() === identityHex)) || null
    const loading = !identityHex || !userRowsReady
    const hasProfile = user !== null

    const signOut = async () => {
        // "Sign out" locally: clear the stored token + drop the profile.
        // The SDK connection itself stays open but will lose the user row on
        // next reconnect. Reload to fully reset state.
        setUsername('')
        setAuthError('')
        clearStoredToken()
        googleSignOut()
        try {
            getConnection().disconnect()
        } catch {
            // ignore
        }
        window.location.reload()
    }

    if (!isConnected) {
        if (connectionError) {
            // A Google session whose ID token expired fails to reconnect — offer
            // re-authentication instead of the generic "DB unreachable" message.
            if (isGoogleSession && GOOGLE_ENABLED) {
                return (
                    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                        <div className="text-center max-w-md p-6 space-y-4">
                            <h2 className="text-2xl font-black text-amber-400">
                                {t('auth.session_expired_title')}
                            </h2>
                            <p className="text-slate-300">{t('auth.session_expired_subtitle')}</p>
                            <GoogleSignInButton
                                onCredential={handleGoogleCredential}
                                onError={handleGoogleError}
                            />
                            <button
                                onClick={signOut}
                                type="button"
                                className="text-blue-400 hover:text-blue-300 font-semibold hover:underline focus:outline-none transition-colors"
                            >
                                {t('auth.use_other_account')}
                            </button>
                        </div>
                    </div>
                )
            }
            return (
                <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                    <div className="text-center max-w-md p-6">
                        <h2 className="text-2xl font-black text-rose-400 mb-2">
                            Cannot reach the database
                        </h2>
                        <p className="text-slate-300">
                            Make sure SpacetimeDB is running locally
                            (<code className="font-mono text-emerald-300">spacetime start</code>).
                        </p>
                    </div>
                </div>
            )
        }
        return <Spinner />
    }

    if (loading) return <Spinner />

    // Only Google-authenticated connections may play; an anonymous connection
    // always lands on the sign-in screen, even if it once owned a profile.
    if (!isGoogleSession || hasProfile === false) {
        return (
            <div className="relative min-h-screen w-full overflow-hidden text-slate-100">
                <Scene />
                <div className="relative z-10 flex min-h-screen flex-col p-4 md:p-8">
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
                            {authError && (
                                <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-500/50 text-red-200 text-sm text-center">
                                    {authError}
                                </div>
                            )}
                            {isGoogleSession ? (
                                <div className="space-y-4">
                                    <div className="text-center space-y-1">
                                        <h2 className="text-xl font-bold text-white">{t('auth.choose_name_title')}</h2>
                                        <p className="text-sm text-slate-300">{t('auth.choose_name_subtitle')}</p>
                                    </div>
                                    <form onSubmit={handleGoogleRegister} className="space-y-4" autoComplete="off">
                                        <div className="space-y-1 text-left">
                                            <label className="text-sm font-medium text-slate-300">{t('auth.username')}</label>
                                            <input
                                                type="text"
                                                name="vq_google_username"
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
                                        <div className="flex justify-center pt-2">
                                            <Button
                                                type="submit"
                                                variant="default"
                                                disabled={isLoadingAuth}
                                                className="w-fit min-w-[140px] mt-2 h-11 text-base sm:text-lg font-bold"
                                            >
                                                {isLoadingAuth ? '...' : t('auth.confirm_name')}
                                            </Button>
                                        </div>
                                    </form>
                                    <div className="text-center">
                                        <button
                                            onClick={signOut}
                                            type="button"
                                            className="text-blue-400 hover:text-blue-300 font-semibold hover:underline focus:outline-none transition-colors text-sm"
                                        >
                                            {t('auth.use_other_account')}
                                        </button>
                                    </div>
                                </div>
                            ) : GOOGLE_ENABLED ? (
                                <div className="space-y-4 text-center">
                                    <p className="text-slate-300">{t('auth.google_signin_prompt')}</p>
                                    <GoogleSignInButton
                                        onCredential={handleGoogleCredential}
                                        onError={handleGoogleError}
                                    />
                                </div>
                            ) : (
                                <p className="p-3 rounded-lg bg-amber-900/40 border border-amber-500/50 text-amber-200 text-sm text-center">
                                    {t('auth.google_not_configured')}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <AuthContext.Provider
            value={{
                identityHex,
                username: user?.username ?? null,
                role: (user?.role as 'student' | 'admin') ?? null,
                isAuthenticated: hasProfile === true,
                isLoading: false,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}
