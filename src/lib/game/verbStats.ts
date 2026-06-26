const STORAGE_KEY = 'verbs_quest_verb_error_stats'

export interface VerbErrorStats {
  [infinitiveLower: string]: number
}

function readStats(): VerbErrorStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as VerbErrorStats
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeStats(stats: VerbErrorStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  } catch {
    // quota exceeded — ignore
  }
}

export function recordVerbError(infinitive: string): void {
  const key = infinitive.trim().toLowerCase()
  if (!key) return
  const stats = readStats()
  stats[key] = (stats[key] ?? 0) + 1
  writeStats(stats)
}

export function getVerbErrorStats(): VerbErrorStats {
  return readStats()
}

/** Infinitives with the highest error counts, descending. */
export function getWeakestVerbs(limit: number): string[] {
  const stats = readStats()
  return Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, limit))
    .map(([infinitive]) => infinitive)
}

export function clearVerbErrorStats(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
