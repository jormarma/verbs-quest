import { useMemo } from 'react'
import { useTable } from 'spacetimedb/react'
import { tables } from '../../lib/spacetime/module_bindings'
import { getWeakestVerbs } from '../game/verbStats'
import { buildWeakVerbQuestions } from '../game/weakVerbPractice'
import { toCached } from './useVerbs'

const WEAK_VERB_LIMIT = 5

export function useWeakVerbQuestions(verbsPerLevel: number) {
  const [allVerbs] = useTable(tables.verb)

  return useMemo(() => {
    const weakest = getWeakestVerbs(WEAK_VERB_LIMIT)
    const activeCached = toCached(allVerbs.filter((verb) => verb.active))
    const questions = buildWeakVerbQuestions(activeCached, weakest, verbsPerLevel)
    return {
      questions,
      weakestInfinitives: weakest,
      hasWeakVerbs: questions.length > 0,
    }
  }, [allVerbs, verbsPerLevel])
}
