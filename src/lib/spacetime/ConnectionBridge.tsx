import { useEffect, type ReactNode } from 'react'
import { useSpacetimeDB } from 'spacetimedb/react'
import { setProviderConnection } from './client'
import type { DbConnection } from './module_bindings'

/** Registers the provider-managed connection for imperative getConnection() callers. */
export function ConnectionBridge({ children }: { children: ReactNode }) {
    const { getConnection, isActive } = useSpacetimeDB()

    useEffect(() => {
        if (!isActive) {
            setProviderConnection(null)
            return
        }
        const conn = getConnection()
        setProviderConnection(conn as DbConnection)
        return () => setProviderConnection(null)
    }, [getConnection, isActive])

    return children
}
