import { Languages } from 'lucide-react'
import { useSettingsStore } from '../../lib/stores/useSettingsStore'
import { Button } from './Button'

export function LanguageSwitcher() {
    const { language, toggleLanguage } = useSettingsStore()

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={toggleLanguage}
            className="flex items-center justify-center gap-1.5 bg-slate-800/80 backdrop-blur px-2 py-1.5 sm:px-3 shadow-sm transition-colors hover:bg-slate-700 hover:text-white"
            title={language === 'en' ? 'Switch to Spanish' : 'Cambiar a Inglés'}
        >
            <Languages className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-[10px] sm:text-xs uppercase text-slate-200">{language}</span>
        </Button>
    )
}
