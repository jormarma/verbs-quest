import type { AnswerStamp } from '../stores/useGameStore'

export interface RunReviewItem {
  infinitive: string
  tense: AnswerStamp['question']['tense']
  playerAnswer: string
  correctAnswer: string
}

/** Incorrect answers from a run, newest first, for the post-run review panel. */
export function getRunReviewItems(history: AnswerStamp[]): RunReviewItem[] {
  return history
    .filter((stamp) => !stamp.isCorrect)
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((stamp) => ({
      infinitive: stamp.question.infinitive,
      tense: stamp.question.tense,
      playerAnswer: stamp.answer,
      correctAnswer: stamp.question.target,
    }))
}
