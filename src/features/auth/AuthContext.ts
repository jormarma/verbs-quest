import { createContext, useContext } from 'react'

/**
 * The AuthContext no longer wraps a Supabase Session — SpacetimeDB identities
 * are implicit in the connection. We only expose the bare minimum the UI
 * needs to render: whether a profile row exists for the connected identity,
 * and the username for display.
 */
export interface AuthContextType {
    identityHex: string | null
    username: string | null
    role: 'student' | 'admin' | null
    isAuthenticated: boolean
    isLoading: boolean
    signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}