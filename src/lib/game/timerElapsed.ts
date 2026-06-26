/** Elapsed play time in seconds, excluding paused intervals. */
export function computeElapsedSeconds(
  now: number,
  startTime: number,
  totalPausedMs: number,
  pausedAt: number | null,
): number {
  const activePauseMs = pausedAt !== null ? now - pausedAt : 0
  const elapsedMs = now - startTime - totalPausedMs - activePauseMs
  return Math.max(0, Math.floor(elapsedMs / 1000))
}

export function computeRemainingSeconds(timeLimit: number, elapsedSeconds: number): number {
  return Math.max(0, timeLimit - elapsedSeconds)
}
