import { useTable } from 'spacetimedb/react'
import { tables } from '../../lib/spacetime/module_bindings'

export interface AppSettings {
    timeLimitSeconds: number
    verbsPerLevel: number
    activeVerbCategory: 1 | 2 | 3
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
    timeLimitSeconds: 180,
    verbsPerLevel: 5,
    activeVerbCategory: 1
}

function normalizeActiveCategory(value: number | undefined): 1 | 2 | 3 {
    return value === 2 || value === 3 ? value : 1
}

export function useAppSettings() {
    const [settingsRows] = useTable(tables.app_setting)
    const settingsRow = settingsRows.find((r) => r.id === 1)

    const settings: AppSettings = settingsRow
        ? {
            timeLimitSeconds: settingsRow.timeLimitSeconds ?? DEFAULT_APP_SETTINGS.timeLimitSeconds,
            verbsPerLevel: settingsRow.verbsPerLevel ?? DEFAULT_APP_SETTINGS.verbsPerLevel,
            activeVerbCategory: normalizeActiveCategory(settingsRow.activeVerbCategory),
        }
        : DEFAULT_APP_SETTINGS

    return { settings, isLoadingSettings: false }
}