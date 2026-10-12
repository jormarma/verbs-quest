import { create } from 'zustand'
import { submitLevelAttempt, type SubmitAttemptResult } from '../utils/sync'
import { shouldSubmitLevelAttempt, type GameMode } from '../game/gameMode'
import { recordVerbError } from '../game/verbStats'

export type GameStatus = "IDLE" | "PLAYING" | "PAUSED" | "FINISHED"
export type SubmissionStatus = "pending" | "unlocked" | "maintained" | "downgraded" | "unconfirmed" | "rejected" | null

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
        pausedAt: number | null
        totalPausedMs: number
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
        submissionPreviousCap: number | null
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

type SubmissionFields = Pick<GameState["gameplay"], "submissionStatus" | "submissionNewLevel" | "submissionPreviousCap" | "topScores">

const PENDING_SUBMISSION: SubmissionFields = {
    submissionStatus: "pending",
    submissionNewLevel: null,
    submissionPreviousCap: null,
    topScores: []
}

function submissionFields(result: SubmitAttemptResult): SubmissionFields {
    const verdict = result.data?.status
    if (
        result.success
        && result.data
        && (verdict === "unlocked" || verdict === "maintained" || verdict === "downgraded")
    ) {
        return {
            submissionStatus: verdict,
            submissionNewLevel: result.data.new_level,
            submissionPreviousCap: result.previousLevelCap ?? null,
            topScores: result.topScores ?? []
        }
    }
    return {
        submissionStatus: result.rejected ? "rejected" : "unconfirmed",
        submissionNewLevel: null,
        submissionPreviousCap: null,
        topScores: []
    }
}

export const useGameStore = create<GameState>((set, get) => ({
    session: {
        level: 1,
        status: "IDLE",
        gameMode: "quest",
        startTime: null,
        pausedAt: null,
        totalPausedMs: 0,
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
        submissionNewLevel: null,
        submissionPreviousCap: null
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
                pausedAt: null,
                totalPausedMs: 0,
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
                submissionNewLevel: null,
                submissionPreviousCap: null
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
        if (state.session.status === "FINISHED") return state
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
            recordVerbError(currentQ.infinitive)
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
        if (state.session.status === "FINISHED") return state
        const nextIndex = state.gameplay.currentQuestionIndex + 1
        const totalQuestions = state.gameplay.mainQueue.length + state.gameplay.retryQueue.length
        const isFinished = nextIndex >= totalQuestions
        const submittedStart = isFinished && shouldSubmitLevelAttempt(state.session.gameMode)
            ? state.session.startTime
            : null

        if (submittedStart) {
            // Fire and forget the sync submission
            submitLevelAttempt({
                levelId: state.session.level,
                startTime: new Date(submittedStart).toISOString(),
                endTime: new Date().toISOString(),
                errorCount: state.gameplay.errorsInLevel,
                questionsCount: state.gameplay.mainQueue.length
            }).then((result) => {
                // A late answer must not land on a run that replaced this one.
                if (get().session.startTime !== submittedStart) return
                set((current) => ({ gameplay: { ...current.gameplay, ...submissionFields(result) } }))
            })
        }

        return {
            gameplay: {
                ...state.gameplay,
                ...(submittedStart ? PENDING_SUBMISSION : {}),
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

    pauseGame: () => set((state) => {
        if (state.session.status !== 'PLAYING' || state.session.pausedAt !== null) {
            return state
        }
        return {
            session: {
                ...state.session,
                status: 'PAUSED',
                pausedAt: Date.now(),
            },
        }
    }),

    resumeGame: () => set((state) => {
        if (state.session.status !== 'PAUSED' || state.session.pausedAt === null) {
            return state
        }
        const pauseDuration = Date.now() - state.session.pausedAt
        return {
            session: {
                ...state.session,
                status: 'PLAYING',
                pausedAt: null,
                totalPausedMs: state.session.totalPausedMs + pauseDuration,
            },
        }
    }),

    resetGame: () => set({
        session: {
            level: 1,
            status: "IDLE",
            gameMode: "quest",
            startTime: null,
            pausedAt: null,
            totalPausedMs: 0,
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
            submissionNewLevel: null,
            submissionPreviousCap: null
        }
    }),

    cancelGame: () => set((state) => ({
        session: {
            ...state.session,
            status: "IDLE",
            gameMode: "quest",
            startTime: null,
            pausedAt: null,
            totalPausedMs: 0,
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
            submissionNewLevel: null,
            submissionPreviousCap: null
        }
    })),

    setTopScores: (scores) => set((state) => ({
        gameplay: { ...state.gameplay, topScores: scores }
    })),

    forceTimeout: async () => {
        const state = get()
        if (state.session.status !== "PLAYING") return

        const submittedStart = state.session.startTime
        if (!submittedStart || !shouldSubmitLevelAttempt(state.session.gameMode)) {
            set((current) => ({
                session: { ...current.session, status: "FINISHED", endTime: Date.now() }
            }))
            return
        }

        // Finish the run before the save, so pause, Continue and a second timer call all refuse it.
        set((current) => ({
            session: { ...current.session, status: "FINISHED", endTime: Date.now() },
            gameplay: { ...current.gameplay, ...PENDING_SUBMISSION }
        }))
        const result = await submitLevelAttempt({
            levelId: state.session.level,
            startTime: new Date(submittedStart).toISOString(),
            endTime: new Date(submittedStart + (state.session.config.timeLimit + 1) * 1000).toISOString(),
            errorCount: state.gameplay.errorsInLevel + 1, // Add an error to ensure it is not perfect
            questionsCount: state.gameplay.mainQueue.length
        })
        // The run may have been replaced while waiting, so leave the newer run alone.
        if (get().session.startTime !== submittedStart) return
        set((current) => ({ gameplay: { ...current.gameplay, ...submissionFields(result) } }))
    }
}))
