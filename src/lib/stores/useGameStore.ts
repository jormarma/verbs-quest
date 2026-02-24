import { create } from 'zustand'

export type GameStatus = "IDLE" | "PLAYING" | "PAUSED" | "FINISHED"

export interface VerbQuestion {
    verbId: string
    tense: "PAST_SIMPLE" | "PAST_PARTICIPLE"
    target: string
}

export interface AnswerStamp {
    question: VerbQuestion
    answer: string
    isCorrect: boolean
    timestamp: number
}

export interface GameState {
    session: {
        level: number
        status: GameStatus
        startTime: number | null
        config: {
            timeLimit: number
            baseQuestionCount: number
        }
    }
    gameplay: {
        currentQuestionIndex: number
        mainQueue: VerbQuestion[]
        retryQueue: VerbQuestion[]
        history: AnswerStamp[]
        currentInput: string
        errorsInLevel: number
    }

    // Actions
    startGame: (level: number, questions: VerbQuestion[]) => void
    submitAnswer: (answer: string) => void
    setInput: (input: string) => void
    pauseGame: () => void
    resumeGame: () => void
    resetGame: () => void
}

export const useGameStore = create<GameState>((set, get) => ({
    session: {
        level: 1,
        status: "IDLE",
        startTime: null,
        config: {
            timeLimit: 120,
            baseQuestionCount: 10
        }
    },
    gameplay: {
        currentQuestionIndex: 0,
        mainQueue: [],
        retryQueue: [],
        history: [],
        currentInput: "",
        errorsInLevel: 0
    },

    startGame: (level, questions) => set({
        session: {
            level,
            status: "PLAYING",
            startTime: Date.now(),
            config: {
                timeLimit: 120, // Default 2 mins per level for MVP
                baseQuestionCount: questions.length
            }
        },
        gameplay: {
            currentQuestionIndex: 0,
            mainQueue: questions,
            retryQueue: [],
            history: [],
            currentInput: "",
            errorsInLevel: 0
        }
    }),

    setInput: (input) => set((state) => ({
        gameplay: { ...state.gameplay, currentInput: input }
    })),

    submitAnswer: (answer) => set((state) => {
        const isMainQueue = state.gameplay.currentQuestionIndex < state.gameplay.mainQueue.length
        const currentQ = isMainQueue
            ? state.gameplay.mainQueue[state.gameplay.currentQuestionIndex]
            : state.gameplay.retryQueue[state.gameplay.currentQuestionIndex - state.gameplay.mainQueue.length]

        if (!currentQ) return state // Sanity fallback

        const isCorrect = answer.trim().toLowerCase() === currentQ.target.toLowerCase()

        // Log the interaction
        const newHistory = [...state.gameplay.history, {
            question: currentQ,
            answer,
            isCorrect,
            timestamp: Date.now()
        }]

        if (isCorrect) {
            const nextIndex = state.gameplay.currentQuestionIndex + 1
            const totalQuestions = state.gameplay.mainQueue.length + state.gameplay.retryQueue.length

            return {
                gameplay: {
                    ...state.gameplay,
                    currentQuestionIndex: nextIndex,
                    currentInput: "",
                    history: newHistory
                },
                session: {
                    ...state.session,
                    status: nextIndex >= totalQuestions ? "FINISHED" : "PLAYING"
                }
            }
        } else {
            // Wrong answer logic
            const updatedRetryQueue = [...state.gameplay.retryQueue, currentQ]
            const nextIndex = state.gameplay.currentQuestionIndex + 1
            const totalQuestions = state.gameplay.mainQueue.length + updatedRetryQueue.length

            return {
                gameplay: {
                    ...state.gameplay,
                    currentQuestionIndex: nextIndex,
                    retryQueue: updatedRetryQueue,
                    currentInput: "",
                    errorsInLevel: state.gameplay.errorsInLevel + 1,
                    history: newHistory
                },
                session: {
                    ...state.session,
                    status: nextIndex >= totalQuestions ? "FINISHED" : "PLAYING"
                }
            }
        }
    }),

    pauseGame: () => set((state) => ({
        session: { ...state.session, status: "PAUSED" } // Also could track paused duration
    })),

    resumeGame: () => set((state) => ({
        session: { ...state.session, status: "PLAYING" }
    })),

    resetGame: () => set({
        session: {
            level: 1,
            status: "IDLE",
            startTime: null,
            config: { timeLimit: 120, baseQuestionCount: 10 }
        },
        gameplay: {
            currentQuestionIndex: 0,
            mainQueue: [],
            retryQueue: [],
            history: [],
            currentInput: "",
            errorsInLevel: 0
        }
    })
}))
