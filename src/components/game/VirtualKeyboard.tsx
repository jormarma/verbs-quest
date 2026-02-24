import { useMemo, useEffect } from 'react'
import { useGameStore } from '../../lib/stores/useGameStore'
import { Button } from '../ui/Button'
import { Delete, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '../../lib/utils/cn'

const VOWELS = ['A', 'E', 'I', 'O', 'U']
const ALL_CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ'.split('')

export function VirtualKeyboard() {
    const { gameplay, session, setInput, submitAnswer, advanceQuestion } = useGameStore()
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
    // The consonants must be just the needed ones to form the present, past simple and past participle of the verb in the question plus two random consonants more.
    const dynamicConsonants = useMemo(() => {
        if (!currentQ) return []

        // Since our mock only explicitly has verbId and target, normally we'd look up the full verb row here.
        // For this prototype, we'll extract consonants from the current target and the mocked verb infinitive.
        const infinitive = currentQ.verbId === '1' ? 'GO' : currentQ.verbId === '2' ? 'EAT' : 'SEE'
        const pastSimple = currentQ.verbId === '1' ? 'WENT' : currentQ.verbId === '2' ? 'ATE' : 'SAW'
        const pastParticiple = currentQ.verbId === '1' ? 'GONE' : currentQ.verbId === '2' ? 'EATEN' : 'SEEN'

        const allNeededLetters = (infinitive + pastSimple + pastParticiple).toUpperCase().split('')
        const neededConsonants = Array.from(new Set(allNeededLetters.filter(char => !VOWELS.includes(char))))

        // Add two random extra consonants not already in the needed list
        const availableExtras = ALL_CONSONANTS.filter(c => !neededConsonants.includes(c))

        // Shuffle and pick 2
        const shuffledExtras = [...availableExtras].sort(() => 0.5 - Math.random())
        const selectedExtras = shuffledExtras.slice(0, 2)

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
        <div className="w-full max-w-3xl mx-auto p-4 bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-700 shadow-2xl space-y-4">

            {/* Visual Feedback Banner */}
            <div className={cn(
                "w-full h-16 rounded-xl flex items-center justify-center font-bold text-xl md:text-2xl transition-all duration-300",
                feedbackState === 'NONE' ? "opacity-0 h-0 overflow-hidden" : "opacity-100",
                feedbackState === 'CORRECT' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-in fade-in zoom-in" : "",
                feedbackState === 'INCORRECT' ? "bg-red-500/20 text-red-400 border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-in fade-in slide-in-from-bottom-2" : ""
            )}>
                {feedbackState === 'CORRECT' && (
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-8 h-8" />
                        <span>CORRECT!</span>
                    </div>
                )}
                {feedbackState === 'INCORRECT' && (
                    <div className="flex items-center gap-2">
                        <XCircle className="w-8 h-8" />
                        <span>INCORRECT! Right answer: <span className="font-mono bg-red-900/50 px-2 py-1 rounded text-white ml-2">{feedbackTarget}</span></span>
                    </div>
                )}
            </div>

            {/* Keyboard Grid */}
            <div className={cn(
                "flex flex-col gap-2 transition-opacity duration-300",
                feedbackState !== 'NONE' && "opacity-50 pointer-events-none grayscale"
            )}>
                {/* Row 1: Vowels */}
                <div className="flex justify-center gap-2">
                    {VOWELS.map((key) => (
                        <Button
                            key={key}
                            variant="outline"
                            className="w-12 h-14 sm:w-16 sm:h-16 text-xl sm:text-2xl font-bold bg-indigo-900/40 border-indigo-600/50 text-indigo-100 hover:bg-indigo-600 hover:border-indigo-400 hover:scale-105 transition-all shadow-md"
                            onClick={() => handleKeyPress(key)}
                        >
                            {key}
                        </Button>
                    ))}
                </div>

                {/* Row 2: Dynamic Consonants + Controls */}
                <div className="flex justify-center flex-wrap gap-2 mt-2">
                    {dynamicConsonants.map((key) => (
                        <Button
                            key={key}
                            variant="outline"
                            className="w-12 h-14 sm:w-14 sm:h-16 text-lg sm:text-2xl font-bold bg-slate-800/80 border-slate-600 text-slate-100 hover:bg-slate-600 hover:border-slate-400 hover:scale-105 transition-all shadow-md"
                            onClick={() => handleKeyPress(key)}
                        >
                            {key}
                        </Button>
                    ))}
                </div>

                {/* Row 3: Controls */}
                <div className="flex justify-center gap-4 mt-2">
                    <Button
                        variant="destructive"
                        size="lg"
                        className="h-14 sm:h-16 flex-1 max-w-[120px]"
                        onClick={handleDelete}
                    >
                        <Delete size={24} />
                    </Button>
                    <Button
                        variant="secondary"
                        size="lg"
                        onClick={handleEnter}
                        disabled={currentInput.trim().length === 0 && feedbackState === 'NONE'}
                        className="h-14 sm:h-16 flex-1 max-w-[200px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white border-none disabled:bg-emerald-900/50"
                    >
                        ENTER
                    </Button>
                </div>
            </div>

            {feedbackState !== 'NONE' && (
                <Button
                    className="w-full h-14 text-lg font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)] animate-bounce"
                    onClick={advanceQuestion}
                >
                    NEXT QUESTION
                </Button>
            )}
        </div>
    )
}
