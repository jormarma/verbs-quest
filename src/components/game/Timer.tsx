import { useEffect, useState } from 'react'
import { useGameStore } from '../../lib/stores/useGameStore'
import { Clock } from 'lucide-react'
import { cn } from '../../lib/utils/cn'

export function Timer() {
    const { session, gameplay } = useGameStore()
    const [timeLeft, setTimeLeft] = useState(session.config.timeLimit)

    useEffect(() => {
        if (session.status !== 'PLAYING' || !session.startTime) return

        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - session.startTime!) / 1000)
            const remaining = Math.max(0, session.config.timeLimit - elapsed)

            setTimeLeft(remaining)

            if (remaining === 0) {
                clearInterval(interval)
                useGameStore.getState().forceTimeout()
            }
        }, 1000)

        return () => clearInterval(interval)
    }, [session.status, session.startTime, session.config.timeLimit])

    // Formatting MM:SS
    const minutes = Math.floor(timeLeft / 60)
    const seconds = timeLeft % 60
    const isLowTime = timeLeft <= 15

    return (
        <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-lg backdrop-blur-md transition-colors",
            isLowTime
                ? "bg-red-900/50 border-red-500 text-red-200 animate-pulse"
                : "bg-slate-800/50 border-slate-600 text-slate-200"
        )}>
            <Clock size={16} className={isLowTime ? "text-red-400" : "text-blue-400"} />
            <span className="font-mono text-base md:text-lg font-bold tracking-wider leading-none">
                {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
            </span>
            {/* Show errors as part of the HUD */}
            <div className="ml-2 pl-2 md:ml-3 md:pl-3 border-l border-slate-600/50 flex items-center gap-1 text-xs md:text-sm font-medium">
                <span className="text-slate-400 hidden sm:inline">Errors:</span>
                <span className="text-slate-400 sm:hidden">Err:</span>
                <span className={gameplay.errorsInLevel > 0 ? "text-amber-400" : "text-emerald-400"}>
                    {gameplay.errorsInLevel}
                </span>
            </div>
        </div>
    )
}
