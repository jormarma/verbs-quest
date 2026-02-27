import { useState, useEffect, useRef, useMemo } from 'react'
import { AuthProvider } from './features/auth/AuthProvider'
import { useAuth } from './features/auth/AuthContext'
import { useGameStore } from './lib/stores/useGameStore'
import { Scene } from './components/3d/Scene'
import { VirtualKeyboard } from './components/game/VirtualKeyboard'
import { Timer } from './components/game/Timer'
import { Button } from './components/ui/Button'
import { LogOut, BookOpen, Swords, Play, Trophy, ArrowLeft } from 'lucide-react'
import { cn } from './lib/utils/cn'

import { useVerbs } from './lib/hooks/useVerbs'
import { useProfile } from './lib/hooks/useProfile'
import { useTotalLevels } from './lib/hooks/useTotalLevels'
import { useAppSettings } from './lib/hooks/useAppSettings'
import { AdminDashboard } from './features/admin/AdminDashboard'
import { GlobalLeaderboardTable } from './features/admin/GlobalLeaderboardTable'

// i18n
import { useTranslation } from './lib/hooks/useTranslation'
import { LanguageSwitcher } from './components/ui/LanguageSwitcher'
import { UpdateBanner } from './components/ui/UpdateBanner'

function GameBoard() {
  const { session, gameplay, startGame, startLevelTimer, cancelGame } = useGameStore()
  const { user, signOut } = useAuth()
  const { t, tVerb } = useTranslation()

  const { levelCap, role, isLoadingProfile } = useProfile()
  const { totalLevels, isLoadingTotalLevels } = useTotalLevels()
  const { settings } = useAppSettings()
  const [selectedLevel, setSelectedLevel] = useState<number>(1)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [lobbyView, setLobbyView] = useState<'menu' | 'play' | 'leaderboard'>('menu')
  const prevStatusRef = useRef(session.status)
  const effectiveTotalLevels = totalLevels > 0 ? totalLevels : 1
  const effectiveLevelCap = Math.max(1, Math.min(levelCap, effectiveTotalLevels))
  const levelToPlay = Math.max(1, Math.min(selectedLevel, effectiveTotalLevels))

  // Sync selected level to max unlocked level when profile initially loads
  useEffect(() => {
    if (levelCap <= 0) return
    const timeoutId = window.setTimeout(() => {
      setSelectedLevel(effectiveLevelCap)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [effectiveLevelCap, levelCap])
  const { questions, isLoading, error } = useVerbs(levelToPlay, settings.verbsPerLevel)
  const lessonVerbs = useMemo(
    () => Array.from(new Set(questions.map((q) => q.infinitive))).sort((a, b) => a.localeCompare(b)),
    [questions]
  )
  const isLeaderboardLobby = session.status === 'IDLE' && lobbyView === 'leaderboard'
  const isPlayLobby = session.status === 'IDLE' && lobbyView === 'play'
  const isViewportLockedLobby = isLeaderboardLobby || isPlayLobby

  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (countdown === null) return

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (countdown === 0) {
      startLevelTimer()
      const timeoutId = window.setTimeout(() => {
        setCountdown(null)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [countdown, startLevelTimer])

  useEffect(() => {
    const previousStatus = prevStatusRef.current
    if (previousStatus !== 'IDLE' && session.status === 'IDLE') {
      const timeoutId = window.setTimeout(() => {
        setLobbyView('menu')
      }, 0)
      prevStatusRef.current = session.status
      return () => window.clearTimeout(timeoutId)
    }
    prevStatusRef.current = session.status
  }, [session.status])

  const handleLevelClick = (lvl: number) => {
    setSelectedLevel(lvl)
  }

  const handleStartQuest = () => {
    startGame(levelToPlay, questions, true, { timeLimitSeconds: settings.timeLimitSeconds })
    setCountdown(3)
  }

  // Admin Override Route
  if (!isLoadingProfile && role === 'admin') {
    return <AdminDashboard />
  }

  if (isLoadingProfile || isLoadingTotalLevels) {
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
  const hasServerSubmission = gameplay.submissionStatus !== null
  const isServerPerfect = gameplay.submissionStatus === 'unlocked'
  const isFailedRun = hasServerSubmission
    ? (gameplay.submissionStatus === 'downgraded' || gameplay.submissionStatus === 'rejected')
    : gameplay.errorsInLevel >= 100
  const isPerfectRun = hasServerSubmission ? isServerPerfect : gameplay.errorsInLevel === 0
  const isLastPlayableLevel = totalLevels > 0 ? session.level >= totalLevels : false
  const unlockedByThisRun = hasServerSubmission
    ? (gameplay.submissionStatus === 'unlocked' && gameplay.submissionNewLevel === session.level + 1)
    : session.level >= effectiveLevelCap

  return (
    <div className="relative h-[100dvh] w-full font-sans text-slate-100 overflow-hidden flex flex-col">
      {/* Global 3D Background layer (-z-10) */}
      <Scene />

      {/* PWA Update Banner (z-50, fixed position) */}
      <UpdateBanner />

      {/* UI Foreground Layer (z-10) */}
      <main
        className={cn(
          "z-10 flex-1 min-h-0",
          isViewportLockedLobby
            ? "grid grid-rows-[auto_minmax(0,1fr)] gap-2 sm:gap-3 p-3 md:p-4 overflow-hidden"
            : "flex flex-col p-4 md:p-8"
        )}
      >

        {/* Top Header / HUD */}
        <header className={cn(
          "flex flex-col w-full max-w-5xl mx-auto gap-2 sm:gap-4",
          isViewportLockedLobby ? "mb-0" : "mb-2 sm:mb-4"
        )}>
          {/* Logo centered at the top */}
          <div className="flex flex-col items-center w-full">
            <div className="flex flex-col items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-3 sm:gap-4">
                <BookOpen className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-blue-400" strokeWidth={2.5} />
                <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 drop-shadow-sm">
                  {t('app.title')}
                </h1>
                <Swords className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-emerald-400" strokeWidth={2.5} />
              </div>
              {isOffline && (
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-900/40 border border-amber-500/50 rounded-full text-amber-300 text-xs sm:text-sm font-bold tracking-wider uppercase animate-pulse shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Offline Mode
                </div>
              )}
            </div>
          </div>

          <div className="w-full h-px bg-slate-700 my-1 sm:my-3" />

          {/* Sub-header with User on the left, Timer or controls on the right */}
          <div className="flex justify-between items-center w-full h-10 px-1 sm:px-2">
            {/* Left Side: Username Always Visible */}
            <div className="flex items-center gap-4">
              {user && (
                <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2 bg-slate-800/50 border border-slate-600 rounded-md px-3 py-1.5 shadow-lg backdrop-blur-md text-slate-200">
                  <span className="font-bold text-sm md:text-base tracking-wide truncate max-w-[150px] sm:max-w-[250px]">
                    @{user.user_metadata?.full_name || t('player.name')}
                  </span>
                </div>
              )}
            </div>

            {/* Right Side: Swap Timer vs Controls */}
            <div className="flex items-center gap-2">
              {session.status === 'PLAYING' && countdown === null ? (
                // During gameplay: Show Timer
                <Timer />
              ) : (
                // In lobby/menus: Show Controls
                <>
                  <LanguageSwitcher />

                  {user && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={signOut}
                      className="w-8 h-8 sm:w-9 sm:h-9 text-slate-400 hover:text-red-400 hover:border-red-500/50 hover:bg-red-950/30 transition-colors"
                      title={t('auth.signout')}
                    >
                      <LogOut className="w-4 h-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </header>

        {/* Center Stage */}
        <section className={cn(
          "flex-1 min-h-0 flex flex-col w-full max-w-5xl mx-auto",
          isViewportLockedLobby ? "items-stretch justify-start my-0 overflow-hidden" : "items-center justify-center my-2 sm:my-8"
        )}>

          {session.status === 'IDLE' && (
            <>
              {lobbyView === 'menu' && (
                <div className="flex-1 min-h-0 flex items-center justify-center animate-in fade-in slide-in-from-bottom-8 duration-700 w-full">
                  <div className="w-full max-w-md px-4 flex flex-col items-center">
                    <div className="w-full flex flex-col gap-5 items-center">
                      <Button
                        size="lg"
                        variant="default"
                        className="w-full max-w-[280px] h-16 text-lg font-bold flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 hover:shadow-emerald-500/50"
                        onClick={() => setLobbyView('leaderboard')}
                      >
                        <Trophy className="w-5 h-5" />
                        {t('home.leaderboard')}
                      </Button>
                      <Button
                        size="lg"
                        variant="default"
                        className="w-full max-w-[280px] h-16 text-lg font-bold flex items-center justify-center gap-2"
                        onClick={() => setLobbyView('play')}
                      >
                        <Play className="w-5 h-5" />
                        {t('home.play')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {lobbyView === 'play' && (
                <div className="w-full h-full min-h-0 max-w-md sm:max-w-2xl mx-auto px-2 sm:px-4 grid grid-rows-[minmax(0,1fr)_auto] gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
                  <div className="min-h-0 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <div className="min-h-full flex flex-col justify-center">
                      <div className="text-center space-y-2 sm:space-y-4 w-full">
                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black drop-shadow-lg text-white bg-gradient-to-br from-blue-300 to-emerald-300 bg-clip-text text-transparent mb-2 sm:mb-6">{t('quest.levels')}</h2>

                        <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 sm:gap-3 md:gap-4 w-full px-2 sm:px-3">
                          {Array.from({ length: totalLevels }, (_, i) => i + 1).map((lvl) => {
                            const isLocked = lvl > effectiveLevelCap
                            const isHighestUnlocked = lvl === effectiveLevelCap
                            const isSelected = lvl === levelToPlay

                            return (
                              <button
                                key={lvl}
                                disabled={isLocked || isLoading}
                                onClick={() => handleLevelClick(lvl)}
                                className={cn(
                                  "relative flex flex-col items-center justify-center aspect-square rounded-md transition-all duration-300 border-2 overflow-hidden shadow-sm group",
                                  isLocked ? "bg-slate-800 opacity-50 text-slate-500 border-slate-700 pointer-events-none" :
                                    isHighestUnlocked ? "bg-gradient-to-br from-blue-500 to-blue-700 text-white border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)] hover:-translate-y-1 hover:shadow-lg" :
                                      "bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600 hover:-translate-y-1 hover:shadow-lg active:scale-95",
                                  isSelected && !isLocked && "ring-4 ring-offset-2 ring-offset-slate-900 ring-white scale-105 border-transparent!"
                                )}
                              >
                                {isHighestUnlocked && (
                                  <div className="absolute inset-0 bg-white/20 group-hover:bg-white/30 transition-colors pointer-events-none" />
                                )}
                                <span className="font-black text-xl sm:text-2xl md:text-3xl z-10">{lvl}</span>
                              </button>
                            )
                          })}
                        </div>

                        <p className="text-sm sm:text-base text-blue-200/90 mt-6 sm:mt-8 font-semibold italic uppercase tracking-wide text-center leading-relaxed">
                          {isLoading
                            ? t('quest.loading')
                            : lessonVerbs.length > 0
                              ? lessonVerbs.join(', ').toUpperCase()
                              : t('quest.no_verbs')}
                        </p>

                        {error && <p className="text-red-400 font-bold mt-2">{t('error.loading_verbs', { error })}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="w-full flex justify-center pb-[max(0.25rem,env(safe-area-inset-bottom))]">
                    <div className="w-full max-w-md flex items-center justify-center gap-3">
                      <Button
                        variant="destructive"
                        className="h-12 sm:h-14 flex-1 font-bold text-base sm:text-lg"
                        onClick={() => setLobbyView('menu')}
                      >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        {t('home.back')}
                      </Button>
                      <Button
                        variant="default"
                        disabled={isLoading || questions.length === 0}
                        className="h-12 sm:h-14 flex-1 font-bold text-base sm:text-lg"
                        onClick={handleStartQuest}
                      >
                        {isLoading ? t('quest.loading') : t('quest.start')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {lobbyView === 'leaderboard' && (
                <div className="w-full h-full min-h-0 grid grid-rows-[minmax(0,1fr)_auto] gap-2 sm:gap-3 animate-in fade-in slide-in-from-bottom-8 duration-700">
                  <div className="min-h-0 bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden shadow-xl flex flex-col">
                    <GlobalLeaderboardTable mode="public" compact />
                  </div>
                  <div className="flex justify-center pb-[max(0.25rem,env(safe-area-inset-bottom))]">
                    <Button
                      variant="default"
                      className="min-w-[180px] font-bold"
                      onClick={() => setLobbyView('menu')}
                    >
                      <ArrowLeft className="w-4 h-4 mr-1" />
                      {t('home.back')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Cancel Modal (Overlay over PLAYING area) */}
          {showCancelModal && session.status === 'PLAYING' && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm -mx-4 md:-mx-8">
              <div className="bg-slate-800 border border-slate-700 shadow-2xl rounded-2xl p-6 text-center max-w-sm w-full animate-in zoom-in-95 duration-200">
                <h3 className="text-2xl font-black text-rose-500 mb-2">{t('quest.give_up')}</h3>
                <p className="text-slate-300 mb-6">{t('quest.cancel_confirm')}</p>
                <div className="flex gap-4 justify-center">
                  <Button variant="outline" onClick={() => setShowCancelModal(false)}>
                    {t('quest.keep_playing')}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setShowCancelModal(false)
                      cancelGame()
                    }}
                  >
                    {t('quest.yes_cancel')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {session.status === 'PLAYING' && currentQ && (
            <div className="w-full flex-1 flex flex-col items-center justify-center gap-4 sm:gap-8 md:gap-12 animate-in zoom-in-95 duration-500 relative">
              {/* Countdown Modal Overlay over the gameplay screen */}
              {countdown !== null && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md rounded-2xl p-4">
                  <div className="bg-slate-800/90 shadow-[0_0_60px_rgba(52,211,153,0.3)] rounded-[3rem] w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 flex items-center justify-center border-[6px] border-emerald-500/80 backdrop-blur-xl overflow-hidden relative">
                    {countdown > 0 && (
                      <div
                        key={countdown}
                        className="text-[6rem] sm:text-[8rem] md:text-[12rem] font-black bg-gradient-to-br from-emerald-300 to-blue-400 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(52,211,153,0.8)] animate-countdown-zoom"
                      >
                        {countdown}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Question Card */}
              <div className="text-center space-y-2 sm:space-y-4">
                <div className="inline-flex items-center px-3 py-1.5 sm:px-4 sm:py-1.5 rounded-md bg-blue-900/40 text-blue-300 border border-blue-700/50 text-xs sm:text-sm font-bold uppercase tracking-widest shadow-inner">
                  {t(`tense.${currentQ.tense}`)}
                </div>
                {/* Prompting the player with the infinitive loaded directly from Supabase */}
                <h2 className="text-4xl sm:text-5xl md:text-7xl font-black text-white drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] tracking-tight uppercase">
                  {currentQ.infinitive}
                </h2>
                {tVerb(currentQ.infinitive) && (
                  <p className="text-sm sm:text-base text-blue-200/80 font-bold uppercase tracking-widest mt-0 sm:mt-1">
                    {tVerb(currentQ.infinitive)}
                  </p>
                )}
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
                  "relative h-16 sm:h-20 md:h-24 w-60 sm:w-64 md:w-96 bg-slate-900 border-2 rounded-xl flex items-center justify-center overflow-hidden shadow-2xl transition-colors duration-300",
                  gameplay.feedbackState === 'NONE' ? "border-slate-700" : "",
                  gameplay.feedbackState === 'CORRECT' ? "border-emerald-500 bg-emerald-950/30" : "",
                  gameplay.feedbackState === 'INCORRECT' ? "border-red-500 bg-red-950/30" : ""
                )}>
                  {gameplay.currentInput ? (
                    <span className={cn(
                      "text-3xl sm:text-4xl md:text-5xl font-mono font-bold tracking-widest",
                      gameplay.feedbackState === 'CORRECT' ? "text-emerald-400" : gameplay.feedbackState === 'INCORRECT' ? "text-red-400 line-through decoration-red-500/50" : "text-white"
                    )}>
                      {gameplay.currentInput}
                    </span>
                  ) : (
                    <span className="text-3xl sm:text-4xl md:text-5xl font-mono font-bold text-slate-600 tracking-widest animate-pulse">{t('quest.type')}</span>
                  )}
                  {/* Blinking Cursor */}
                  {gameplay.feedbackState === 'NONE' && <div className="h-8 sm:h-10 w-1 bg-blue-500 ml-1 animate-pulse" />}
                </div>
              </div>

              {/* Cancel Button (Middle Area) */}
              <Button
                variant="destructive"
                onClick={() => setShowCancelModal(true)}
                className="mt-0 sm:mt-2 text-xs sm:text-sm font-bold tracking-wide"
              >
                {t('quest.cancel_run')}
              </Button>
            </div>
          )}

          {session.status === 'FINISHED' && (
            <div className="flex flex-col items-center gap-6 animate-in zoom-in-95 duration-700 w-full">
              {isPerfectRun && isLastPlayableLevel ? (
                <div className="flex flex-col items-center animate-bounce">
                  <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-emerald-400 to-yellow-300 drop-shadow-[0_0_15px_rgba(252,211,77,0.8)]">
                    {t('quest.incredible')}
                  </h2>
                  <p className="text-xl md:text-2xl font-bold mt-2 text-emerald-300 drop-shadow-sm">{t('quest.mastered_all')}</p>
                </div>
              ) : !isFailedRun ? (
                <h2 className="text-4xl md:text-5xl text-center font-black text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)] leading-tight">{t('quest.level_complete')}</h2>
              ) : (
                <h2 className="text-4xl md:text-5xl text-center font-black text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] leading-tight">{t('quest.level_failed')}</h2>
              )}

              <div className="bg-slate-800/80 p-4 md:p-6 rounded-2xl border border-slate-700 shadow-xl text-center space-y-2 max-w-lg w-full">
                {isPerfectRun ? (
                  isLastPlayableLevel ? (
                    <p className="text-xl md:text-2xl text-yellow-300 font-bold">{t('quest.perfect_master')}</p>
                  ) : unlockedByThisRun ? (
                    <p className="text-lg md:text-xl text-emerald-300 font-semibold drop-shadow-sm">{t('quest.perfect_unlocked')}</p>
                  ) : (
                    <p className="text-lg md:text-xl text-emerald-300 font-semibold drop-shadow-sm">{t('quest.perfect_practice')}</p>
                  )
                ) : !isFailedRun ? (
                  <div className="flex flex-col gap-1.5 md:gap-2">
                    <p className="text-lg md:text-xl text-slate-300">{t('quest.errors_made', { count: gameplay.errorsInLevel })}</p>
                    <p className="text-sm md:text-base text-yellow-400 font-bold">{t('quest.need_perfect')}</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-xl text-red-400 font-bold">{t('quest.times_up')}</p>
                    {session.level > 1 ? (
                      <p className="text-red-300">{t('quest.lost_access')}</p>
                    ) : (
                      <p className="text-red-300">{t('quest.keep_trying')}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Leaderboard Section */}
              {!isFailedRun && (
                <div className="w-full max-w-lg bg-slate-900/60 backdrop-blur border border-slate-700 p-4 md:p-6 rounded-2xl shadow-xl mt-2 md:mt-4">
                  <h3 className="text-xl md:text-2xl font-black text-emerald-400 mb-3 md:mb-4 text-center uppercase tracking-widest drop-shadow-sm border-b border-slate-700/50 pb-2">{t('leaderboard.top3')}</h3>
                  {gameplay.topScores.length === 0 ? (
                    <div className="text-center py-4 text-slate-400 animate-pulse">{t('quest.loading')}</div>
                  ) : (
                    <>
                      <ul className="space-y-2">
                        {gameplay.topScores.slice(0, 3).map((score, idx: number) => {
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
                                    {t('leaderboard.new_best')}
                                  </span>
                                )}
                              </div>
                              {score.is_perfect_run && (
                                <div className="flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-full shrink-0">
                                  <span className="text-yellow-400 text-[10px] md:text-sm font-bold tracking-wide">{t('leaderboard.perfect')}</span>
                                  <span>⭐</span>
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>

                      {(() => {
                        const currentDuration = session.endTime && session.startTime
                          ? Math.floor((session.endTime - session.startTime) / 1000)
                          : null;

                        const top3Scores = gameplay.topScores.slice(0, 3);
                        const isRunInTop3 = top3Scores.some((s) => new Date().getTime() - new Date(s.completed_at).getTime() < 10000);

                        if (!isRunInTop3 && currentDuration !== null) {
                          const mins = Math.floor(currentDuration / 60);
                          const secs = currentDuration % 60;
                          const isPerfect = isPerfectRun;
                          return (
                            <div className="mt-4 pt-4 border-t border-slate-700/50">
                              <span className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 block text-center">{t('leaderboard.your_last')}</span>
                              <div className="flex justify-between items-center p-2 md:p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg shadow-inner backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2">
                                <span className="text-blue-200 font-bold text-sm tracking-wider flex items-center gap-2">
                                  {t('leaderboard.current_time')}
                                </span>
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-base md:text-xl text-blue-100 font-black tracking-wider">{mins}:{secs.toString().padStart(2, '0')}</span>
                                  {isPerfect && (
                                    <div className="flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-full shrink-0">
                                      <span className="text-yellow-400 text-[10px] md:text-sm font-bold tracking-wide">{t('leaderboard.perfect')}</span>
                                      <span>⭐</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        }
                        return null;
                      })()}
                    </>
                  )}
                </div>
              )}

              <Button
                onClick={() => window.location.reload()}
                className="mt-4"
                variant="default"
              >
                {t('btn.continue')}
              </Button>
            </div>
          )}
        </section>

        {/* Keyboard Footer */}
        {session.status === 'PLAYING' && (
          <div className={cn("w-full pb-2 md:pb-4 transition-opacity duration-300", countdown !== null ? "opacity-50 pointer-events-none" : "animate-in slide-in-from-bottom-24 duration-500")}>
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
