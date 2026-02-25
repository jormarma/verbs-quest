import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import type { VerbQuestion } from '../stores/useGameStore'

export function useVerbs(level: number) {
    const [questions, setQuestions] = useState<VerbQuestion[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let isMounted = true

        const fetchVerbs = async () => {
            setIsLoading(true)
            setError(null)

            try {
                // Fetch active verbs for the requested level
                const { data, error: fetchError } = await supabase
                    .from('verbs')
                    .select('id, infinitive, past_simple, past_participle')
                    .eq('level_group', level)
                    .eq('active', true)

                if (fetchError) throw fetchError

                if (data && isMounted) {
                    // Map the raw DB rows into playable Question items.
                    // Each verb generates TWO questions: Past Simple and Past Participle
                    const generatedQuestions: VerbQuestion[] = []

                    data.forEach((verb) => {
                        generatedQuestions.push({
                            verbId: verb.id,
                            infinitive: verb.infinitive,
                            pastSimple: verb.past_simple,
                            pastParticiple: verb.past_participle,
                            tense: 'PAST_SIMPLE',
                            target: verb.past_simple
                        })
                        generatedQuestions.push({
                            verbId: verb.id,
                            infinitive: verb.infinitive,
                            pastSimple: verb.past_simple,
                            pastParticiple: verb.past_participle,
                            tense: 'PAST_PARTICIPLE',
                            target: verb.past_participle
                        })
                    })

                    // Shuffle the questions so they aren't always paired consecutively
                    for (let i = generatedQuestions.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [generatedQuestions[i], generatedQuestions[j]] = [generatedQuestions[j], generatedQuestions[i]];
                    }

                    setQuestions(generatedQuestions)
                }
            } catch (err: any) {
                if (isMounted) setError(err.message)
            } finally {
                if (isMounted) setIsLoading(false)
            }
        }

        fetchVerbs()

        return () => {
            isMounted = false
        }
    }, [level])

    return { questions, isLoading, error }
}
