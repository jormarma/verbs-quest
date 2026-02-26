import { en, es, verbTranslationsEs } from '../i18n/translations'
import { useSettingsStore } from '../stores/useSettingsStore'

export function useTranslation() {
    const language = useSettingsStore((state) => state.language)

    const t = (key: string, variables?: Record<string, string | number>) => {
        const dict = language === 'es' ? es : en
        let translated = dict[key] || en[key] || key

        if (variables) {
            for (const [k, v] of Object.entries(variables)) {
                translated = translated.replace(`{${k}}`, String(v))
            }
        }
        return translated
    }

    const tVerb = (infinitive: string) => {
        return verbTranslationsEs[infinitive] || null
    }

    return { t, tVerb, language }
}
