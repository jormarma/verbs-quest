export type GameMode = 'quest' | 'practice'

export function isPracticeMode(gameMode: GameMode): boolean {
  return gameMode === 'practice'
}

export function shouldSubmitLevelAttempt(gameMode: GameMode): boolean {
  return gameMode === 'quest'
}

export function shouldRunLevelTimer(gameMode: GameMode): boolean {
  return gameMode === 'quest'
}
