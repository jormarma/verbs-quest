import { RefreshCw, X } from 'lucide-react'
import { useAppUpdate } from '../../lib/hooks/useAppUpdate'
import { useTranslation } from '../../lib/hooks/useTranslation'

export function UpdateBanner() {
    const { needRefresh, updateApp, dismissUpdate } = useAppUpdate()
    const { t } = useTranslation()

    if (!needRefresh) return null

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-900/80 border border-emerald-500/60 rounded-xl text-emerald-100 text-sm font-semibold shadow-[0_0_30px_rgba(52,211,153,0.25)] backdrop-blur-md">
                <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" style={{ animationDuration: '3s' }} />
                <span className="tracking-wide">{t('update.available')}</span>
                <button
                    onClick={updateApp}
                    className="ml-1 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold text-xs rounded-md uppercase tracking-wider transition-colors"
                >
                    {t('update.action')}
                </button>
                <button
                    onClick={dismissUpdate}
                    className="ml-1 p-1 text-emerald-400/70 hover:text-emerald-200 transition-colors"
                    aria-label="Dismiss"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
