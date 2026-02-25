import { useGameStore } from '../../lib/stores/useGameStore'
import { useState } from 'react'

export function MockDashboard() {
    const [isOpen, setIsOpen] = useState(false)
    const [mockResult, setMockResult] = useState<any>(null)

    const simulateCase = async (caseNum: number, currentCap: number, levelToRun: number, isPerfect: boolean, onTime: boolean) => {
        // We can simulate the DB response directly or call the mock JS logic
        // The prompt requires to implement "this exact behavior" using mock data

        // Calculate outcome based on rules
        let newCap = currentCap
        let status = ''

        if (onTime && isPerfect) {
            status = levelToRun === 18 ? 'unlocked_master' : 'unlocked'
            newCap = Math.min(18, Math.max(currentCap, levelToRun + 1))
        } else if (onTime && !isPerfect) {
            status = 'maintained'
        } else {
            status = 'downgraded'
            newCap = Math.max(1, currentCap - 1)
        }

        setMockResult({ caseNum, currentCap, levelToRun, isPerfect, onTime, newCap, status })

        // Simulate Zustand Store update so the UI reflects it
        useGameStore.setState({
            session: {
                ...useGameStore.getState().session,
                level: levelToRun,
                status: 'FINISHED'
            },
            gameplay: {
                ...useGameStore.getState().gameplay,
                errorsInLevel: isPerfect ? 0 : onTime ? 3 : 999
            }
        })
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 left-4 bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg z-50 hover:bg-purple-500 transition-all opacity-50 hover:opacity-100"
            >
                Mock Cases
            </button>
        )
    }

    return (
        <div className="fixed bottom-4 left-4 bg-slate-900 border border-purple-500/50 text-white p-4 rounded-xl shadow-2xl z-50 flex flex-col gap-2 w-80">
            <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-purple-400 uppercase tracking-widest text-sm">Browser Mock Test</h3>
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">&times;</button>
            </div>

            <button onClick={() => simulateCase(1, 3, 3, true, true)} className="bg-slate-800 hover:bg-slate-700 text-left p-2 rounded border border-slate-700 text-xs">
                <span className="font-bold text-emerald-400">Case 1:</span> Max Lvl 3, Runs Lvl 3, Perfect + On Time
            </button>

            <button onClick={() => simulateCase(2, 3, 3, false, true)} className="bg-slate-800 hover:bg-slate-700 text-left p-2 rounded border border-slate-700 text-xs">
                <span className="font-bold text-yellow-400">Case 2:</span> Max Lvl 3, Runs Lvl 3, Errors + On Time
            </button>

            <button onClick={() => simulateCase(3, 3, 3, false, false)} className="bg-slate-800 hover:bg-slate-700 text-left p-2 rounded border border-slate-700 text-xs">
                <span className="font-bold text-red-400">Case 3:</span> Max Lvl 3, Runs Lvl 3, Not On Time
            </button>

            <button onClick={() => simulateCase(4, 1, 1, false, false)} className="bg-slate-800 hover:bg-slate-700 text-left p-2 rounded border border-slate-700 text-xs">
                <span className="font-bold text-red-500">Case 4:</span> Max Lvl 1, Runs Lvl 1, Not On Time
            </button>

            <button onClick={() => simulateCase(5, 18, 18, true, true)} className="bg-slate-800 hover:bg-slate-700 text-left p-2 rounded border border-slate-700 text-xs">
                <span className="font-bold text-yellow-300">Case 5:</span> Max Lvl 18, Runs Lvl 18, Perfect + On Time
            </button>

            {mockResult && (
                <div className="mt-4 p-3 bg-black/50 rounded border border-slate-700 text-xs space-y-1">
                    <p className="font-bold text-purple-300">Mock Result (Case {mockResult.caseNum})</p>
                    <p>Initial Cap: {mockResult.currentCap}</p>
                    <p>Level Played: {mockResult.levelToRun}</p>
                    <p>Outcome Status: <span className="text-white font-bold">{mockResult.status}</span></p>
                    <p>New Level Cap: <span className="text-emerald-400 font-bold">{mockResult.newCap}</span></p>
                </div>
            )}
        </div>
    )
}
