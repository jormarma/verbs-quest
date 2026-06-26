import { describe, expect, it } from 'vitest'
import { buildWeakVerbQuestions, pickVerbsByInfinitives } from './weakVerbPractice'
import type { CachedVerb } from './questionBuilder'

const verbs: CachedVerb[] = [
  { id: '1', infinitive: 'go', past_simple: 'went', past_participle: 'gone' },
  { id: '2', infinitive: 'eat', past_simple: 'ate', past_participle: 'eaten' },
  { id: '3', infinitive: 'see', past_simple: 'saw', past_participle: 'seen' },
]

describe('weakVerbPractice', () => {
  it('picks verbs in weakest-first order', () => {
    const picked = pickVerbsByInfinitives(verbs, ['eat', 'go'])
    expect(picked.map((v) => v.infinitive)).toEqual(['eat', 'go'])
  })

  it('builds questions only for available weak verbs', () => {
    const questions = buildWeakVerbQuestions(verbs, ['go', 'missing'], 5)
    expect(questions.length).toBe(2)
    expect(questions.every((q) => q.infinitive === 'go')).toBe(true)
  })

  it('returns empty when no verbs match', () => {
    expect(buildWeakVerbQuestions(verbs, ['missing'], 5)).toEqual([])
  })
})
