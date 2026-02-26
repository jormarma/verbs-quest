import { useEffect, useMemo, useState } from 'react'
import { Trophy, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase/client'
import type { AdminUserOverview } from '../../lib/hooks/useAdminStats'
import { useTranslation } from '../../lib/hooks/useTranslation'
import { cn } from '../../lib/utils/cn'

type SortKey = 'level' | 'perfect_runs' | 'total_runs' | 'name'
type LeaderboardMode = 'admin' | 'public'

interface GlobalLeaderboardTableProps {
  onSelectUser?: (user: AdminUserOverview) => void
  mode?: LeaderboardMode
  compact?: boolean
}

export function GlobalLeaderboardTable({ onSelectUser, mode = 'admin', compact = false }: GlobalLeaderboardTableProps) {
  const { t } = useTranslation()
  const [overviewData, setOverviewData] = useState<AdminUserOverview[]>([])
  const [isLoadingOverview, setIsLoadingOverview] = useState(false)
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'desc' | 'asc' }>({
    key: 'level',
    direction: 'desc',
  })

  useEffect(() => {
    const fetchOverview = async () => {
      setIsLoadingOverview(true)

      // Both admin and student leaderboards must come from the same source data.
      const { data, error } = await supabase.rpc('get_admin_users_overview')

      if (error) {
        console.error(`Failed to fetch ${mode} leaderboard overview:`, error)
        setOverviewData([])
      } else {
        setOverviewData((data || []) as AdminUserOverview[])
      }

      setIsLoadingOverview(false)
    }

    fetchOverview()
  }, [mode])

  const requestSort = (key: SortKey) => {
    let direction: 'desc' | 'asc' = 'desc'
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc'
    }
    setSortConfig({ key, direction })
  }

  const sortedOverviewData = useMemo(() => {
    return [...overviewData].sort((a, b) => {
      const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1

      if (sortConfig.key === 'name') {
        return a.username.localeCompare(b.username) * directionMultiplier
      }

      const compareNum = (valA: number, valB: number) => {
        if (valA < valB) return -1
        if (valA > valB) return 1
        return 0
      }

      let result = 0
      if (sortConfig.key === 'level') {
        if (a.current_level_cap !== b.current_level_cap) result = compareNum(a.current_level_cap, b.current_level_cap)
        else if (a.total_perfect_runs !== b.total_perfect_runs) result = compareNum(a.total_perfect_runs, b.total_perfect_runs)
        else result = compareNum(a.total_runs, b.total_runs)
      } else if (sortConfig.key === 'perfect_runs') {
        if (a.total_perfect_runs !== b.total_perfect_runs) result = compareNum(a.total_perfect_runs, b.total_perfect_runs)
        else if (a.current_level_cap !== b.current_level_cap) result = compareNum(a.current_level_cap, b.current_level_cap)
        else result = compareNum(a.total_runs, b.total_runs)
      } else if (sortConfig.key === 'total_runs') {
        if (a.total_runs !== b.total_runs) result = compareNum(a.total_runs, b.total_runs)
        else if (a.current_level_cap !== b.current_level_cap) result = compareNum(a.current_level_cap, b.current_level_cap)
        else result = compareNum(a.total_perfect_runs, b.total_perfect_runs)
      }

      return result * directionMultiplier
    })
  }, [overviewData, sortConfig])

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortConfig.key !== columnKey) return null
    return sortConfig.direction === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 shrink-0 ml-[2px]" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 shrink-0 ml-[2px]" />
    )
  }

  return (
    <div className={cn(
      "flex-1 flex flex-col min-h-0",
      compact ? "px-2 pt-2 pb-0 md:px-3 md:pt-3 md:pb-1" : "p-2 md:p-4"
    )}>
      <div className={cn(
        "flex justify-between items-start px-2",
        compact ? "mb-1" : "mb-4"
      )}>
        <Trophy className="text-emerald-400 w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex flex-col items-center flex-1 px-4">
          <h2 className="text-xl font-bold text-white tracking-wide text-center leading-tight">{t('leaderboard.global_overview')}</h2>
          <p className="text-slate-400 text-sm font-medium mt-0.5 text-center">{t('leaderboard.players_count', { count: overviewData.length })}</p>
        </div>
        <Trophy className="text-emerald-400 w-5 h-5 shrink-0 mt-0.5" />
      </div>

      {isLoadingOverview ? (
        <div className="flex-1 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : overviewData.length === 0 ? (
        <div className="flex-1 flex justify-center items-center text-slate-500">{t('leaderboard.no_players')}</div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="sticky top-0 bg-slate-800 z-10 shadow-sm border-b border-slate-700/80">
              <tr className="text-slate-400 text-xs md:text-base uppercase tracking-wider">
                <th className="py-2 px-1 md:px-2 font-semibold w-[44px] md:w-[52px] text-right">
                  <span className="inline-block text-right w-full">#</span>
                </th>
                <th
                  className={`py-2 px-2 font-semibold cursor-pointer hover:bg-slate-700/50 transition-colors select-none ${sortConfig.key === 'name' ? 'text-blue-400' : ''}`}
                  onClick={() => requestSort('name')}
                >
                  <div className="flex items-center gap-1">
                    <span>{t('leaderboard.name')}</span>
                    <SortIcon columnKey="name" />
                  </div>
                </th>
                <th
                  className={`py-2 px-1 md:px-2 font-semibold w-[72px] md:w-[90px] cursor-pointer hover:bg-slate-700/50 transition-colors select-none ${sortConfig.key === 'level' ? 'text-blue-400' : ''}`}
                  onClick={() => requestSort('level')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-right inline-block">{t('leaderboard.level')}</span>
                    <SortIcon columnKey="level" />
                  </div>
                </th>
                <th
                  className={`py-2 px-1 md:px-2 font-semibold w-[72px] md:w-[90px] cursor-pointer hover:bg-slate-700/50 transition-colors select-none ${sortConfig.key === 'perfect_runs' ? 'text-blue-400' : ''}`}
                  onClick={() => requestSort('perfect_runs')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <Check className="w-4 h-4 inline-block" />
                    <SortIcon columnKey="perfect_runs" />
                  </div>
                </th>
                <th
                  className={`py-2 px-1 md:px-2 font-semibold w-[72px] md:w-[90px] cursor-pointer hover:bg-slate-700/50 transition-colors select-none ${sortConfig.key === 'total_runs' ? 'text-blue-400' : ''}`}
                  onClick={() => requestSort('total_runs')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-right inline-block">{t('leaderboard.total')}</span>
                    <SortIcon columnKey="total_runs" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {sortedOverviewData.map((user, index) => {
                const isClickable = Boolean(onSelectUser)
                return (
                  <tr
                    key={user.user_id}
                    onClick={isClickable ? () => onSelectUser(user) : undefined}
                    className={`transition-colors group text-sm md:text-base ${isClickable ? 'hover:bg-slate-700/30 cursor-pointer' : ''}`}
                  >
                    <td className="py-3 px-1 md:px-2 text-right">
                      <span className="font-mono text-slate-400 font-bold">{index + 1}</span>
                    </td>
                    <td className="py-3 px-2 truncate min-w-0">
                      <span className="font-semibold text-blue-300 transition-colors group-hover:text-amber-400">{user.username}</span>
                    </td>
                    <td className="py-3 px-1 md:px-2 text-right">
                      <span className="font-mono font-black text-amber-400 whitespace-nowrap">L{user.current_level_cap}</span>
                    </td>
                    <td className="py-3 px-1 md:px-2 text-right">
                      <span className="font-mono text-emerald-400 font-bold">{user.total_perfect_runs}</span>
                    </td>
                    <td className="py-3 px-1 md:px-2 text-right">
                      <span className="font-mono text-slate-300">{user.total_runs}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
