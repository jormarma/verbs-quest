
import { useSettingsStore } from '../../lib/stores/useSettingsStore'
import { Button } from './Button'

export function LanguageSwitcher() {
    const { language, toggleLanguage } = useSettingsStore()

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={toggleLanguage}
            className="w-10 sm:w-12 h-8 sm:h-9 px-0 sm:px-0 text-slate-400 hover:text-white"
            title={language === 'en' ? 'Switch to Spanish' : 'Cambiar a Inglés'}
        >
            <span className="font-bold text-xs sm:text-sm">{language === 'en' ? 'EN' : 'ES'}</span>
        </Button>
    )
}
