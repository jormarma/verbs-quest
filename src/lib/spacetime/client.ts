// Verbs Quest — SpacetimeDB client module
//
// Provides a shared connection builder for SpacetimeDBProvider and helpers
// for imperative access (reducers, procedures) from non-hook code.

import { DbConnection, tables, reducers, procedures } from './module_bindings'

export const STDB_TOKEN_KEY = 'verbs-quest.stdb.token'
export const AUTH_METHOD_KEY = 'verbs-quest.auth.method'
export const STDB_DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB ?? 'verbs-quest'
export const STDB_URI = import.meta.env.VITE_SPACETIMEDB_URI ?? 'ws://127.0.0.1:3000'

/**
 * Public Google OAuth 2.0 Web client ID (e.g. `xxx.apps.googleusercontent.com`).
 * Empty when unset — the UI hides the Google button so the rest of the app keeps
 * working. This is a *public* value (the client *secret* is never used in the
 * browser ID-token flow), so it is safe to ship in the bundle.
 */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export type AuthMethod = 'anonymous' | 'google'

export function getAuthMethod(): AuthMethod {
    try {
        return localStorage.getItem(AUTH_METHOD_KEY) === 'google' ? 'google' : 'anonymous'
    } catch {
        return 'anonymous'
    }
}

export function setAuthMethod(method: AuthMethod): void {
    try {
        localStorage.setItem(AUTH_METHOD_KEY, method)
    } catch {
        // ignore
    }
}

let _conn: DbConnection | null = null

/** Called by ConnectionBridge once SpacetimeDBProvider has an active connection. */
export function setProviderConnection(conn: DbConnection | null): void {
    _conn = conn
}

/**
 * Returns the live connection managed by SpacetimeDBProvider.
 * Throws if the provider has not connected yet.
 */
export function getConnection(): DbConnection {
    if (!_conn) {
        throw new Error('SpacetimeDB is not connected yet')
    }
    return _conn
}

function readToken(): string | null {
    try {
        return localStorage.getItem(STDB_TOKEN_KEY)
    } catch {
        return null
    }
}

function writeToken(token: string): void {
    try {
        localStorage.setItem(STDB_TOKEN_KEY, token)
    } catch {
        // Ignore quota errors — best-effort persistence.
    }
}

export function clearStoredToken(): void {
    try {
        localStorage.removeItem(STDB_TOKEN_KEY)
        localStorage.removeItem(AUTH_METHOD_KEY)
    } catch {
        // ignore
    }
}

/**
 * Persists a Google ID token as the SpacetimeDB connection token and marks the
 * session as Google-authenticated. The caller should reload the page afterwards:
 * the connection is keyed by (uri, db) and cached, so a reload is the reliable
 * way to reconnect with the new token (this mirrors how signOut works).
 */
export function beginGoogleSession(idToken: string): void {
    writeToken(idToken)
    setAuthMethod('google')
}

/** Singleton builder passed to SpacetimeDBProvider. */
export const connectionBuilder = DbConnection.builder()
    .withUri(STDB_URI)
    .withDatabaseName(STDB_DB_NAME)
    .withToken(readToken() ?? undefined)
    .onConnect((_ctx, identity, token) => {
        if (token) writeToken(token)
        console.info('[stdb] connected as', identity.toHexString())
    })
    .onDisconnect(() => {
        console.warn('[stdb] disconnected')
    })
    .onConnectError((_ctx, err) => {
        console.error('[stdb] connect error:', err)
    })

export { tables, reducers, procedures }
