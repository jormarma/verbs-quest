// Verbs Quest — SpacetimeDB client module
//
// Replaces the old Supabase client. Provides a single shared DbConnection
// instance and the auth helpers needed to register/login from the web app.
// Identities are auto-generated per device and persisted via localStorage
// token (the SDK handles signing with its embedded private key).

import { DbConnection, tables, reducers, procedures } from './module_bindings'

export const STDB_TOKEN_KEY = 'verbs-quest.stdb.token'
export const STDB_DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB ?? 'verbs-quest'
export const STDB_URI = import.meta.env.VITE_SPACETIMEDB_URI ?? 'ws://127.0.0.1:3000'

let _conn: DbConnection | null = null
let _connecting: Promise<DbConnection> | null = null

/**
 * Build a new connection. We construct it lazily on first call and reuse it
 * thereafter. The SDK will either resume an existing identity (when we pass
 * a previously-issued token from localStorage) or mint a new one.
 */
export function getConnection(): DbConnection {
    if (_conn) return _conn
    if (_connecting) {
        // Should be rare — caller is racing with another getConnection().
        // We don't await here; the caller can rely on the connection's
        // own onConnect callback or use the helpers below that wait for it.
        throw new Error('Connection is initializing; await connect() instead.')
    }
    const token = readToken()
    _conn = DbConnection.builder()
        .withUri(STDB_URI)
        .withDatabaseName(STDB_DB_NAME)
        .withToken(token ?? undefined)
        .onConnect((_ctx, identity, token) => {
            // Persist the freshly-issued token so subsequent page loads reuse
            // the same identity. This is the equivalent of Supabase's
            // persisted session.
            if (token) writeToken(token)
            console.info('[stdb] connected as', identity.toHexString())
        })
        .onDisconnect(() => {
            console.warn('[stdb] disconnected')
        })
        .onConnectError((_ctx, err) => {
            console.error('[stdb] connect error:', err)
        })
        .build()
    return _conn
}

/**
 * Awaitable connect: returns the connection once `onConnect` has fired.
 * Stores the token and resolves with the assigned identity.
 */
export function connect(): Promise<{ conn: DbConnection; identityHex: string }> {
    if (_conn?.isActive) {
        return Promise.resolve({
            conn: _conn,
            identityHex: _conn.identity?.toHexString() ?? '',
        })
    }
    if (_connecting) {
        return _connecting.then((conn) => ({
            conn,
            identityHex: conn.identity?.toHexString() ?? '',
        }))
    }
    const conn = getConnection()
    _connecting = new Promise<DbConnection>((resolve, reject) => {
        // The SDK fires onConnect before returning from .build(), so we
        // need to either await isActive or hook our own promise. The
        // simplest way: poll isActive for up to 10s.
        const start = Date.now()
        const interval = setInterval(() => {
            if (conn.isActive) {
                clearInterval(interval)
                resolve(conn)
            } else if (Date.now() - start > 10_000) {
                clearInterval(interval)
                reject(new Error('SpacetimeDB connection timeout'))
            }
        }, 50)
    })
    return _connecting.then((conn) => ({
        conn,
        identityHex: conn.identity?.toHexString() ?? '',
    }))
}

export { tables, reducers, procedures }

// ─────────────────────────────────────────────────────────────────────────────
// Token persistence
// ─────────────────────────────────────────────────────────────────────────────

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
    } catch {
        // ignore
    }
}