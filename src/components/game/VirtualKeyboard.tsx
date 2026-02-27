import { useMemo, useEffect } from 'react'
import { useGameStore } from '../../lib/stores/useGameStore'
import { useTranslation } from '../../lib/hooks/useTranslation'
import { Button } from '../ui/Button'
import { Delete, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '../../lib/utils/cn'

const VOWELS = ['A', 'E', 'I', 'O', 'U']
const ALL_CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ'.split('')

function getDeterministicExtras(seedSource: string, pool: string[], count: number): string[] {
    if (pool.length === 0 || count <= 0) return []

    const seed = seedSource.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const picked: string[] = []
    const step = 7
    let index = seed % pool.length
    let attempts = 0
    const maxAttempts = pool.length * 2

    while (picked.length < count && attempts < maxAttempts) {
        const candidate = pool[index % pool.length]
        if (!picked.includes(candidate)) {
            picked.push(candidate)
        }
        index += step
        attempts += 1
    }

    if (picked.length < count) {
        for (const char of pool) {
            if (!picked.includes(char)) {
                picked.push(char)
            }
            if (picked.length === count) {
                break
            }
        }
    }

    return picked
}

export function VirtualKeyboard() {
    const { gameplay, session, setInput, submitAnswer, advanceQuestion } = useGameStore()
    const { t } = useTranslation()
    const { currentInput, feedbackState, feedbackTarget } = gameplay

    const isMainQueue = gameplay.currentQuestionIndex < gameplay.mainQueue.length
    const currentQ = session.status === 'PLAYING' ? (
        isMainQueue
            ? gameplay.mainQueue[gameplay.currentQuestionIndex]
            : gameplay.retryQueue[gameplay.currentQuestionIndex - gameplay.mainQueue.length]
    ) : null

    // 1. the buttons for the letters must be in 2 rows. 
    // The first with vowels. 
    // The second with consonants. 
    // The consonants must be the needed ones to form the present, past simple and past participle of the verb plus two extra consonants.
    const dynamicConsonants = useMemo(() => {
        if (!currentQ) return []

        const infinitive = currentQ.infinitive || ''
        const pastSimple = currentQ.pastSimple || ''
        const pastParticiple = currentQ.pastParticiple || ''

        const allNeededLetters = (infinitive + pastSimple + pastParticiple).toUpperCase().split('')
        const neededConsonants = Array.from(
            new Set(
                allNeededLetters.filter((char) => /[A-Z]/.test(char) && !VOWELS.includes(char))
            )
        )

        // Add two deterministic extra consonants not already in the needed list
        const availableExtras = ALL_CONSONANTS.filter(c => !neededConsonants.includes(c))
        const seedSource = `${currentQ.verbId}|${currentQ.infinitive}|${currentQ.pastSimple}|${currentQ.pastParticiple}|${currentQ.tense}`
        const selectedExtras = getDeterministicExtras(seedSource, availableExtras, 2)

        // Combine and sort alphabetically for consistency so it looks like a keyboard
        return [...neededConsonants, ...selectedExtras].sort()
    }, [currentQ])


    const handleKeyPress = (key: string) => {
        if (feedbackState !== 'NONE') return // Lock input during feedback
        setInput(currentInput + key)
    }

    const handleDelete = () => {
        if (feedbackState !== 'NONE') return
        setInput(currentInput.slice(0, -1))
    }

    const handleEnter = () => {
        if (feedbackState !== 'NONE') {
            advanceQuestion()
            return
        }
        if (currentInput.trim().length > 0) {
            submitAnswer(currentInput)
        }
    }

    // Auto advance on keyboard enter if feedback is showing
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && feedbackState !== 'NONE') {
                advanceQuestion()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [feedbackState, advanceQuestion])

    return (
        <div className="relative w-full max-w-3xl mx-auto p-2 sm:p-3 bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col justify-center">

            {/* Visual Feedback Overlay (Absolute) */}
            <div className={cn(
                "absolute inset-0 z-20 flex flex-col items-center justify-center p-4 gap-4 transition-all duration-300 backdrop-blur-sm",
                feedbackState === 'NONE' ? "opacity-0 pointer-events-none translate-y-4" : "opacity-100 translate-y-0",
                feedbackState === 'CORRECT' ? "bg-emerald-950/90 border border-emerald-500/50" : "bg-red-950/90 border border-red-500/50"
            )}>
                {feedbackState === 'CORRECT' && (
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-2xl md:text-3xl animate-in zoom-in">
                        <CheckCircle2 className="w-8 h-8 md:w-10 md:h-10" />
                        <span>{t('keyboard.correct')}</span>
                    </div>
                )}
                {feedbackState === 'INCORRECT' && (
                    <div className="flex flex-col items-center gap-2 text-xl md:text-2xl font-bold animate-in slide-in-from-bottom-2">
                        <div className="flex items-center gap-2 text-red-400">
                            <XCircle className="w-8 h-8 md:w-10 md:h-10" />
                            <span>{t('keyboard.incorrect')}</span>
                        </div>
                        <span className="text-slate-300 text-lg">{t('keyboard.right_answer')} <span className="font-mono bg-red-900/50 px-3 py-1 rounded text-white ml-2 border border-red-500/30">{feedbackTarget}</span></span>
                    </div>
                )}
                <Button
                    variant="default"
                    className="w-full max-w-sm h-14 mt-4 text-lg font-bold animate-bounce"
                    onClick={advanceQuestion}
                >
                    {t('keyboard.next_question')}
                </Button>
            </div>

            {/* Keyboard Grid */}
            <div className={cn(
                "flex flex-col gap-1 sm:gap-2 w-full transition-opacity duration-300",
                feedbackState !== 'NONE' && "opacity-0 pointer-events-none"
            )}>
                {/* Row 1: Vowels */}
                <div className="flex justify-center gap-1.5 sm:gap-2">
                    {VOWELS.map((key) => (
                        <Button
                            key={key}
                            variant="secondary"
                            className="w-10 h-12 sm:w-14 sm:h-16 text-lg sm:text-2xl font-bold px-0"
                            onClick={() => handleKeyPress(key)}
                        >
                            {key}
                        </Button>
                    ))}
                </div>

                {/* Row 2: Dynamic Consonants */}
                <div className="flex justify-center gap-1 sm:gap-1.5 mt-2">
                    {dynamicConsonants.map((key) => (
                        <Button
                            key={key}
                            variant="secondary"
                            className="flex-1 max-w-[3rem] min-w-0 px-0 h-11 sm:h-14 text-base sm:text-xl font-bold"
                            onClick={() => handleKeyPress(key)}
                        >
                            {key}
                        </Button>
                    ))}
                </div>

                {/* Row 3: Controls */}
                <div className="flex justify-center gap-2 sm:gap-4 mt-2">
                    <Button
                        variant="destructive"
                        className="h-12 sm:h-14 flex-[0.3] max-w-[100px]"
                        onClick={handleDelete}
                    >
                        <Delete size={20} className="sm:w-6 sm:h-6" />
                    </Button>
                    <Button
                        variant="default"
                        onClick={handleEnter}
                        disabled={currentInput.trim().length === 0}
                        className="h-12 sm:h-14 flex-[0.7] max-w-[250px] font-bold text-base sm:text-lg"
                    >
                        {t('keyboard.submit_answer')}
                    </Button>
                </div>
            </div>
        </div>
    )
}
