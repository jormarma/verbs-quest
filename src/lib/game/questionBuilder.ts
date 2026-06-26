import type { VerbQuestion } from '../stores/useGameStore'

export interface CachedVerb {
  id: string
  infinitive: string
  past_simple: string
  past_participle: string
}

function parseAnswerVariants(raw: string): string[] {
  const variants = raw
    .split('/')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)

  const uniqueVariants: string[] = []
  for (const variant of variants) {
    if (!uniqueVariants.includes(variant)) {
      uniqueVariants.push(variant)
    }
  }

  return uniqueVariants.length > 0 ? uniqueVariants : [raw.trim().toLowerCase()]
}

function formatAnswerVariants(variants: string[]): string {
  return variants.join(' / ')
}

export function buildQuestionsFromVerbs(verbs: CachedVerb[], verbsPerLevel: number): VerbQuestion[] {
  const requestedVerbCount = Number.isFinite(verbsPerLevel) && verbsPerLevel > 0
    ? Math.floor(verbsPerLevel)
    : verbs.length
  const verbsToUse = [...verbs]

  if (verbsToUse.length > requestedVerbCount) {
    for (let i = verbsToUse.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[verbsToUse[i], verbsToUse[j]] = [verbsToUse[j], verbsToUse[i]]
    }
  }

  const selectedVerbs = verbsToUse.slice(0, Math.min(requestedVerbCount, verbsToUse.length))
  const generatedQuestions: VerbQuestion[] = []

  selectedVerbs.forEach((verb) => {
    const pastSimpleAnswers = parseAnswerVariants(verb.past_simple)
    const pastParticipleAnswers = parseAnswerVariants(verb.past_participle)

    generatedQuestions.push({
      verbId: verb.id,
      infinitive: verb.infinitive,
      pastSimple: verb.past_simple,
      pastParticiple: verb.past_participle,
      tense: 'PAST_SIMPLE',
      target: formatAnswerVariants(pastSimpleAnswers),
      acceptedAnswers: pastSimpleAnswers,
    })
    generatedQuestions.push({
      verbId: verb.id,
      infinitive: verb.infinitive,
      pastSimple: verb.past_simple,
      pastParticiple: verb.past_participle,
      tense: 'PAST_PARTICIPLE',
      target: formatAnswerVariants(pastParticipleAnswers),
      acceptedAnswers: pastParticipleAnswers,
    })
  })

  for (let i = generatedQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[generatedQuestions[i], generatedQuestions[j]] = [generatedQuestions[j], generatedQuestions[i]]
  }

  return generatedQuestions
}
