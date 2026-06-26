import { describe, expect, it } from 'vitest'
import type { AnswerStamp, VerbQuestion } from '../stores/useGameStore'
import { getRunReviewItems } from './runReview'

function makeQuestion(infinitive: string, tense: VerbQuestion['tense'] = 'PAST_SIMPLE'): VerbQuestion {
  return {
    verbId: '1',
    infinitive,
    pastSimple: 'went',
    pastParticiple: 'gone',
    tense,
    target: 'WENT',
    acceptedAnswers: ['went'],
  }
}

function makeStamp(
  infinitive: string,
  answer: string,
  isCorrect: boolean,
  timestamp: number,
): AnswerStamp {
  return {
    question: makeQuestion(infinitive),
    answer,
    isCorrect,
    timestamp,
  }
}

describe('getRunReviewItems', () => {
  it('returns empty array when history is empty', () => {
    expect(getRunReviewItems([])).toEqual([])
  })

  it('returns empty array when all answers are correct', () => {
    const history = [
      makeStamp('go', 'went', true, 1),
      makeStamp('see', 'saw', true, 2),
    ]
    expect(getRunReviewItems(history)).toEqual([])
  })

  it('returns only incorrect answers newest first', () => {
    const history = [
      makeStamp('go', 'goed', false, 1),
      makeStamp('see', 'saw', true, 2),
      makeStamp('eat', 'eated', false, 3),
    ]
    const items = getRunReviewItems(history)
    expect(items).toHaveLength(2)
    expect(items[0].infinitive).toBe('eat')
    expect(items[0].playerAnswer).toBe('eated')
    expect(items[1].infinitive).toBe('go')
  })

  it('includes tense and correct answer variants', () => {
    const history: AnswerStamp[] = [{
      question: {
        ...makeQuestion('burn'),
        tense: 'PAST_PARTICIPLE',
        target: 'burnt / burned',
        acceptedAnswers: ['burnt', 'burned'],
      },
      answer: 'burn',
      isCorrect: false,
      timestamp: 1,
    }]
    const [item] = getRunReviewItems(history)
    expect(item.tense).toBe('PAST_PARTICIPLE')
    expect(item.correctAnswer).toBe('burnt / burned')
  })
})
