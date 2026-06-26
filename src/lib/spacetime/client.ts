// Verbs Quest — SpacetimeDB client module
//
// Provides a shared connection builder for SpacetimeDBProvider and helpers
// for imperative access (reducers, procedures) from non-hook code.

import { DbConnection, tables, reducers, procedures } from './module_bindings'

export const STDB_TOKEN_KEY = 'verbs-quest.stdb.token'
export const STDB_DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB ?? 'verbs-quest'
export const STDB_URI = import.meta.env.VITE_SPACETIMEDB_URI ?? 'ws://127.0.0.1:3000'

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
    } catch {
        // ignore
    }
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
