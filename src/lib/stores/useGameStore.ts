import { create } from 'zustand'
import { submitLevelAttempt } from '../utils/sync'

export type GameStatus = "IDLE" | "PLAYING" | "PAUSED" | "FINISHED"

export interface VerbQuestion {
    verbId: string
    infinitive: string
    pastSimple: string
    pastParticiple: string
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
        endTime: number | null
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
        feedbackState: "NONE" | "CORRECT" | "INCORRECT"
        feedbackTarget: string | null
        topScores: any[]
    }

    // Actions
    startGame: (level: number, questions: VerbQuestion[], delayTimer?: boolean) => void
    startLevelTimer: () => void
    submitAnswer: (answer: string) => void
    advanceQuestion: () => void
    setInput: (input: string) => void
    pauseGame: () => void
    resumeGame: () => void
    resetGame: () => void
    forceTimeout: () => void
    cancelGame: () => void
    setTopScores: (scores: any[]) => void
}

export const useGameStore = create<GameState>((set, get) => ({
    session: {
        level: 1,
        status: "IDLE",
        startTime: null,
        endTime: null,
        config: {
            timeLimit: 180,
            baseQuestionCount: 5
        }
    },
    gameplay: {
        currentQuestionIndex: 0,
        mainQueue: [],
        retryQueue: [],
        history: [],
        currentInput: "",
        errorsInLevel: 0,
        feedbackState: "NONE",
        feedbackTarget: null,
        topScores: []
    },

    startGame: (level, questions, delayTimer = false) => set({
        session: {
            level,
            status: "PLAYING",
            startTime: delayTimer ? null : Date.now(),
            endTime: null,
            config: {
                timeLimit: 180, // 3 mins per level (5 verbs)
                baseQuestionCount: questions.length
            }
        },
        gameplay: {
            currentQuestionIndex: 0,
            mainQueue: questions,
            retryQueue: [],
            history: [],
            currentInput: "",
            errorsInLevel: 0,
            feedbackState: "NONE",
            feedbackTarget: null,
            topScores: []
        }
    }),

    startLevelTimer: () => set((state) => ({
        session: { ...state.session, startTime: Date.now() }
    })),

    setInput: (input) => set((state) => ({
        gameplay: { ...state.gameplay, currentInput: input }
    })),

    submitAnswer: (answer) => set((state) => {
        if (state.gameplay.feedbackState !== "NONE") return state // Prevent multiple submissions

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
            return {
                gameplay: {
                    ...state.gameplay,
                    history: newHistory,
                    feedbackState: "CORRECT",
                    feedbackTarget: currentQ.target
                }
            }
        } else {
            const updatedRetryQueue = [...state.gameplay.retryQueue, currentQ]
            return {
                gameplay: {
                    ...state.gameplay,
                    retryQueue: updatedRetryQueue,
                    errorsInLevel: state.gameplay.errorsInLevel + 1,
                    history: newHistory,
                    feedbackState: "INCORRECT",
                    feedbackTarget: currentQ.target
                }
            }
        }
    }),

    advanceQuestion: () => set((state) => {
        const nextIndex = state.gameplay.currentQuestionIndex + 1
        const totalQuestions = state.gameplay.mainQueue.length + state.gameplay.retryQueue.length
        const isFinished = nextIndex >= totalQuestions

        if (isFinished && state.session.startTime) {
            // Fire and forget the sync submission
            submitLevelAttempt({
                levelId: state.session.level,
                startTime: new Date(state.session.startTime).toISOString(),
                endTime: new Date().toISOString(),
                errorCount: state.gameplay.errorsInLevel,
                questionsCount: state.gameplay.mainQueue.length
            }).then(res => {
                if (res.success && res.topScores) {
                    get().setTopScores(res.topScores)
                }
            })
        }

        return {
            gameplay: {
                ...state.gameplay,
                currentQuestionIndex: nextIndex,
                currentInput: "",
                feedbackState: "NONE",
                feedbackTarget: null
            },
            session: {
                ...state.session,
                status: isFinished ? "FINISHED" : "PLAYING",
                endTime: isFinished ? Date.now() : state.session.endTime
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
            endTime: null,
            config: { timeLimit: 180, baseQuestionCount: 5 }
        },
        gameplay: {
            currentQuestionIndex: 0,
            mainQueue: [],
            retryQueue: [],
            history: [],
            currentInput: "",
            errorsInLevel: 0,
            feedbackState: "NONE",
            feedbackTarget: null,
            topScores: []
        }
    }),

    cancelGame: () => set((state) => ({
        session: { ...state.session, status: "IDLE", startTime: null, endTime: null },
        gameplay: {
            currentQuestionIndex: 0,
            mainQueue: [],
            retryQueue: [],
            history: [],
            currentInput: "",
            errorsInLevel: 0,
            feedbackState: "NONE",
            feedbackTarget: null,
            topScores: []
        }
    })),

    setTopScores: (scores) => set((state) => ({
        gameplay: { ...state.gameplay, topScores: scores }
    })),

    forceTimeout: async () => {
        const state = get()
        if (state.session.status !== "PLAYING") return

        if (state.session.startTime) {
            // Wait for DB failure sync to complete before allowing user to click Continue
            await submitLevelAttempt({
                levelId: state.session.level,
                startTime: new Date(state.session.startTime).toISOString(),
                endTime: new Date(state.session.startTime + (state.session.config.timeLimit + 1) * 1000).toISOString(),
                errorCount: state.gameplay.errorsInLevel + 1, // Add an error to ensure it is not perfect
                questionsCount: state.gameplay.mainQueue.length
            })
        }

        set((state) => ({
            session: { ...state.session, status: "FINISHED", endTime: Date.now() },
            // Add a massive error so the UI knows it was a timeout fail
            gameplay: { ...state.gameplay, errorsInLevel: state.gameplay.errorsInLevel + 999 }
        }))
    }
}))
