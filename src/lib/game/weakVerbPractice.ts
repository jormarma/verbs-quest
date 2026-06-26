import type { VerbQuestion } from '../stores/useGameStore'
import { buildQuestionsFromVerbs, type CachedVerb } from './questionBuilder'

export function pickVerbsByInfinitives(allVerbs: CachedVerb[], infinitives: string[]): CachedVerb[] {
  const byLower = new Map(allVerbs.map((verb) => [verb.infinitive.toLowerCase(), verb]))
  return infinitives
    .map((infinitive) => byLower.get(infinitive.toLowerCase()))
    .filter((verb): verb is CachedVerb => verb !== undefined)
}

export function buildWeakVerbQuestions(
  allVerbs: CachedVerb[],
  weakestInfinitives: string[],
  verbsPerLevel: number,
): VerbQuestion[] {
  const picked = pickVerbsByInfinitives(allVerbs, weakestInfinitives)
  if (picked.length === 0) return []
  return buildQuestionsFromVerbs(picked, verbsPerLevel)
}
