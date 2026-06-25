import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { tables } from '../../lib/spacetime/module_bindings'

export function useTotalLevels() {
    const [verbs] = useTable(tables.verb)

    const totalLevels = useMemo(() => {
        let max = 0
        for (const v of verbs) {
            if (v.active && v.levelGroup > max) max = v.levelGroup
        }
        return max
    }, [verbs])

    return {
        totalLevels: totalLevels > 0 ? totalLevels : 18, // fallback when no active verbs yet
        isLoadingTotalLevels: false,
    }
}