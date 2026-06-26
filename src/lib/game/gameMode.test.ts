import { describe, expect, it } from 'vitest'
import {
  type GameMode,
  shouldRunLevelTimer,
  shouldSubmitLevelAttempt,
  isPracticeMode,
} from './gameMode'

describe('gameMode', () => {
  it.each<[GameMode, boolean]>([
    ['quest', true],
    ['practice', false],
  ])('shouldSubmitLevelAttempt(%s) => %s', (mode, expected) => {
    expect(shouldSubmitLevelAttempt(mode)).toBe(expected)
  })

  it.each<[GameMode, boolean]>([
    ['quest', true],
    ['practice', false],
  ])('shouldRunLevelTimer(%s) => %s', (mode, expected) => {
    expect(shouldRunLevelTimer(mode)).toBe(expected)
  })

  it('isPracticeMode identifies practice runs', () => {
    expect(isPracticeMode('practice')).toBe(true)
    expect(isPracticeMode('quest')).toBe(false)
  })
})
