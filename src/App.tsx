import { useState, useEffect } from 'react'
import { AuthProvider } from './features/auth/AuthProvider'
import { useAuth } from './features/auth/AuthContext'
import { useGameStore } from './lib/stores/useGameStore'
import { Scene } from './components/3d/Scene'
import { VirtualKeyboard } from './components/game/VirtualKeyboard'
import { Timer } from './components/game/Timer'
import { Button } from './components/ui/Button'
import { Play, LogOut, User as UserIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from './lib/utils/cn'

import { useVerbs } from './lib/hooks/useVerbs'
import { useProfile } from './lib/hooks/useProfile'

function GameBoard() {
  const { session, gameplay, startGame, cancelGame } = useGameStore()
  const { user, signOut } = useAuth()

  const { levelCap, isLoadingProfile } = useProfile()
  const [selectedLevel, setSelectedLevel] = useState<number>(1)
  const [showCancelModal, setShowCancelModal] = useState(false)

  // Sync selected level to max unlocked level when profile initially loads
  useEffect(() => {
    if (levelCap > 0) {
      setSelectedLevel(levelCap)
    }
  }, [levelCap])

  const levelToPlay = selectedLevel
  const { questions, isLoading, error } = useVerbs(levelToPlay)

  if (isLoadingProfile) {
    return (
      <div className="flex bg-slate-900 text-white min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    )
  }

  // Derived state to show current question
  const isMainQueue = gameplay.currentQuestionIndex < gameplay.mainQueue.length
  const currentQ = session.status === 'PLAYING' ? (
    isMainQueue
      ? gameplay.mainQueue[gameplay.currentQuestionIndex]
      : gameplay.retryQueue[gameplay.currentQuestionIndex - gameplay.mainQueue.length]
  ) : null

  return (
    <div className="relative min-h-screen w-full font-sans text-slate-100 overflow-hidden flex flex-col">
      {/* Global 3D Background layer (-z-10) */}
      <Scene />

      {/* UI Foreground Layer (z-10) */}
      <main className="z-10 flex-1 flex flex-col p-4 md:p-8">

        {/* Top Header / HUD */}
        <header className="flex flex-col w-full max-w-5xl mx-auto gap-4 mb-4">
          {/* Logo centered at the top */}
          <div className="flex justify-center w-full">
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 drop-shadow-sm">
              VERBS QUEST
            </h1>
          </div>

          {/* Sub-header with User on the right, Timer on the left if playing */}
          <div className="flex justify-between items-center w-full h-10">
            <div className="flex items-center">
              {session.status === 'PLAYING' && <Timer />}
            </div>

            <div className="flex items-center gap-2">
              {user && (
                <div className="flex items-center gap-1.5 bg-slate-800/80 backdrop-blur px-3 py-1.5 rounded-full border border-slate-700/50 shadow-sm animate-in fade-in slide-in-from-top-2">
                  <UserIcon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="font-bold text-slate-200 text-xs md:text-sm tracking-wide truncate max-w-[80px] sm:max-w-[150px]">
                    {user.user_metadata?.full_name || 'Player'}
                  </span>
                  <button
                    onClick={signOut}
                    className="ml-1 text-slate-400 hover:text-red-400 transition-colors p-1 rounded-full hover:bg-slate-700/50 flex-shrink-0"
                    title="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Center Stage */}
        <section className="flex-1 flex flex-col items-center justify-center w-full max-w-5xl mx-auto my-8">

          {session.status === 'IDLE' && (
            <div className="flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="text-center space-y-4">

                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => setSelectedLevel(Math.max(1, selectedLevel - 1))}
                    disabled={selectedLevel <= 1}
                    className="p-3 bg-slate-800/80 backdrop-blur rounded-full border border-slate-700 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-slate-300 hover:text-white shadow-lg active:scale-95"
                  >
                    <ChevronLeft size={28} />
                  </button>

                  <div className="w-48 text-center flex flex-col items-center justify-center">
                    <span className="text-base text-slate-400 font-bold tracking-widest uppercase mb-1">Select Level</span>
                    <h2 className="text-5xl md:text-6xl font-black drop-shadow-lg text-white bg-gradient-to-br from-blue-300 to-emerald-300 bg-clip-text text-transparent">{selectedLevel}</h2>
                  </div>

                  <button
                    onClick={() => setSelectedLevel(Math.min(levelCap, selectedLevel + 1))}
                    disabled={selectedLevel >= levelCap}
                    className="p-3 bg-slate-800/80 backdrop-blur rounded-full border border-slate-700 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-slate-300 hover:text-white shadow-lg active:scale-95"
                  >
                    <ChevronRight size={28} />
                  </button>
                </div>

                <p className="text-lg text-blue-200/80 mt-4">Identify the correct past forms of the verbs.</p>
                {selectedLevel < levelCap && (
                  <p className="text-sm font-bold text-emerald-400 bg-emerald-900/30 inline-block px-3 py-1 rounded-full border border-emerald-500/20">
                    Practicing Past Level
                  </p>
                )}
                {error && <p className="text-red-400 font-bold mt-2">Error loading verbs: {error}</p>}
              </div>
              <Button
                size="lg"
                disabled={isLoading || questions.length === 0}
                className="text-xl px-12 py-8 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-xl hover:shadow-2xl hover:scale-105 transition-all outline outline-4 outline-offset-4 outline-transparent hover:outline-blue-500/50 flex items-center mt-2"
                onClick={() => startGame(levelToPlay, questions)}
              >
                <Play className="mr-3 h-8 w-8" /> {isLoading ? 'Loading...' : 'Start Quest'}
              </Button>
            </div>
          )}

          {/* Cancel Modal (Overlay over PLAYING area) */}
          {showCancelModal && session.status === 'PLAYING' && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm -mx-4 md:-mx-8">
              <div className="bg-slate-800 border border-slate-700 shadow-2xl rounded-2xl p-6 text-center max-w-sm w-full animate-in zoom-in-95 duration-200">
                <h3 className="text-2xl font-black text-rose-500 mb-2">Give Up?</h3>
                <p className="text-slate-300 mb-6">Are you sure you want to cancel the current run? No progress or errors will be recorded, but you will lose this attempt.</p>
                <div className="flex gap-4 justify-center">
                  <Button variant="outline" onClick={() => setShowCancelModal(false)}>
                    Keep Playing
                  </Button>
                  <Button
                    className="bg-rose-600 hover:bg-rose-500 text-white border-transparent"
                    onClick={() => {
                      setShowCancelModal(false)
                      cancelGame()
                    }}
                  >
                    Yes, Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {session.status === 'PLAYING' && currentQ && (
            <div className="w-full flex-1 flex flex-col items-center justify-center gap-12 animate-in zoom-in-95 duration-500">
              {/* Question Card */}
              <div className="text-center space-y-4">
                <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-700/50 text-sm font-bold uppercase tracking-widest shadow-inner">
                  {currentQ.tense.replace('_', ' ')}
                </div>
                {/* Prompting the player with the infinitive loaded directly from Supabase */}
                <h2 className="text-5xl md:text-7xl font-black text-white drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] tracking-tight uppercase">
                  {currentQ.infinitive}
                </h2>
              </div>

              {/* Input Display Area */}
              <div className="relative group">
                <div className={cn(
                  "absolute -inset-1 rounded-xl blur transition duration-1000",
                  gameplay.feedbackState === 'NONE' ? "bg-gradient-to-r from-blue-600 to-cyan-600 opacity-25 group-hover:opacity-40" : "",
                  gameplay.feedbackState === 'CORRECT' ? "bg-emerald-500 opacity-75 animate-pulse" : "",
                  gameplay.feedbackState === 'INCORRECT' ? "bg-red-500 opacity-75 animate-pulse" : ""
                )}></div>
                <div className={cn(
                  "relative h-20 md:h-24 w-64 md:w-96 bg-slate-900 border-2 rounded-xl flex items-center justify-center overflow-hidden shadow-2xl transition-colors duration-300",
                  gameplay.feedbackState === 'NONE' ? "border-slate-700" : "",
                  gameplay.feedbackState === 'CORRECT' ? "border-emerald-500 bg-emerald-950/30" : "",
                  gameplay.feedbackState === 'INCORRECT' ? "border-red-500 bg-red-950/30" : ""
                )}>
                  {gameplay.currentInput ? (
                    <span className={cn(
                      "text-4xl md:text-5xl font-mono font-bold tracking-widest",
                      gameplay.feedbackState === 'CORRECT' ? "text-emerald-400" : gameplay.feedbackState === 'INCORRECT' ? "text-red-400 line-through decoration-red-500/50" : "text-white"
                    )}>
                      {gameplay.currentInput}
                    </span>
                  ) : (
                    <span className="text-4xl md:text-5xl font-mono font-bold text-slate-600 tracking-widest animate-pulse">TYPE...</span>
                  )}
                  {/* Blinking Cursor */}
                  {gameplay.feedbackState === 'NONE' && <div className="h-10 w-1 bg-blue-500 ml-1 animate-pulse" />}
                </div>
              </div>

              {/* Cancel Button (Middle Area) */}
              <button
                onClick={() => setShowCancelModal(true)}
                className="mt-2 text-sm font-bold text-slate-500 hover:text-rose-400 transition-colors underline underline-offset-4 decoration-slate-700 hover:decoration-rose-400/50"
              >
                Cancel Run
              </button>
            </div>
          )}

          {session.status === 'FINISHED' && (
            <div className="flex flex-col items-center gap-6 animate-in zoom-in-95 duration-700 w-full">
              {gameplay.errorsInLevel === 0 && session.level === 18 ? (
                <div className="flex flex-col items-center animate-bounce">
                  <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-emerald-400 to-yellow-300 drop-shadow-[0_0_15px_rgba(252,211,77,0.8)]">
                    🎉 INCREDIBLE! 🎉
                  </h2>
                  <p className="text-xl md:text-2xl font-bold mt-2 text-emerald-300 drop-shadow-sm">YOU MASTERED ALL LEVELS!</p>
                </div>
              ) : gameplay.errorsInLevel < 100 ? (
                <h2 className="text-4xl md:text-5xl text-center font-black text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)] leading-tight">Level Complete!</h2>
              ) : (
                <h2 className="text-4xl md:text-5xl text-center font-black text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] leading-tight">Level Failed!</h2>
              )}

              <div className="bg-slate-800/80 p-4 md:p-6 rounded-2xl border border-slate-700 shadow-xl text-center space-y-2 max-w-lg w-full">
                {gameplay.errorsInLevel === 0 ? (
                  session.level === 18 ? (
                    <p className="text-xl md:text-2xl text-yellow-300 font-bold">Absolutely perfect! A true master of irregular verbs!</p>
                  ) : session.level < levelCap ? (
                    <p className="text-lg md:text-xl text-emerald-300 font-semibold drop-shadow-sm">Perfect run! Well done practicing.</p>
                  ) : (
                    <p className="text-lg md:text-xl text-emerald-300 font-semibold drop-shadow-sm">Perfect run! You unlocked the next level.</p>
                  )
                ) : gameplay.errorsInLevel < 100 ? (
                  <div className="flex flex-col gap-1.5 md:gap-2">
                    <p className="text-lg md:text-xl text-slate-300">Errors made: {gameplay.errorsInLevel}</p>
                    <p className="text-sm md:text-base text-yellow-400 font-bold">Good job, but you need a perfect run to unlock the next level.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-xl text-red-400 font-bold">Time's up!</p>
                    {session.level > 1 ? (
                      <p className="text-red-300">You lost access to this level. Beat the previous one to unlock it again!</p>
                    ) : (
                      <p className="text-red-300">Keep trying! You will get it next time.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Leaderboard Section */}
              {gameplay.errorsInLevel < 100 && (
                <div className="w-full max-w-lg bg-slate-900/60 backdrop-blur border border-slate-700 p-4 md:p-6 rounded-2xl shadow-xl mt-2 md:mt-4">
                  <h3 className="text-xl md:text-2xl font-black text-emerald-400 mb-3 md:mb-4 text-center uppercase tracking-widest drop-shadow-sm border-b border-slate-700/50 pb-2">Top 3 Times</h3>
                  {gameplay.topScores.length === 0 ? (
                    <div className="text-center py-4 text-slate-400 animate-pulse">Loading scores...</div>
                  ) : (
                    <ul className="space-y-2">
                      {gameplay.topScores.slice(0, 3).map((score: any, idx: number) => {
                        const minutes = Math.floor(score.duration_seconds / 60)
                        const seconds = score.duration_seconds % 60
                        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`

                        // Check if the score is brand new (less than 5 seconds old)
                        const isNew = new Date().getTime() - new Date(score.completed_at).getTime() < 5000

                        return (
                          <li key={idx} className={cn(
                            "flex justify-between items-center p-2 md:p-3 border rounded-lg",
                            isNew ? "bg-emerald-900/40 border-emerald-500 shadow-[0_0_15px_rgba(52,211,153,0.2)] animate-pulse" : "bg-slate-800/50 border-slate-700/50"
                          )}>
                            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                              <div className={cn(
                                "flex items-center justify-center w-7 h-7 md:w-9 md:h-9 rounded-full font-black text-slate-900 shrink-0 shadow-md",
                                idx === 0 ? "bg-yellow-400" :
                                  idx === 1 ? "bg-slate-300" :
                                    "bg-amber-600 text-white"
                              )}>
                                <span className="text-sm md:text-base">{idx + 1}</span>
                              </div>
                              <span className="font-mono text-base md:text-xl text-white font-medium pl-1 md:pl-0">{timeString}</span>
                              {isNew && (
                                <span className="text-[9px] md:text-[10px] font-black tracking-widest text-emerald-300 bg-emerald-900 px-1.5 py-0.5 rounded-full border border-emerald-500 ml-1 md:ml-2">
                                  NEW BEST!
                                </span>
                              )}
                            </div>
                            {score.is_perfect_run && (
                              <div className="flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-full shrink-0">
                                <span className="text-yellow-400 text-[10px] md:text-sm font-bold tracking-wide">PERFECT</span>
                                <span>⭐</span>
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}

              <Button
                onClick={() => window.location.reload()}
                className="mt-4"
                variant="outline"
              >
                Continue
              </Button>
            </div>
          )}
        </section>

        {/* Keyboard Footer */}
        {session.status === 'PLAYING' && (
          <div className="w-full pb-4 animate-in slide-in-from-bottom-24 duration-500">
            <VirtualKeyboard />
          </div>
        )}

      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <GameBoard />
    </AuthProvider>
  )
}

export default App
