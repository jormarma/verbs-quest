import { useEffect, useState } from 'react'
import { useTable } from 'spacetimedb/react'
import { tables } from '../../lib/spacetime/module_bindings'
import type { Verb } from '../../lib/spacetime/module_bindings/types'
import type { VerbQuestion } from '../stores/useGameStore'
import { buildQuestionsFromVerbs, type CachedVerb } from '../game/questionBuilder'

const VERBS_CACHE_KEY_PREFIX = 'verbs_quest_verbs_cache_level_'

function toCached(verbs: Verb[]): CachedVerb[] {
    return verbs.map((v) => ({
        id: String(v.id),
        infinitive: v.infinitive,
        past_simple: v.pastSimple,
        past_participle: v.pastParticiple,
    }))
}

export function useVerbs(level: number, verbsPerLevel: number) {
    const [allVerbs] = useTable(tables.verb)
    const [questions, setQuestions] = useState<VerbQuestion[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let isMounted = true

        const fetchVerbs = () => {
            setIsLoading(true)
            setError(null)

            try {
                const matching = allVerbs.filter((v) => v.levelGroup === level && v.active)

                if (isMounted) {
                    try {
                        localStorage.setItem(
                            VERBS_CACHE_KEY_PREFIX + level,
                            JSON.stringify(toCached(matching)),
                        )
                    } catch { /* quota exceeded — ignore */ }

                    setQuestions(buildQuestionsFromVerbs(toCached(matching), verbsPerLevel))
                }
            } catch (err) {
                if (isMounted) {
                    try {
                        const cached = localStorage.getItem(VERBS_CACHE_KEY_PREFIX + level)
                        if (cached) {
                            const cachedVerbs: CachedVerb[] = JSON.parse(cached)
                            if (cachedVerbs.length > 0) {
                                console.warn(`Using cached verbs for level ${level} (offline)`)
                                setQuestions(buildQuestionsFromVerbs(cachedVerbs, verbsPerLevel))
                                setError(null)
                                return
                            }
                        }
                    } catch { /* parsing failed */ }

                    const message = err instanceof Error ? err.message : 'Unknown error'
                    setError(message)
                }
            } finally {
                if (isMounted) setIsLoading(false)
            }
        }

        fetchVerbs()

        return () => {
            isMounted = false
        }
    }, [level, verbsPerLevel, allVerbs])

    return { questions, isLoading, error }
}

export { toCached }
