import { useState, useEffect } from 'react'
import { useAdminStats } from '../../lib/hooks/useAdminStats'
import type { AdminUserOverview } from '../../lib/hooks/useAdminStats'
import { Button } from '../../components/ui/Button'
import { LogOut, ArrowLeft, Trophy, Flag, Timer, ChevronUp, ChevronDown, Check, Calendar, Clock, XCircle, SlidersHorizontal, ListPlus, ChartColumnBig, GraduationCap } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { GlobalLeaderboardTable } from './GlobalLeaderboardTable'
import { AdminSettingsPanel } from './AdminSettingsPanel'
import { AdminVerbsPanel } from './AdminVerbsPanel'
import { useTranslation } from '../../lib/hooks/useTranslation'
import { useAdminPreviewStore } from '../../lib/stores/useAdminPreviewStore'

export function AdminDashboard() {
    const { signOut } = useAuth()
    const { t } = useTranslation()
    const setPreviewAsStudent = useAdminPreviewStore((state) => state.setPreviewAsStudent)
    const {
        detailsData,
        isLoadingDetails,
        fetchUserDetails,
        levelRunsData,
        levelVerbs,
        isLoadingLevelRuns,
        fetchUserLevelRuns
    } = useAdminStats()

    const [selectedUser, setSelectedUser] = useState<AdminUserOverview | null>(null)
    const [selectedLevel, setSelectedLevel] = useState<number | null>(null)
    type AdminTab = 'stats' | 'settings' | 'verbs'
    const [activeTab, setActiveTab] = useState<AdminTab>('stats')

    // Fetch details when user selected
    useEffect(() => {
        if (selectedUser && selectedLevel === null) {
            fetchUserDetails(selectedUser.user_id)
        }
    }, [selectedUser, selectedLevel, fetchUserDetails])

    // Fetch level runs when level is selected
    useEffect(() => {
        if (selectedUser && selectedLevel !== null) {
            fetchUserLevelRuns(selectedUser.user_id, selectedLevel)
        }
    }, [selectedUser, selectedLevel, fetchUserLevelRuns])

    const handleBackToOverview = () => {
        setSelectedUser(null)
        setSelectedLevel(null)
    }

    const handleBackToDetails = () => {
        setSelectedLevel(null)
    }

    type DetailsSortKey = 'level' | 'rank' | 'perfect_runs' | 'total_runs' | 'best_time'
    const [detailsSortConfig, setDetailsSortConfig] = useState<{ key: DetailsSortKey, direction: 'desc' | 'asc' }>({ key: 'level', direction: 'asc' })

    const requestDetailsSort = (key: DetailsSortKey) => {
        let direction: 'desc' | 'asc' = 'desc'
        if (detailsSortConfig.key === key && detailsSortConfig.direction === 'desc') {
            direction = 'asc'
        }
        setDetailsSortConfig({ key, direction })
    }

    const sortedDetailsData = [...detailsData].sort((a, b) => {
        const directionMultiplier = detailsSortConfig.direction === 'asc' ? 1 : -1

        const compareNum = (valA: number, valB: number) => {
            if (valA < valB) return -1
            if (valA > valB) return 1
            return 0
        }

        let result = 0;
        if (detailsSortConfig.key === 'level') {
            if (a.level_attempted !== b.level_attempted) result = compareNum(a.level_attempted, b.level_attempted)
            else result = compareNum(a.perfect_runs, b.perfect_runs)
        } else if (detailsSortConfig.key === 'rank') {
            const rankA = a.global_rank || Infinity
            const rankB = b.global_rank || Infinity
            result = compareNum(rankA, rankB)
        } else if (detailsSortConfig.key === 'perfect_runs') {
            if (a.perfect_runs !== b.perfect_runs) result = compareNum(a.perfect_runs, b.perfect_runs)
            else result = compareNum(a.level_attempted, b.level_attempted)
        } else if (detailsSortConfig.key === 'total_runs') {
            if (a.total_runs !== b.total_runs) result = compareNum(a.total_runs, b.total_runs)
            else result = compareNum(a.level_attempted, b.level_attempted)
        } else if (detailsSortConfig.key === 'best_time') {
            const timeA = a.best_time_seconds || Infinity
            const timeB = b.best_time_seconds || Infinity
            result = compareNum(timeA, timeB)
        }

        return result * directionMultiplier
    })

    const renderDetailsSortIcon = (columnKey: DetailsSortKey) => {
        if (detailsSortConfig.key !== columnKey) return null
        return detailsSortConfig.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5 shrink-0 ml-[2px]" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0 ml-[2px]" />
    }

    // Date formatting helper
    const formatDate = (dateString: string) => {
        const d = new Date(dateString)
        const day = d.getDate().toString().padStart(2, '0')
        const month = (d.getMonth() + 1).toString().padStart(2, '0')
        const year = d.getFullYear()
        return `${day}/${month}/${year}`
    }

    // Time formatting helper
    const formatTime = (dateString: string) => {
        const d = new Date(dateString)
        const hours = d.getHours().toString().padStart(2, '0')
        const minutes = d.getMinutes().toString().padStart(2, '0')
        const seconds = d.getSeconds().toString().padStart(2, '0')
        return `${hours}:${minutes}:${seconds}`
    }

    return (
        <div className="h-screen overflow-hidden bg-slate-900 text-slate-200 p-2 md:p-4 font-sans flex flex-col">
            <div className="max-w-6xl mx-auto w-full flex flex-col h-full space-y-2 md:space-y-4">

                {/* Header */}
                <div className="flex justify-between items-center px-2">
                    <div>
                        <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-blue-500 tracking-tight">
                            {t('admin.title')}
                        </h1>
                        <p className="text-sm text-slate-400 font-medium">{t('admin.subtitle')}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => setPreviewAsStudent(true)}
                            className="flex gap-2"
                        >
                            <GraduationCap className="w-4 h-4" />
                            {t('admin.preview_as_student')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={signOut} className="flex gap-2">
                            <LogOut className="w-4 h-4" />
                            {t('auth.signout')}
                        </Button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden shadow-xl flex-1 flex flex-col min-h-0">
                    <div className="shrink-0 border-b border-slate-700/70 px-2 md:px-4 py-2 md:py-3">
                        <div className="inline-flex w-full sm:w-auto rounded-lg border border-slate-700 bg-slate-900/40 p-1 gap-1">
                            <button
                                onClick={() => setActiveTab('stats')}
                                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs md:text-sm font-bold tracking-wide transition-colors ${activeTab === 'stats'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-300 hover:bg-slate-700/70 hover:text-white'
                                    }`}
                            >
                                <ChartColumnBig className="w-4 h-4" />
                                {t('admin.tab.stats')}
                            </button>
                            <button
                                onClick={() => setActiveTab('settings')}
                                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs md:text-sm font-bold tracking-wide transition-colors ${activeTab === 'settings'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-300 hover:bg-slate-700/70 hover:text-white'
                                    }`}
                            >
                                <SlidersHorizontal className="w-4 h-4" />
                                {t('admin.tab.settings')}
                            </button>
                            <button
                                onClick={() => setActiveTab('verbs')}
                                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs md:text-sm font-bold tracking-wide transition-colors ${activeTab === 'verbs'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-300 hover:bg-slate-700/70 hover:text-white'
                                    }`}
                            >
                                <ListPlus className="w-4 h-4" />
                                {t('admin.tab.verbs')}
                            </button>
                        </div>
                    </div>

                    {activeTab === 'stats' && (
                        <>
                            {/* VIEW 1: Overview */}
                            {!selectedUser && (
                                <GlobalLeaderboardTable onSelectUser={setSelectedUser} />
                            )}

                            {/* VIEW 2: Detail Drill-down */}
                            {selectedUser && selectedLevel === null && (
                                <div className="flex-1 flex flex-col">
                                    {/* Detail Header */}
                                    <div className="bg-slate-800 border-b border-slate-700 p-2 md:px-4 md:py-3 flex items-center justify-between">
                                        <Button variant="ghost" size="sm" onClick={handleBackToOverview} className="text-slate-400 hover:text-white px-1">
                                            <ArrowLeft className="w-5 h-5 mr-1" />
                                            {t('home.back')}
                                        </Button>
                                        <div className="flex items-center gap-4">
                                            <div className="hidden md:flex gap-4 text-sm font-medium">
                                                <div className="px-3 py-1 bg-slate-900 rounded-lg border border-slate-700 flex gap-2 items-center text-slate-300">
                                                    <Flag className="w-4 h-4 text-slate-500" /> {t('admin.total_runs')}: <span className="text-white font-mono">{selectedUser.total_runs}</span>
                                                </div>
                                                <div className="px-3 py-1 bg-emerald-950/30 rounded-lg border border-emerald-900/50 flex gap-2 items-center text-emerald-200">
                                                    <Trophy className="w-4 h-4 text-emerald-600" /> {t('admin.perfect')}: <span className="text-emerald-400 font-mono">{selectedUser.total_perfect_runs}</span>
                                                </div>
                                            </div>
                                            <h2 className="text-xl md:text-2xl font-black text-amber-400 drop-shadow-sm tracking-wide text-right">
                                                {selectedUser.username}
                                            </h2>
                                        </div>
                                    </div>

                                    <div className="p-2 md:p-4 flex-1 flex flex-col min-h-0 relative">
                                        {isLoadingDetails ? (
                                            <div className="flex-1 flex justify-center items-center py-12">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                                            </div>
                                        ) : detailsData.length === 0 ? (
                                            <div className="flex-1 flex justify-center items-center py-12 text-slate-500">
                                                {t('admin.player_no_levels')}
                                            </div>
                                        ) : (
                                            <div className="absolute inset-0 overflow-y-auto mt-2 md:mt-4 mx-2 md:mx-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                                <table className="w-full text-left border-collapse table-auto">
                                                    <thead className="sticky top-0 bg-slate-800 z-10 shadow-sm border-b border-slate-700/80">
                                                        <tr className="text-slate-400 text-xs md:text-sm uppercase tracking-wider">
                                                            <th
                                                                className={`py-2 px-1 font-semibold cursor-pointer hover:bg-slate-700/50 transition-colors select-none w-[6ch] ${detailsSortConfig.key === 'level' ? 'text-blue-400' : ''}`}
                                                                onClick={() => requestDetailsSort('level')}
                                                            >
                                                                <div className="flex items-center gap-0.5">
                                                                    <span>{t('leaderboard.level')}</span>
                                                                    {renderDetailsSortIcon('level')}
                                                                </div>
                                                            </th>
                                                            <th
                                                                className={`py-2 px-1 font-semibold cursor-pointer hover:bg-slate-700/50 transition-colors select-none w-[6ch] ${detailsSortConfig.key === 'rank' ? 'text-blue-400' : ''}`}
                                                                onClick={() => requestDetailsSort('rank')}
                                                            >
                                                                <div className="flex items-center justify-end gap-0.5">
                                                                    <span className="text-right inline-block">{t('admin.rank')}</span>
                                                                    {renderDetailsSortIcon('rank')}
                                                                </div>
                                                            </th>
                                                            <th
                                                                className={`py-2 px-1 font-semibold cursor-pointer hover:bg-slate-700/50 transition-colors select-none w-[6ch] ${detailsSortConfig.key === 'perfect_runs' ? 'text-blue-400' : ''}`}
                                                                onClick={() => requestDetailsSort('perfect_runs')}
                                                            >
                                                                <div className="flex items-center justify-end gap-0.5">
                                                                    <Check className="w-4 h-4 inline-block" />
                                                                    {renderDetailsSortIcon('perfect_runs')}
                                                                </div>
                                                            </th>
                                                            <th
                                                                className={`py-2 px-1 font-semibold cursor-pointer hover:bg-slate-700/50 transition-colors select-none w-[6ch] ${detailsSortConfig.key === 'total_runs' ? 'text-blue-400' : ''}`}
                                                                onClick={() => requestDetailsSort('total_runs')}
                                                            >
                                                                <div className="flex items-center justify-end gap-0.5">
                                                                    <span className="text-right inline-block">{t('admin.total')}</span>
                                                                    {renderDetailsSortIcon('total_runs')}
                                                                </div>
                                                            </th>
                                                            <th
                                                                className={`py-2 px-1 font-semibold cursor-pointer hover:bg-slate-700/50 transition-colors select-none w-[5ch] ${detailsSortConfig.key === 'best_time' ? 'text-blue-400' : ''}`}
                                                                onClick={() => requestDetailsSort('best_time')}
                                                            >
                                                                <div className="flex items-center justify-end gap-0.5 text-right">
                                                                    <Timer className="w-4 h-4 inline-block" />
                                                                    {renderDetailsSortIcon('best_time')}
                                                                </div>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-700/30">
                                                        {sortedDetailsData.map((stat) => {
                                                            const mins = stat.best_time_seconds ? Math.floor(stat.best_time_seconds / 60) : 0
                                                            const secs = stat.best_time_seconds ? stat.best_time_seconds % 60 : 0
                                                            const timeString = stat.best_time_seconds ? `${mins}:${secs.toString().padStart(2, '0')}` : '--:--'

                                                            return (
                                                                <tr
                                                                    key={stat.level_attempted}
                                                                    onClick={() => setSelectedLevel(stat.level_attempted)}
                                                                    className="hover:bg-slate-700/50 cursor-pointer transition-colors group text-sm md:text-base relative overflow-hidden"
                                                                >
                                                                    <td className="py-3 px-1 truncate min-w-0">
                                                                        <span className="font-semibold text-blue-300 group-hover:text-white transition-colors">L{stat.level_attempted}</span>
                                                                    </td>
                                                                    <td className="py-3 px-1 text-right">
                                                                        {stat.global_rank ? (
                                                                            <span className="font-black text-amber-400 text-sm whitespace-nowrap">#{stat.global_rank}</span>
                                                                        ) : (
                                                                            <span className="text-slate-600">-</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-3 px-1 text-right">
                                                                        <span className="font-mono text-emerald-400 font-bold">{stat.perfect_runs}</span>
                                                                    </td>
                                                                    <td className="py-3 px-1 text-right">
                                                                        <span className="font-mono text-slate-300">{stat.total_runs}</span>
                                                                    </td>
                                                                    <td className="py-3 px-1 text-right">
                                                                        <span className="font-mono font-bold text-blue-300">{stat.best_time_seconds ? timeString : '-'}</span>
                                                                    </td>
                                                                </tr>
                                                            )
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* VIEW 3: Level Runs Detail View */}
                            {selectedUser && selectedLevel !== null && (
                                <div className="flex-1 flex flex-col min-h-0">
                                    {/* Level Header */}
                                    <div className="bg-slate-800 border-b border-slate-700 p-2 md:px-4 md:py-3 flex items-center justify-between shrink-0">
                                        <Button variant="ghost" size="sm" onClick={handleBackToDetails} className="text-slate-400 hover:text-white px-1">
                                            <ArrowLeft className="w-5 h-5 mr-1" />
                                            {t('home.back')}
                                        </Button>
                                        <div className="flex items-center gap-3 md:gap-4">
                                            <div className="px-3 py-1 bg-slate-900 rounded-lg border border-slate-700 flex gap-2 items-center text-slate-300">
                                                <span className="text-xs uppercase font-bold tracking-wider text-slate-500">{t('admin.level')}</span>
                                                <span className="text-white font-mono font-bold">{selectedLevel}</span>
                                            </div>
                                            <h2 className="text-xl md:text-2xl font-black text-amber-400 drop-shadow-sm tracking-wide text-right">
                                                {selectedUser.username}
                                            </h2>
                                        </div>
                                    </div>

                                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                        {isLoadingLevelRuns ? (
                                            <div className="flex-1 flex justify-center items-center">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex flex-col min-h-0">
                                                {/* Compact Verbs Strip */}
                                                <div className="px-3 py-2 shrink-0 border-b border-slate-700/50">
                                                    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                                        <Flag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                        {levelVerbs.map((verb, i) => (
                                                            <span key={verb.id} className="text-sm text-blue-300 font-medium">
                                                                {verb.infinitive}{i < levelVerbs.length - 1 ? ',' : ''}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Runs Table */}
                                                {levelRunsData.length === 0 ? (
                                                    <div className="flex-1 flex justify-center items-center text-slate-500">
                                                        {t('admin.no_runs_for_level')}
                                                    </div>
                                                ) : (
                                                    <div className="flex-1 flex flex-col min-h-0">
                                                        <table className="w-full text-left border-collapse table-fixed">
                                                            <thead className="bg-slate-800/80 border-b border-slate-700/80 sticky top-0 z-10">
                                                                <tr className="text-slate-400 text-xs md:text-sm uppercase tracking-wider">
                                                                    <th className="py-3 px-3 md:px-4 font-semibold w-[100px] md:w-[130px]">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Calendar className="w-4 h-4 text-blue-400/70" />
                                                                            <span>{t('admin.date')}</span>
                                                                        </div>
                                                                    </th>
                                                                    <th className="py-3 px-2 md:px-4 font-semibold w-[80px] md:w-[110px]">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Clock className="w-4 h-4 text-emerald-400/70" />
                                                                            <span>{t('admin.time')}</span>
                                                                        </div>
                                                                    </th>
                                                                    <th className="py-3 px-2 md:px-4 font-semibold w-[80px] md:w-[100px] text-right">
                                                                        <div className="flex items-center justify-end gap-1.5">
                                                                            <span>{t('admin.duration')}</span>
                                                                        </div>
                                                                    </th>
                                                                    <th className="py-3 px-3 md:px-4 font-semibold w-[60px] md:w-[90px] text-right">
                                                                        <div className="flex items-center justify-end gap-1.5">
                                                                            <XCircle className="w-4 h-4 text-rose-400/70" />
                                                                            <span className="hidden md:inline">{t('admin.errors')}</span>
                                                                            <span className="md:hidden">{t('admin.err')}</span>
                                                                        </div>
                                                                    </th>
                                                                </tr>
                                                            </thead>
                                                        </table>
                                                        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                                            <table className="w-full text-left border-collapse table-fixed">
                                                                <tbody className="divide-y divide-slate-700/30">
                                                                    {levelRunsData.map((run, index) => {
                                                                        const mins = Math.floor(run.duration_seconds / 60)
                                                                        const secs = run.duration_seconds % 60
                                                                        const isPerfect = run.errors_count === 0 && run.is_perfect_run

                                                                        return (
                                                                            <tr key={index} className={`hover:bg-slate-700/20 transition-colors text-sm md:text-base ${isPerfect ? 'bg-emerald-950/10' : ''}`}>
                                                                                <td className="py-3 px-3 md:px-4 font-mono text-slate-300 w-[100px] md:w-[130px]">
                                                                                    {formatDate(run.client_timestamp_start)}
                                                                                </td>
                                                                                <td className="py-3 px-2 md:px-4 font-mono text-slate-400 w-[80px] md:w-[110px]">
                                                                                    {formatTime(run.client_timestamp_start)}
                                                                                </td>
                                                                                <td className="py-3 px-2 md:px-4 text-right w-[80px] md:w-[100px]">
                                                                                    <span className="font-mono font-medium text-amber-300/90">
                                                                                        {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="py-3 px-3 md:px-4 text-right w-[60px] md:w-[90px]">
                                                                                    {run.errors_count === 0 ? (
                                                                                        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold bg-emerald-400/10 px-2 py-0.5 rounded">
                                                                                            <Check className="w-3.5 h-3.5" /> 0
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-rose-400 font-bold font-mono">
                                                                                            {run.errors_count}
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'settings' && (
                        <AdminSettingsPanel />
                    )}

                    {activeTab === 'verbs' && (
                        <AdminVerbsPanel />
                    )}
                </div>
            </div>

        </div>
    )
}
