import { useEffect, useState } from 'react'
import { Save, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useTable } from 'spacetimedb/react'
import { tables } from '../../lib/spacetime/module_bindings'
import { getConnection } from '../../lib/spacetime/client'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../../lib/hooks/useTranslation'

interface SettingsSnapshot {
    timeLimitSeconds: number
    verbsPerLevel: number
}

const TIME_LIMIT_MIN = 60
const TIME_LIMIT_MAX = 300
const VERBS_PER_LEVEL_MIN = 5
const VERBS_PER_LEVEL_MAX = 25

const DEFAULT_SETTINGS: SettingsSnapshot = {
    timeLimitSeconds: 180,
    verbsPerLevel: 5
}

export function AdminSettingsPanel() {
    const { t } = useTranslation()
    const [settingsRows] = useTable(tables.app_setting)
    const [timeLimitInput, setTimeLimitInput] = useState<string>(String(DEFAULT_SETTINGS.timeLimitSeconds))
    const [verbsPerLevelInput, setVerbsPerLevelInput] = useState<string>(String(DEFAULT_SETTINGS.verbsPerLevel))
    const [initialSettings, setInitialSettings] = useState<SettingsSnapshot>(DEFAULT_SETTINGS)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [isSuccessFading, setIsSuccessFading] = useState(false)

    useEffect(() => {
        const row = settingsRows.find((r) => r.id === 1)
        if (!row) return
        const snapshot: SettingsSnapshot = {
            timeLimitSeconds: row.timeLimitSeconds,
            verbsPerLevel: row.verbsPerLevel,
        }
        setInitialSettings(snapshot)
        setTimeLimitInput(String(snapshot.timeLimitSeconds))
        setVerbsPerLevelInput(String(snapshot.verbsPerLevel))
        setIsLoading(false)
    }, [settingsRows])

    useEffect(() => {
        if (!successMessage) {
            setIsSuccessFading(false)
            return
        }

        setIsSuccessFading(false)

        const fadeTimer = window.setTimeout(() => {
            setIsSuccessFading(true)
        }, 5000)

        const clearTimer = window.setTimeout(() => {
            setSuccessMessage(null)
            setIsSuccessFading(false)
        }, 5500)

        return () => {
            window.clearTimeout(fadeTimer)
            window.clearTimeout(clearTimer)
        }
    }, [successMessage])

    const parsedTimeLimit = Number(timeLimitInput)
    const parsedVerbsPerLevel = Number(verbsPerLevelInput)

    const hasChanges =
        parsedTimeLimit !== initialSettings.timeLimitSeconds ||
        parsedVerbsPerLevel !== initialSettings.verbsPerLevel

    const handleReset = () => {
        setTimeLimitInput(String(initialSettings.timeLimitSeconds))
        setVerbsPerLevelInput(String(initialSettings.verbsPerLevel))
        setErrorMessage(null)
        setSuccessMessage(null)
        setIsSuccessFading(false)
    }

    const handleSave = async () => {
        setSuccessMessage(null)
        setIsSuccessFading(false)
        setErrorMessage(null)

        setIsSaving(true)

        try {
            const conn = getConnection()
            await conn.reducers.updateAppSettings({
                timeLimitSeconds: parsedTimeLimit,
                verbsPerLevel: parsedVerbsPerLevel,
            })
            setInitialSettings({ timeLimitSeconds: parsedTimeLimit, verbsPerLevel: parsedVerbsPerLevel })
            setTimeLimitInput(String(parsedTimeLimit))
            setVerbsPerLevelInput(String(parsedVerbsPerLevel))
            setSuccessMessage(t('admin.settings.saved_successfully'))
        } catch (err) {
            const message = err instanceof Error ? err.message : t('admin.settings.save_error')
            setErrorMessage(message)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-x-hidden">
            <div className="flex-1 min-h-0 p-4 md:p-6 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="max-w-3xl mx-auto space-y-7">
                    {isLoading ? (
                        <div className="py-10 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                <div className="flex items-baseline gap-2">
                                    <label htmlFor="time_limit_seconds" className="text-sm font-semibold text-slate-200">
                                        {t('admin.settings.time_limit_label')}:
                                    </label>
                                    <span className="text-xl font-black text-emerald-400 leading-none">
                                        {parsedTimeLimit}
                                    </span>
                                </div>
                                <input
                                    id="time_limit_seconds"
                                    type="range"
                                    min={TIME_LIMIT_MIN}
                                    max={TIME_LIMIT_MAX}
                                    step={5}
                                    value={timeLimitInput}
                                    onChange={(event) => {
                                        setTimeLimitInput(event.target.value)
                                        setErrorMessage(null)
                                        setSuccessMessage(null)
                                        setIsSuccessFading(false)
                                    }}
                                    className="admin-slider w-full"
                                />
                                <div className="mt-3 flex items-center justify-between text-xs text-slate-400 font-mono">
                                    <span>{TIME_LIMIT_MIN}</span>
                                    <span>{TIME_LIMIT_MAX}</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-baseline gap-2">
                                    <label htmlFor="verbs_per_level" className="text-sm font-semibold text-slate-200">
                                        {t('admin.settings.verbs_per_level_label')}:
                                    </label>
                                    <span className="text-xl font-black text-emerald-400 leading-none">
                                        {parsedVerbsPerLevel}
                                    </span>
                                </div>
                                <input
                                    id="verbs_per_level"
                                    type="range"
                                    min={VERBS_PER_LEVEL_MIN}
                                    max={VERBS_PER_LEVEL_MAX}
                                    step={1}
                                    value={verbsPerLevelInput}
                                    onChange={(event) => {
                                        setVerbsPerLevelInput(event.target.value)
                                        setErrorMessage(null)
                                        setSuccessMessage(null)
                                        setIsSuccessFading(false)
                                    }}
                                    className="admin-slider w-full"
                                />
                                <div className="mt-3 flex items-center justify-between text-xs text-slate-400 font-mono">
                                    <span>{VERBS_PER_LEVEL_MIN}</span>
                                    <span>{VERBS_PER_LEVEL_MAX}</span>
                                </div>
                            </div>

                            {errorMessage && (
                                <div className="rounded-md border border-rose-500/40 bg-rose-950/30 p-3 text-rose-200 text-sm">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                        <p>{errorMessage}</p>
                                    </div>
                                </div>
                            )}

                            {successMessage && (
                                <div className={`rounded-md border border-emerald-500/40 bg-emerald-950/30 p-3 text-emerald-200 text-sm transition-opacity duration-500 ${isSuccessFading ? 'opacity-0' : 'opacity-100'}`}>
                                    <div className="flex items-start gap-2">
                                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                                        <p>{successMessage}</p>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="shrink-0 border-t border-slate-700/70 bg-slate-900/40 px-4 md:px-6 py-3">
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center justify-center gap-3 flex-nowrap">
                        <Button
                            variant="outline"
                            onClick={handleReset}
                            disabled={isLoading || !hasChanges || isSaving}
                            className="min-w-[140px] justify-center"
                        >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            {t('admin.settings.reset')}
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isLoading || !hasChanges || isSaving}
                            className="min-w-[140px] justify-center"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {isSaving ? t('admin.settings.saving') : t('admin.settings.save')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}