import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, AlertCircle, ListChecks } from 'lucide-react'
import { supabase } from '../../lib/supabase/client'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../../lib/hooks/useTranslation'

type VerbCategory = 1 | 2 | 3

interface CategoryStats {
    totalVerbs: number
    totalLevels: number
    activeVerbs: number
}

const CATEGORY_META: Array<{ value: VerbCategory; labelKey: string; descriptionKey: string }> = [
    {
        value: 1,
        labelKey: 'admin.verbs.category_basic',
        descriptionKey: 'admin.verbs.category_basic_desc'
    },
    {
        value: 2,
        labelKey: 'admin.verbs.category_complete',
        descriptionKey: 'admin.verbs.category_complete_desc'
    },
    {
        value: 3,
        labelKey: 'admin.verbs.category_extreme',
        descriptionKey: 'admin.verbs.category_extreme_desc'
    }
]

function normalizeCategory(value: unknown): VerbCategory {
    return value === 2 || value === 3 ? value : 1
}

function emptyStatsMap(): Record<VerbCategory, CategoryStats> {
    return {
        1: { totalVerbs: 0, totalLevels: 0, activeVerbs: 0 },
        2: { totalVerbs: 0, totalLevels: 0, activeVerbs: 0 },
        3: { totalVerbs: 0, totalLevels: 0, activeVerbs: 0 }
    }
}

export function AdminVerbsPanel() {
    const { t, language } = useTranslation()
    const [selectedCategory, setSelectedCategory] = useState<VerbCategory>(1)
    const [initialCategory, setInitialCategory] = useState<VerbCategory>(1)
    const [statsByCategory, setStatsByCategory] = useState<Record<VerbCategory, CategoryStats>>(emptyStatsMap)

    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [isSuccessFading, setIsSuccessFading] = useState(false)

    const hasChanges = selectedCategory !== initialCategory

    const loadPanelData = useCallback(async () => {
        setIsLoading(true)
        setErrorMessage(null)

        try {
            const [settingsResult, verbsResult] = await Promise.all([
                supabase
                    .from('app_settings')
                    .select('active_verb_category')
                    .eq('id', 1)
                    .single(),
                supabase
                    .from('verbs')
                    .select('category, level_group, active')
            ])

            if (settingsResult.error) throw settingsResult.error
            if (verbsResult.error) throw verbsResult.error

            const nextInitialCategory = normalizeCategory(settingsResult.data.active_verb_category)

            const nextStats = emptyStatsMap()
            const levelsByCategory: Record<VerbCategory, Set<number>> = {
                1: new Set<number>(),
                2: new Set<number>(),
                3: new Set<number>()
            }

            for (const row of verbsResult.data ?? []) {
                const category = normalizeCategory(row.category)
                nextStats[category].totalVerbs += 1
                levelsByCategory[category].add(row.level_group)

                if (row.active) {
                    nextStats[category].activeVerbs += 1
                }
            }

            nextStats[1].totalLevels = levelsByCategory[1].size
            nextStats[2].totalLevels = levelsByCategory[2].size
            nextStats[3].totalLevels = levelsByCategory[3].size

            setInitialCategory(nextInitialCategory)
            setSelectedCategory(nextInitialCategory)
            setStatsByCategory(nextStats)
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : language === 'es'
                    ? 'No se pudieron cargar las categorías de verbos.'
                    : 'Failed to load verb categories.'
            setErrorMessage(message)
            setStatsByCategory(emptyStatsMap())
        } finally {
            setIsLoading(false)
        }
    }, [language])

    useEffect(() => {
        loadPanelData()
    }, [loadPanelData])

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

    const handleApplyCategory = async () => {
        if (!hasChanges) return

        setErrorMessage(null)
        setSuccessMessage(null)
        setIsSuccessFading(false)
        setIsSaving(true)

        try {
            const { data, error } = await supabase.rpc('set_active_verb_category', {
                p_category: selectedCategory
            })

            if (error) throw error

            const usersClamped = typeof data?.users_clamped === 'number' ? data.users_clamped : 0

            setInitialCategory(selectedCategory)
            setSuccessMessage(
                usersClamped > 0
                    ? t('admin.verbs.saved_successfully_clamped', { count: usersClamped })
                    : t('admin.verbs.saved_successfully')
            )
            await loadPanelData()
        } catch (err) {
            const message = err instanceof Error ? err.message : t('admin.verbs.save_error')
            setErrorMessage(message)
        } finally {
            setIsSaving(false)
        }
    }

    const selectedStats = useMemo(() => statsByCategory[selectedCategory], [selectedCategory, statsByCategory])

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-x-hidden">
            <div className="flex-1 min-h-0 p-4 md:p-6 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="max-w-3xl mx-auto space-y-6">
                    {isLoading ? (
                        <div className="py-10 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                        </div>
                    ) : (
                        <>
                            <div className="rounded-xl border border-slate-700/70 bg-slate-900/30 p-4 md:p-5">
                                <div className="flex items-center gap-2 text-slate-100 font-semibold text-sm md:text-base">
                                    <ListChecks className="w-4 h-4 text-emerald-400" />
                                    <span>{t('admin.verbs.selector_title')}</span>
                                </div>
                                <p className="mt-2 text-xs md:text-sm text-slate-400">{t('admin.verbs.selector_subtitle')}</p>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:gap-4">
                                {CATEGORY_META.map((category) => {
                                    const isSelected = selectedCategory === category.value
                                    const categoryStats = statsByCategory[category.value]
                                    const isActive = initialCategory === category.value

                                    return (
                                        <button
                                            key={category.value}
                                            type="button"
                                            onClick={() => {
                                                setSelectedCategory(category.value)
                                                setErrorMessage(null)
                                                setSuccessMessage(null)
                                                setIsSuccessFading(false)
                                            }}
                                            className={`w-full rounded-xl border p-4 md:p-5 text-left transition-colors ${isSelected
                                                ? 'border-blue-500/80 bg-blue-950/25'
                                                : 'border-slate-700/70 bg-slate-900/20 hover:border-slate-600 hover:bg-slate-900/40'
                                                }`}
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm md:text-base font-black text-slate-100 uppercase tracking-wide">
                                                    {t(category.labelKey)}
                                                </span>
                                                {isActive && (
                                                    <span className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-950/40 px-2 py-0.5 text-[10px] md:text-xs font-bold text-emerald-300 uppercase tracking-wide">
                                                        {t('admin.verbs.active_badge')}
                                                    </span>
                                                )}
                                            </div>

                                            <p className="mt-1 text-xs md:text-sm text-slate-300">{t(category.descriptionKey)}</p>

                                            <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:text-sm">
                                                <div>
                                                    <span className="text-slate-400">{t('admin.verbs.total_verbs')}</span>
                                                    <p className="text-slate-100 font-semibold mt-1">{categoryStats.totalVerbs}</p>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400">{t('admin.verbs.total_levels')}</span>
                                                    <p className="text-slate-100 font-semibold mt-1">{categoryStats.totalLevels}</p>
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="rounded-md border border-slate-700/70 bg-slate-900/30 p-3 text-sm text-slate-300">
                                {t('admin.verbs.current_selection', {
                                    category: t(CATEGORY_META.find((item) => item.value === selectedCategory)?.labelKey ?? CATEGORY_META[0].labelKey),
                                    verbs: selectedStats.totalVerbs,
                                    levels: selectedStats.totalLevels
                                })}
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
                <div className="max-w-3xl mx-auto flex items-center justify-center">
                    <Button
                        onClick={handleApplyCategory}
                        disabled={isLoading || isSaving || !hasChanges}
                        className="min-w-[220px] justify-center"
                    >
                        {isSaving ? t('admin.verbs.saving') : t('admin.verbs.save')}
                    </Button>
                </div>
            </div>
        </div>
    )
}
