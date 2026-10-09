import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, type VerbQuestion } from '../stores/useGameStore'
import { submitLevelAttempt, type SubmitAttemptResult } from '../utils/sync'

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
    expect(useGameStore.getState().gameplay.submissionStatus).toBeNull()
  })

  it('submits level attempt when quest run finishes', () => {
    const { startGame, submitAnswer, advanceQuestion } = useGameStore.getState()
    startGame(1, [sampleQuestion], false, { gameMode: 'quest' })

    submitAnswer('went')
    advanceQuestion()

    expect(submitLevelAttempt).toHaveBeenCalledTimes(1)
  })
})

describe('useGameStore quest submission', () => {
  const sampleTopScores = [{ duration_seconds: 12, completed_at: '2026-10-09T10:00:12.000Z', is_perfect_run: true }]

  beforeEach(() => {
    resetStore()
    vi.mocked(submitLevelAttempt).mockClear()
  })

  function finishQuestRun() {
    const { startGame, submitAnswer, advanceQuestion } = useGameStore.getState()
    startGame(1, [sampleQuestion], false, { gameMode: 'quest' })
    submitAnswer('went')
    advanceQuestion()
  }

  it('marks the run pending in the same update that finishes it', () => {
    vi.mocked(submitLevelAttempt).mockReturnValueOnce(new Promise<SubmitAttemptResult>(() => {}))

    finishQuestRun()

    const { session, gameplay } = useGameStore.getState()
    expect(session.status).toBe('FINISHED')
    expect(gameplay.submissionStatus).toBe('pending')
    expect(gameplay.topScores).toEqual([])
  })

  it('stores the server verdict, the previous cap and the top scores', async () => {
    vi.mocked(submitLevelAttempt).mockResolvedValueOnce({
      success: true,
      previousLevelCap: 1,
      data: { status: 'unlocked', new_level: 2 },
      topScores: sampleTopScores,
    })

    finishQuestRun()

    await vi.waitFor(() => expect(useGameStore.getState().gameplay.submissionStatus).toBe('unlocked'))
    const { gameplay } = useGameStore.getState()
    expect(gameplay.submissionNewLevel).toBe(2)
    expect(gameplay.submissionPreviousCap).toBe(1)
    expect(gameplay.topScores).toEqual(sampleTopScores)
  })

  it('records unconfirmed, with no invented status, when the server gives no verdict', async () => {
    vi.mocked(submitLevelAttempt).mockResolvedValueOnce({
      success: false,
      error: 'the server returned no verdict for this run',
    })

    finishQuestRun()

    await vi.waitFor(() => expect(useGameStore.getState().gameplay.submissionStatus).toBe('unconfirmed'))
    const { gameplay } = useGameStore.getState()
    expect(gameplay.submissionNewLevel).toBeNull()
    expect(gameplay.submissionPreviousCap).toBeNull()
    expect(gameplay.topScores).toEqual([])
  })

  it('records unconfirmed for a run queued offline', async () => {
    vi.mocked(submitLevelAttempt).mockResolvedValueOnce({ success: false, queued: true })

    finishQuestRun()

    await vi.waitFor(() => expect(useGameStore.getState().gameplay.submissionStatus).toBe('unconfirmed'))
  })

  it('records an anti-cheat rejection as rejected', async () => {
    vi.mocked(submitLevelAttempt).mockResolvedValueOnce({
      success: false,
      rejected: true,
      reason: 'Anti-cheat triggered: Completion time physically impossible',
    })

    finishQuestRun()

    await vi.waitFor(() => expect(useGameStore.getState().gameplay.submissionStatus).toBe('rejected'))
  })

  it('stores the server verdict when the timer ends the run', async () => {
    vi.mocked(submitLevelAttempt).mockResolvedValueOnce({
      success: true,
      previousLevelCap: 2,
      data: { status: 'downgraded', new_level: 1 },
      topScores: [],
    })
    const { startGame, forceTimeout } = useGameStore.getState()
    startGame(2, [sampleQuestion], false, { gameMode: 'quest' })

    await forceTimeout()

    const { session, gameplay } = useGameStore.getState()
    expect(session.status).toBe('FINISHED')
    expect(gameplay.submissionStatus).toBe('downgraded')
    expect(gameplay.submissionNewLevel).toBe(1)
    expect(gameplay.submissionPreviousCap).toBe(2)
  })

  it('ignores a late answer for a run that was replaced', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(1_000)
      let finishFirstRun: (result: SubmitAttemptResult) => void = () => {}
      vi.mocked(submitLevelAttempt).mockReturnValueOnce(
        new Promise<SubmitAttemptResult>((resolve) => {
          finishFirstRun = resolve
        }),
      )
      finishQuestRun()

      vi.setSystemTime(2_000)
      useGameStore.getState().startGame(2, [sampleQuestion], false, { gameMode: 'quest' })
      finishFirstRun({
        success: true,
        previousLevelCap: 1,
        data: { status: 'unlocked', new_level: 2 },
        topScores: sampleTopScores,
      })
      await new Promise((resolve) => setTimeout(resolve, 0))

      const { session, gameplay } = useGameStore.getState()
      expect(session.level).toBe(2)
      expect(gameplay.submissionStatus).toBeNull()
      expect(gameplay.topScores).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})
