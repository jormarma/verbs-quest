import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearVerbErrorStats,
  getVerbErrorStats,
  getWeakestVerbs,
  recordVerbError,
} from './verbStats'

describe('verbStats', () => {
  beforeEach(() => {
    clearVerbErrorStats()
  })

  it('records errors per infinitive case-insensitively', () => {
    recordVerbError('Go')
    recordVerbError('go')
    expect(getVerbErrorStats().go).toBe(2)
  })

  it('returns weakest verbs sorted by error count', () => {
    recordVerbError('eat')
    recordVerbError('go')
    recordVerbError('go')
    recordVerbError('see')

    expect(getWeakestVerbs(2)).toEqual(['go', 'eat'])
  })

  it('returns empty list when no stats exist', () => {
    expect(getWeakestVerbs(5)).toEqual([])
  })
})
