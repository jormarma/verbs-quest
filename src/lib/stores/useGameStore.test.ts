import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, type VerbQuestion } from '../stores/useGameStore'
import { submitLevelAttempt } from '../utils/sync'

vi.mock('../utils/sync', () => ({
  submitLevelAttempt: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: { status: 'maintained', new_level: 1 },
      topScores: [],
    }),
  ),
}))

const sampleQuestion: VerbQuestion = {
  verbId: '1',
  infinitive: 'go',
  pastSimple: 'went',
  pastParticiple: 'gone',
  tense: 'PAST_SIMPLE',
  target: 'WENT',
  acceptedAnswers: ['went'],
}

function resetStore() {
  useGameStore.getState().resetGame()
}

describe('useGameStore practice mode', () => {
  beforeEach(() => {
    resetStore()
    vi.mocked(submitLevelAttempt).mockClear()
  })

  it('does not submit level attempt when practice run finishes', () => {
    const { startGame, submitAnswer, advanceQuestion } = useGameStore.getState()
    startGame(1, [sampleQuestion], false, { gameMode: 'practice' })

    submitAnswer('went')
    advanceQuestion()

    expect(submitLevelAttempt).not.toHaveBeenCalled()
    expect(useGameStore.getState().session.status).toBe('FINISHED')
    expect(useGameStore.getState().session.gameMode).toBe('practice')
  })

  it('submits level attempt when quest run finishes', () => {
    const { startGame, submitAnswer, advanceQuestion } = useGameStore.getState()
    startGame(1, [sampleQuestion], false, { gameMode: 'quest' })

    submitAnswer('went')
    advanceQuestion()

    expect(submitLevelAttempt).toHaveBeenCalledTimes(1)
  })
})
