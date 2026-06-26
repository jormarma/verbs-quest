import { describe, expect, it } from 'vitest'
import { computeElapsedSeconds, computeRemainingSeconds } from './timerElapsed'

describe('timerElapsed', () => {
  const startTime = 1_000_000

  it('computes elapsed seconds without pauses', () => {
    expect(computeElapsedSeconds(1_065_000, startTime, 0, null)).toBe(65)
  })

  it('subtracts accumulated paused duration', () => {
    expect(computeElapsedSeconds(1_065_000, startTime, 15_000, null)).toBe(50)
  })

  it('includes active pause time when pausedAt is set', () => {
    const pausedAt = 1_050_000
    const now = 1_065_000
    expect(computeElapsedSeconds(now, startTime, 0, pausedAt)).toBe(50)
  })

  it('computes remaining seconds clamped at zero', () => {
    expect(computeRemainingSeconds(180, 65)).toBe(115)
    expect(computeRemainingSeconds(180, 200)).toBe(0)
  })
})
