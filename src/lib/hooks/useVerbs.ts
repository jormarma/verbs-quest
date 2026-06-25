import { useEffect, useState } from 'react'
import { useTable } from 'spacetimedb/react'
import { tables } from '../../lib/spacetime/module_bindings'
import type { Verb } from '../../lib/spacetime/module_bindings/types'
import type { VerbQuestion } from '../stores/useGameStore'

const VERBS_CACHE_KEY_PREFIX = 'verbs_quest_verbs_cache_level_'

interface CachedVerb {
    id: string
    infinitive: string
    past_simple: string
    past_participle: string
}

function parseAnswerVariants(raw: string): string[] {
    const variants = raw
        .split('/')
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part.length > 0)

    const uniqueVariants: string[] = []
    for (const variant of variants) {
        if (!uniqueVariants.includes(variant)) {
            uniqueVariants.push(variant)
        }
    }

    return uniqueVariants.length > 0 ? uniqueVariants : [raw.trim().toLowerCase()]
}

function formatAnswerVariants(variants: string[]): string {
    return variants.join(' / ')
}

function buildQuestionsFromVerbs(verbs: CachedVerb[], verbsPerLevel: number): VerbQuestion[] {
    const requestedVerbCount = Number.isFinite(verbsPerLevel) && verbsPerLevel > 0
        ? Math.floor(verbsPerLevel)
        : verbs.length
    const verbsToUse = [...verbs]

    if (verbsToUse.length > requestedVerbCount) {
        for (let i = verbsToUse.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
                ;[verbsToUse[i], verbsToUse[j]] = [verbsToUse[j], verbsToUse[i]]
        }
    }

    const selectedVerbs = verbsToUse.slice(0, Math.min(requestedVerbCount, verbsToUse.length))

    const generatedQuestions: VerbQuestion[] = []

    selectedVerbs.forEach((verb) => {
        const pastSimpleAnswers = parseAnswerVariants(verb.past_simple)
        const pastParticipleAnswers = parseAnswerVariants(verb.past_participle)

        generatedQuestions.push({
            verbId: verb.id,
            infinitive: verb.infinitive,
            pastSimple: verb.past_simple,
            pastParticiple: verb.past_participle,
            tense: 'PAST_SIMPLE',
            target: formatAnswerVariants(pastSimpleAnswers),
            acceptedAnswers: pastSimpleAnswers
        })
        generatedQuestions.push({
            verbId: verb.id,
            infinitive: verb.infinitive,
            pastSimple: verb.past_simple,
            pastParticiple: verb.past_participle,
            tense: 'PAST_PARTICIPLE',
            target: formatAnswerVariants(pastParticipleAnswers),
            acceptedAnswers: pastParticipleAnswers
        })
    })

    // Shuffle questions
    for (let i = generatedQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [generatedQuestions[i], generatedQuestions[j]] = [generatedQuestions[j], generatedQuestions[i]];
    }

    return generatedQuestions
}

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
                    // Cache verbs for offline use
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
                    // Offline fallback: try to load from localStorage cache
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