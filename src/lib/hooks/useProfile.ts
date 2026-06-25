import { useTable } from 'spacetimedb/react'
import { tables } from '../../lib/spacetime/module_bindings'
import { useAuth } from '../../features/auth/AuthContext'

export function useProfile() {
    const { identityHex, isAuthenticated } = useAuth()
    const [userRows] = useTable(tables.user)
    const me = userRows.find((u) => u.identity.toHexString() === identityHex)
    const levelCap = me?.currentLevelCap ?? 1
    const role = (me?.role as 'student' | 'admin' | undefined) ?? 'student'
    return { levelCap, role, isLoadingProfile: !isAuthenticated }
}