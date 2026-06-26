import { create } from 'zustand'
import { submitLevelAttempt } from '../utils/sync'
import { shouldSubmitLevelAttempt, type GameMode } from '../game/gameMode'

export type GameStatus = "IDLE" | "PLAYING" | "PAUSED" | "FINISHED"
export type SubmissionStatus = "unlocked" | "maintained" | "downgraded" | "rejected" | null

export interface TopScoreEntry {
    duration_seconds: number
    completed_at: string
    is_perfect_run: boolean
}

export interface VerbQuestion {
    verbId: string
    infinitive: string
    pastSimple: string
    pastParticiple: string
    tense: "PAST_SIMPLE" | "PAST_PARTICIPLE"
    target: string
    acceptedAnswers: string[]
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
        gameMode: GameMode
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
        topScores: TopScoreEntry[]
        submissionStatus: SubmissionStatus
        submissionNewLevel: number | null
    }

    // Actions
    startGame: (
        level: number,
        questions: VerbQuestion[],
        delayTimer?: boolean,
        options?: { timeLimitSeconds?: number; gameMode?: GameMode }
    ) => void
    startLevelTimer: () => void
    submitAnswer: (answer: string) => void
    advanceQuestion: () => void
    setInput: (input: string) => void
    pauseGame: () => void
    resumeGame: () => void
    resetGame: () => void
    forceTimeout: () => void
    cancelGame: () => void
    setTopScores: (scores: TopScoreEntry[]) => void
}

export const useGameStore = create<GameState>((set, get) => ({
    session: {
        level: 1,
        status: "IDLE",
        gameMode: "quest",
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
        topScores: [],
        submissionStatus: null,
        submissionNewLevel: null
    },

    startGame: (level, questions, delayTimer = false, options) => {
        const candidateTimeLimit = options?.timeLimitSeconds
        const resolvedTimeLimit = typeof candidateTimeLimit === 'number' && Number.isFinite(candidateTimeLimit)
            ? Math.max(1, Math.floor(candidateTimeLimit))
            : 180
        const gameMode = options?.gameMode ?? 'quest'
        const useCountdown = delayTimer && gameMode === 'quest'

        return set({
            session: {
                level,
                status: "PLAYING",
                gameMode,
                startTime: useCountdown ? null : Date.now(),
                endTime: null,
                config: {
                    timeLimit: resolvedTimeLimit,
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
                topScores: [],
                submissionStatus: null,
                submissionNewLevel: null
            }
        })
    },

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

        const normalizedAnswer = answer.trim().toLowerCase()
        const isCorrect = currentQ.acceptedAnswers.includes(normalizedAnswer)

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

        if (
            isFinished
            && state.session.startTime
            && shouldSubmitLevelAttempt(state.session.gameMode)
        ) {
            // Fire and forget the sync submission
            submitLevelAttempt({
                levelId: state.session.level,
                startTime: new Date(state.session.startTime).toISOString(),
                endTime: new Date().toISOString(),
                errorCount: state.gameplay.errorsInLevel,
                questionsCount: state.gameplay.mainQueue.length
            }).then(res => {
                if (res.success) {
                    set((current) => ({
                        gameplay: {
                            ...current.gameplay,
                            topScores: res.topScores || [],
                            submissionStatus: (res.data?.status as SubmissionStatus) ?? null,
                            submissionNewLevel: typeof res.data?.new_level === 'number' ? res.data.new_level : null
                        }
                    }))
                } else if (res.rejected) {
                    set((current) => ({
                        gameplay: {
                            ...current.gameplay,
                            submissionStatus: "rejected",
                            submissionNewLevel: null
                        }
                    }))
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
            gameMode: "quest",
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
            topScores: [],
            submissionStatus: null,
            submissionNewLevel: null
        }
    }),

    cancelGame: () => set((state) => ({
        session: {
            ...state.session,
            status: "IDLE",
            gameMode: "quest",
            startTime: null,
            endTime: null,
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
            topScores: [],
            submissionStatus: null,
            submissionNewLevel: null
        }
    })),

    setTopScores: (scores) => set((state) => ({
        gameplay: { ...state.gameplay, topScores: scores }
    })),

    forceTimeout: async () => {
        const state = get()
        if (state.session.status !== "PLAYING") return

        if (state.session.startTime && shouldSubmitLevelAttempt(state.session.gameMode)) {
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
